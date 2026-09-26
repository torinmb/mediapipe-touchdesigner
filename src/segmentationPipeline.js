// Segmentation inference, colour composition and binary packing. Contains no
// DOM access so it runs inside segmentationWorker.js, and on the page's main
// thread as the fallback when the worker is unavailable.

import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const SEGMENTATION_MAGIC = [0x4d, 0x50, 0x53, 0x47]; // "MPSG"
export const SEGMENTATION_HEADER_BYTES = 72;

const SEGMENTATION_PROTOCOL_VERSION = 2;
const DTYPE_UINT8 = 1;
const DTYPE_FLOAT32 = 2;
const LAYOUT_HWC = 3;
const MAX_GPU_COLOR_MASKS = 6;

export const COLORED_OUTPUT_FLOAT32 = "float32";
export const COLORED_OUTPUT_UINT8 = "uint8";

export const SEGMENTATION_MODE_CONFIDENCE = 1;
export const SEGMENTATION_MODE_COLORED = 2;

// Header flags (uint16 at byte 14).
const FLAG_ZLIB = 0x0001;
// Only send the compressed form when it is meaningfully smaller. Masks that
// barely compress (e.g. DeepLab's CPU-composited float32 output) go raw.
const MIN_COMPRESSION_SAVING = 0.1;
// After a mask fails to compress well, send raw for this many packets before
// trying again, so incompressible models do not pay the compression cost.
const COMPRESSION_RETRY_INTERVAL = 30;

// zlib format (RFC 1950), which Python's zlib.decompress() reads directly.
async function deflate(bytes) {
    const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Segmentation compositor shader failed: ${message}`);
    }
    return shader;
}

function createGpuCompositor(canvas, width, height, outputFormat) {
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        console.warn("WebGL2 segmentation compositor is unavailable");
        return undefined;
    }

    if (
        outputFormat === COLORED_OUTPUT_FLOAT32 &&
        !gl.getExtension("EXT_color_buffer_float")
    ) {
        console.warn("RGBA32F rendering is unavailable; using CPU composition");
        return undefined;
    }

    const vertexShader = compileShader(
        gl,
        gl.VERTEX_SHADER,
        `#version 300 es
        precision highp float;
        out vec2 textureCoords;

        void main() {
            vec2 position = vec2(
                float((gl_VertexID << 1) & 2),
                float(gl_VertexID & 2)
            );
            // Keep the raw MediaPipe/NumPy row orientation. TouchDesigner can
            // apply the same downstream Y flip for every segmentation mode.
            textureCoords = position;
            gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
        }
        `,
    );
    const fragmentShader = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        `#version 300 es
        precision highp float;
        in vec2 textureCoords;
        uniform sampler2D masks[${MAX_GPU_COLOR_MASKS}];
        uniform vec4 colors[${MAX_GPU_COLOR_MASKS}];
        uniform int maskCount;
        out vec4 outputColor;

        void main() {
            vec4 color = vec4(0.0);
            if (maskCount > 0) color += texture(masks[0], textureCoords).r * colors[0];
            if (maskCount > 1) color += texture(masks[1], textureCoords).r * colors[1];
            if (maskCount > 2) color += texture(masks[2], textureCoords).r * colors[2];
            if (maskCount > 3) color += texture(masks[3], textureCoords).r * colors[3];
            if (maskCount > 4) color += texture(masks[4], textureCoords).r * colors[4];
            if (maskCount > 5) color += texture(masks[5], textureCoords).r * colors[5];
            outputColor = color;
        }
        `,
    );

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Segmentation compositor program failed: ${message}`);
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const isFloat32 = outputFormat === COLORED_OUTPUT_FLOAT32;
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        isFloat32 ? gl.RGBA32F : gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        isFloat32 ? gl.FLOAT : gl.UNSIGNED_BYTE,
        null,
    );

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        gl.deleteProgram(program);
        throw new Error("Segmentation compositor framebuffer is incomplete");
    }

    const vertexArray = gl.createVertexArray();
    const readback = isFloat32
        ? new Float32Array(width * height * 4)
        : new Uint8Array(width * height * 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
        gl,
        width,
        height,
        outputFormat,
        program,
        framebuffer,
        vertexArray,
        readback,
        masksLocation: gl.getUniformLocation(program, "masks[0]"),
        colorsLocation: gl.getUniformLocation(program, "colors[0]"),
        maskCountLocation: gl.getUniformLocation(program, "maskCount"),
    };
}

function resampleFloatMask(mask, width, height) {
    const source = mask.getAsFloat32Array();
    if (mask.width === width && mask.height === height) {
        return source;
    }

    const output = new Float32Array(width * height);
    const scaleX = mask.width / width;
    const scaleY = mask.height / height;

    // Bilinear fallback guarantees a native-sized packet even if a MediaPipe
    // implementation returns a mask resized to the source image dimensions.
    for (let y = 0; y < height; y++) {
        const sourceY = Math.min(mask.height - 1, (y + 0.5) * scaleY - 0.5);
        const y0 = Math.max(0, Math.floor(sourceY));
        const y1 = Math.min(mask.height - 1, y0 + 1);
        const yMix = Math.max(0, sourceY - y0);

        for (let x = 0; x < width; x++) {
            const sourceX = Math.min(mask.width - 1, (x + 0.5) * scaleX - 0.5);
            const x0 = Math.max(0, Math.floor(sourceX));
            const x1 = Math.min(mask.width - 1, x0 + 1);
            const xMix = Math.max(0, sourceX - x0);
            const top =
                source[y0 * mask.width + x0] * (1 - xMix) +
                source[y0 * mask.width + x1] * xMix;
            const bottom =
                source[y1 * mask.width + x0] * (1 - xMix) +
                source[y1 * mask.width + x1] * xMix;
            output[y * width + x] = top * (1 - yMix) + bottom * yMix;
        }
    }

    return output;
}

function buildConfidenceOutput(confidenceMasks, width, height) {
    const pixelCount = width * height;

    if (confidenceMasks.length === 1) {
        return {
            data: resampleFloatMask(confidenceMasks[0], width, height),
            channels: 1,
            dtype: DTYPE_FLOAT32,
            mode: SEGMENTATION_MODE_CONFIDENCE,
        };
    }

    // Multiclass models use mask zero for the background. Keep the probability
    // linear so TouchDesigner receives the highest-fidelity whole-person matte.
    const background = resampleFloatMask(confidenceMasks[0], width, height);
    const foreground = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        foreground[i] = 1 - Math.min(1, Math.max(0, background[i]));
    }

    return {
        data: foreground,
        channels: 1,
        dtype: DTYPE_FLOAT32,
        mode: SEGMENTATION_MODE_CONFIDENCE,
    };
}

function buildColoredOutput(confidenceMasks, width, height, legendColors) {
    const pixelCount = width * height;
    const rgba = new Float32Array(pixelCount * 4);

    for (let maskIndex = 0; maskIndex < confidenceMasks.length; maskIndex++) {
        const mask = resampleFloatMask(
            confidenceMasks[maskIndex],
            width,
            height,
        );
        const color = legendColors[maskIndex] ?? [1, 1, 1, 1];

        for (let pixel = 0; pixel < pixelCount; pixel++) {
            const confidence = mask[pixel];
            const outputIndex = pixel * 4;
            rgba[outputIndex] += confidence * color[0];
            rgba[outputIndex + 1] += confidence * color[1];
            rgba[outputIndex + 2] += confidence * color[2];
            rgba[outputIndex + 3] += confidence * color[3];
        }
    }

    return {
        data: rgba,
        channels: 4,
        dtype: DTYPE_FLOAT32,
        mode: SEGMENTATION_MODE_COLORED,
    };
}

function copyPayload(target, data, byteOffset, dtype) {
    if (dtype === DTYPE_UINT8) {
        target.set(data, byteOffset);
        return;
    }

    // TouchDesigner runs on little-endian platforms, as do current Chromium
    // targets. Keep an explicit fallback so the wire format stays portable.
    const endianProbe = new Uint16Array([1]);
    const isLittleEndian = new Uint8Array(endianProbe.buffer)[0] === 1;
    if (isLittleEndian) {
        target.set(
            new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            byteOffset,
        );
        return;
    }

    const view = new DataView(target.buffer);
    for (let i = 0; i < data.length; i++) {
        view.setFloat32(byteOffset + i * 4, data[i], true);
    }
}

// Runs one segmentation model and delivers its masks through `send`, keeping
// at most `maxInFlight` packets awaiting TouchDesigner's segAck.
export class SegmentationProcessor {
    constructor(options) {
        this.wasmPath = options.wasmPath;
        this.modelPath = options.modelPath;
        this.width = options.width;
        this.height = options.height;
        this.coloredOutputFormat = options.coloredOutputFormat;
        this.legendColors = options.legendColors;
        this.maxInFlight = options.maxInFlight;
        this.ackTimeoutMs = options.ackTimeoutMs;
        this.send = options.send;
        this.compressionEnabled =
            options.compression === true &&
            typeof CompressionStream === "function";
        // Set once TouchDesigner advertises zlib support on this connection.
        this.peerSupportsZlib = false;
        this.compressionPausedUntil = 0;
        // Compression is asynchronous. Deliveries run one after another so
        // packets leave in sequence, while inference moves on to the next
        // frame. Pending deliveries count against maxInFlight.
        this.deliveryChain = Promise.resolve();
        this.pendingDeliveries = 0;
        // Every header timestamp is reported on the page's clock so that
        // TouchDesigner's latency calculations do not depend on which thread
        // produced the packet.
        this.reportTimeOriginMs = options.reportTimeOriginMs;
        this.clockOffsetMs = performance.timeOrigin - this.reportTimeOriginMs;

        this.segmenter = undefined;
        this.labels = [];
        this.processingCanvas = undefined;
        this.gpuCompositor = undefined;
        this.gpuCompositorDisabled = false;
        this.packetSequence = 0;
        // packetSequence -> send time, awaiting TouchDesigner's segAck.
        this.inFlightPackets = new Map();
        this.stats = {
            attemptedPackets: 0,
            sentPackets: 0,
            sendErrors: 0,
            packTimeMs: 0,
            acknowledgedPackets: 0,
            skippedInFlight: 0,
            ackTimeouts: 0,
            ackRoundTripMs: 0,
            packetBytes: 0,
            // Size before compression, and how many packets went compressed.
            rawPacketBytes: 0,
            compressedPackets: 0,
            inFlight: 0,
        };
    }

    now() {
        return performance.now() + this.clockOffsetMs;
    }

    async init() {
        const vision = await FilesetResolver.forVisionTasks(this.wasmPath);
        // GPU tasks require a canvas for their internal WebGL context. It is
        // never displayed.
        this.processingCanvas = new OffscreenCanvas(1, 1);
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: this.modelPath,
                delegate: "GPU",
            },
            canvas: this.processingCanvas,
            runningMode: "VIDEO",
            // Confidence masks retain the model's floating-point
            // probabilities. A category mask is uint8 and would discard the
            // soft edges of the mask.
            outputCategoryMask: false,
            outputConfidenceMasks: true,
        });
        this.labels = this.segmenter.getLabels();

        try {
            this.gpuCompositor = createGpuCompositor(
                this.processingCanvas,
                this.width,
                this.height,
                this.coloredOutputFormat,
            );
            this.gpuCompositorDisabled = !this.gpuCompositor;
        } catch (error) {
            this.gpuCompositor = undefined;
            this.gpuCompositorDisabled = true;
            console.warn(
                "GPU segmentation compositor initialization failed",
                error,
            );
        }
        return this.labels;
    }

    // Drops packets that were never acknowledged, then reports whether
    // another packet may be sent.
    canAccept() {
        const now = this.now();
        for (const [sequence, sentAtMs] of this.inFlightPackets) {
            if (now - sentAtMs >= this.ackTimeoutMs) {
                this.stats.ackTimeouts++;
                this.inFlightPackets.delete(sequence);
            }
        }
        this.stats.inFlight = this.inFlightPackets.size;
        if (
            this.inFlightPackets.size + this.pendingDeliveries >=
            this.maxInFlight
        ) {
            this.stats.skippedInFlight++;
            return false;
        }
        return true;
    }

    acknowledge(packetSequence) {
        if (!Number.isInteger(packetSequence)) {
            return;
        }
        const sequence = packetSequence >>> 0;
        const sentAtMs = this.inFlightPackets.get(sequence);
        if (sentAtMs === undefined) {
            return;
        }
        this.stats.acknowledgedPackets++;
        this.stats.ackRoundTripMs = Math.max(0, this.now() - sentAtMs);
        this.inFlightPackets.delete(sequence);
        this.stats.inFlight = this.inFlightPackets.size;
    }

    // Handles a text message from TouchDesigner on the segmentation socket.
    handleSocketText(text) {
        if (text === "ping" || text === "pong") {
            return;
        }
        let data;
        try {
            data = JSON.parse(text);
        } catch (error) {
            console.warn("Ignoring invalid segmentation socket message", error);
            return;
        }
        if (Object.prototype.hasOwnProperty.call(data, "segAck")) {
            this.acknowledge(Number(data.segAck));
        }
        if (data.segCapabilities) {
            this.peerSupportsZlib = Boolean(data.segCapabilities.zlib);
        }
    }

    // A new connection may be an older TouchDesigner without zlib support.
    resetConnection() {
        this.peerSupportsZlib = false;
        this.resetInFlight();
    }

    resetInFlight() {
        this.inFlightPackets.clear();
        this.stats.inFlight = 0;
    }

    // image must already be at the model's native size (width x height). It
    // is only read synchronously, so the caller may release it and submit the
    // next frame as soon as this returns; the returned promise settles once
    // the packet has been sent.
    process(image, frame) {
        const segmentationStartedMs = this.now();
        let packet = null;
        let completedMs = 0;
        let sequence = 0;
        this.segmenter.segmentForVideo(
            image,
            frame.mediaPipeTimestampMs,
            (results) => {
                // Masks are only valid inside this callback, so pack here.
                this.stats.attemptedPackets++;
                try {
                    completedMs = this.now();
                    this.packetSequence = (this.packetSequence + 1) >>> 0;
                    sequence = this.packetSequence;
                    packet = this.formatBinary(results, {
                        sourceFrame: frame.sourceFrame,
                        packetSequence: sequence,
                        sourceMediaTimeMs: frame.sourceMediaTimeMs,
                        mediaPipeTimestampMs: frame.mediaPipeTimestampMs,
                        segmentationStartedMs,
                        completedMs,
                        showMultiClassBackgroundOnly:
                            frame.showMultiClassBackgroundOnly,
                    });
                } catch (error) {
                    this.stats.sendErrors++;
                    console.error("Failed to pack segmentation output", error);
                }
            },
        );
        if (!packet) {
            return Promise.resolve();
        }
        this.pendingDeliveries++;
        this.deliveryChain = this.deliveryChain
            .then(() => this.deliver(packet, sequence, completedMs))
            .finally(() => {
                this.pendingDeliveries--;
            });
        return this.deliveryChain;
    }

    async deliver(packet, sequence, completedMs) {
        try {
            this.stats.rawPacketBytes = packet.byteLength;
            packet = await this.maybeCompress(packet, sequence);
            this.stats.packTimeMs = this.now() - completedMs;
            // Read the size first: sending may transfer the buffer.
            const packetBytes = packet.byteLength;
            if (this.send(packet)) {
                this.stats.sentPackets++;
                this.stats.packetBytes = packetBytes;
                this.inFlightPackets.set(sequence, this.now());
                this.stats.inFlight = this.inFlightPackets.size;
            }
        } catch (error) {
            this.stats.sendErrors++;
            console.error("Failed to send segmentation output", error);
        }
    }

    async maybeCompress(packet, sequence) {
        if (
            !this.compressionEnabled ||
            !this.peerSupportsZlib ||
            sequence < this.compressionPausedUntil
        ) {
            return packet;
        }

        const payload = new Uint8Array(packet, SEGMENTATION_HEADER_BYTES);
        const compressed = await deflate(payload);
        if (
            compressed.byteLength >
            payload.byteLength * (1 - MIN_COMPRESSION_SAVING)
        ) {
            this.compressionPausedUntil = sequence + COMPRESSION_RETRY_INTERVAL;
            return packet;
        }

        const output = new Uint8Array(
            SEGMENTATION_HEADER_BYTES + compressed.byteLength,
        );
        output.set(new Uint8Array(packet, 0, SEGMENTATION_HEADER_BYTES), 0);
        output.set(compressed, SEGMENTATION_HEADER_BYTES);
        const header = new DataView(output.buffer);
        header.setUint16(14, header.getUint16(14, true) | FLAG_ZLIB, true);
        // packetReadyMs: include compression in the reported packing time.
        header.setFloat64(56, this.now(), true);
        this.stats.compressedPackets++;
        return output.buffer;
    }

    buildGpuColoredOutput(confidenceMasks, width, height) {
        if (
            this.gpuCompositorDisabled ||
            confidenceMasks.length > MAX_GPU_COLOR_MASKS
        ) {
            return null;
        }

        let compositor = this.gpuCompositor;
        if (
            !compositor ||
            compositor.width !== width ||
            compositor.height !== height ||
            compositor.outputFormat !== this.coloredOutputFormat
        ) {
            compositor = createGpuCompositor(
                this.processingCanvas,
                width,
                height,
                this.coloredOutputFormat,
            );
            this.gpuCompositor = compositor;
            this.gpuCompositorDisabled = !compositor;
        }
        if (!compositor) {
            return null;
        }

        const {
            gl,
            program,
            framebuffer,
            vertexArray,
            readback,
            masksLocation,
            colorsLocation,
            maskCountLocation,
        } = compositor;

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);

        // Discard errors left by MediaPipe so the check below is specific to
        // this composition/readback pass.
        for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++) {}

        const colors = new Float32Array(MAX_GPU_COLOR_MASKS * 4);
        for (let i = 0; i < confidenceMasks.length; i++) {
            const maskTexture = confidenceMasks[i].getAsWebGLTexture();
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, maskTexture);
            colors.set(this.legendColors[i] ?? [1, 1, 1, 1], i * 4);
        }

        gl.uniform1iv(
            masksLocation,
            new Int32Array(
                Array.from({ length: MAX_GPU_COLOR_MASKS }, (_, index) => index),
            ),
        );
        gl.uniform4fv(colorsLocation, colors);
        gl.uniform1i(maskCountLocation, confidenceMasks.length);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        const isFloat32 = this.coloredOutputFormat === COLORED_OUTPUT_FLOAT32;
        gl.readPixels(
            0,
            0,
            width,
            height,
            gl.RGBA,
            isFloat32 ? gl.FLOAT : gl.UNSIGNED_BYTE,
            readback,
        );
        const error = gl.getError();

        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        if (error !== gl.NO_ERROR) {
            throw new Error(`Segmentation compositor readback failed: ${error}`);
        }

        return {
            data: readback,
            channels: 4,
            dtype: isFloat32 ? DTYPE_FLOAT32 : DTYPE_UINT8,
            mode: SEGMENTATION_MODE_COLORED,
        };
    }

    formatBinary(results, timing) {
        const confidenceMasks = results.confidenceMasks;
        if (!confidenceMasks?.length) {
            return null;
        }

        const width = this.width;
        const height = this.height;
        if (width > 0xffff || height > 0xffff) {
            throw new RangeError("Segmentation dimensions exceed uint16");
        }
        if (confidenceMasks.length > 0xff) {
            throw new RangeError("Segmentation mask count exceeds uint8");
        }

        const useColoredOutput =
            confidenceMasks.length > 1 && !timing.showMultiClassBackgroundOnly;
        let output;
        if (useColoredOutput) {
            try {
                output = this.buildGpuColoredOutput(
                    confidenceMasks,
                    width,
                    height,
                );
            } catch (error) {
                this.gpuCompositor = undefined;
                this.gpuCompositorDisabled = true;
                console.warn("GPU segmentation composition failed", error);
            }
            output ??= buildColoredOutput(
                confidenceMasks,
                width,
                height,
                this.legendColors,
            );
        } else {
            output = buildConfidenceOutput(confidenceMasks, width, height);
        }

        const packet = new Uint8Array(
            SEGMENTATION_HEADER_BYTES + output.data.byteLength,
        );
        packet.set(SEGMENTATION_MAGIC, 0);

        const header = new DataView(packet.buffer);
        header.setUint8(4, SEGMENTATION_PROTOCOL_VERSION);
        header.setUint8(5, output.dtype);
        header.setUint8(6, LAYOUT_HWC);
        header.setUint8(7, output.mode);
        header.setUint16(8, height, true);
        header.setUint16(10, width, true);
        header.setUint8(12, output.channels);
        header.setUint8(13, confidenceMasks.length);
        header.setUint16(14, 0, true);
        header.setUint32(16, timing.sourceFrame >>> 0, true);
        header.setUint32(20, timing.packetSequence >>> 0, true);
        header.setFloat64(24, timing.sourceMediaTimeMs, true);
        header.setFloat64(32, timing.mediaPipeTimestampMs, true);
        header.setFloat64(40, timing.segmentationStartedMs, true);
        header.setFloat64(48, timing.completedMs, true);

        copyPayload(packet, output.data, SEGMENTATION_HEADER_BYTES, output.dtype);
        // Record packing completion in the packet itself. This keeps the
        // packing duration associated with the exact mask instead of pairing
        // it later with telemetry arriving over the separate control socket.
        header.setFloat64(56, this.now(), true);
        // TouchDesigner combines this epoch with the monotonic timestamps above
        // to include socket/callback scheduling in end-to-end cache latency.
        header.setFloat64(64, this.reportTimeOriginMs, true);
        return packet.buffer;
    }
}
