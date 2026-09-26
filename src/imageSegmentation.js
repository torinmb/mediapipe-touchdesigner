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

// Use RGBA8 for the colored multiclass socket output. Change this one line to
// COLORED_OUTPUT_FLOAT32 to restore full-precision transport when needed.
const DEFAULT_COLORED_OUTPUT_FORMAT = COLORED_OUTPUT_UINT8;

export const SEGMENTATION_MODE_CONFIDENCE = 1;
export const SEGMENTATION_MODE_COLORED = 2;

const segmentationModelTypes = {
    selfieSquare:
        "./mediapipe/models/image_segmentation/selfie_segmenter.tflite",
    selfieLandscape:
        "./mediapipe/models/image_segmentation/selfie_segmenter_landscape.tflite",
    hairSegmenter:
        "./mediapipe/models/image_segmentation/hair_segmenter.tflite",
    selfieMulticlass:
        "./mediapipe/models/image_segmentation/selfie_multiclass_256x256.tflite",
    deepLabV3: "./mediapipe/models/image_segmentation/deeplab_v3.tflite",
};

const segmentationModelResolutions = {
    selfieSquare: { width: 256, height: 256 },
    selfieLandscape: { width: 256, height: 144 },
    hairSegmenter: { width: 512, height: 512 },
    selfieMulticlass: { width: 256, height: 256 },
    deepLabV3: { width: 257, height: 257 },
};

export const segmenterState = {
    modelTypes: segmentationModelTypes,
    detect: false,
    modelPath: segmentationModelTypes.selfieMulticlass,
    detector: undefined,
    landmarker: undefined,
    processingCanvas: undefined,
    inputCanvas: undefined,
    inputContext: undefined,
    gpuCompositor: undefined,
    gpuCompositorDisabled: false,
    outputWidth: 256,
    outputHeight: 256,
    // Whole-person confidence output always remains float32. If the GPU
    // compositor fails, the existing CPU fallback also emits float32.
    coloredOutputFormat: DEFAULT_COLORED_OUTPUT_FORMAT,
    labels: [],
    resultsName: "segmenterResults",
    attemptedPackets: 0,
    sentPackets: 0,
    sendErrors: 0,
    packetSequence: 0,
    lastPackTimeMs: 0,
    // packetSequence -> performance.now() when sent, awaiting TD's segAck.
    inFlightPackets: new Map(),
    acknowledgedPackets: 0,
    skippedInFlight: 0,
    ackTimeouts: 0,
    lastAckRoundTripMs: 0,
    lastPacketBytes: 0,
    legendColors: [
        [0, 0, 0, 0], // Background
        [193, 0, 32, 255], // Hair
        [255, 0, 255, 255], // Body skin
        [255, 197, 0, 255], // Face skin
        [0, 255, 0, 255], // Clothes
        [0, 225, 225, 255], // Accessories
        [255, 255, 255, 255], // Selfie
        [0, 0, 255, 255],
        [0, 0, 0, 255],
        [0, 125, 52, 255],
        [0, 83, 138, 255],
        [128, 62, 117, 255],
        [255, 104, 0, 255],
        [166, 189, 215, 255],
        [206, 162, 98, 255],
        [129, 112, 102, 255],
        [246, 118, 142, 255],
        [255, 112, 92, 255],
        [83, 55, 112, 255],
        [255, 142, 0, 255],
        [179, 40, 81, 255],
        [244, 200, 0, 255],
        [127, 24, 13, 255],
        [147, 170, 0, 255],
        [89, 51, 21, 255],
        [241, 58, 19, 255],
        [35, 44, 22, 255],
    ].map((color) => color.map((channel) => channel / 255)),
    showMultiClassBackgroundOnly: false,
};

export async function createImageSegmenter(WASM_PATH) {
    console.log("Starting image segmentation");
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const selectedModel = Object.entries(segmenterState.modelTypes).find(
        ([, path]) => path === segmenterState.modelPath,
    )?.[0];
    const nativeResolution =
        segmentationModelResolutions[selectedModel] ??
        segmentationModelResolutions.selfieMulticlass;
    segmenterState.outputWidth = nativeResolution.width;
    segmenterState.outputHeight = nativeResolution.height;

    // Supplying MediaPipe a frame at the model's own tensor size prevents the
    // task from upscaling its mask back to the webcam/output resolution.
    segmenterState.inputCanvas = document.createElement("canvas");
    segmenterState.inputCanvas.width = nativeResolution.width;
    segmenterState.inputCanvas.height = nativeResolution.height;
    segmenterState.inputContext = segmenterState.inputCanvas.getContext("2d");
    if (!segmenterState.inputContext) {
        throw new Error("Unable to create segmentation input canvas context");
    }
    segmenterState.inputContext.imageSmoothingEnabled = true;
    segmenterState.inputContext.imageSmoothingQuality = "high";

    // GPU tasks require a canvas for their internal WebGL context. This canvas
    // is intentionally never attached to the document or shown in the browser.
    const processingCanvas = document.createElement("canvas");
    segmenterState.processingCanvas = processingCanvas;
    const imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: segmenterState.modelPath,
            delegate: "GPU",
        },
        canvas: processingCanvas,
        runningMode: "VIDEO",
        // Confidence masks retain the model's floating-point probabilities. A
        // category mask is uint8 and would discard the soft edges of the mask.
        outputCategoryMask: false,
        outputConfidenceMasks: true,
    });

    segmenterState.labels = imageSegmenter.getLabels();
    try {
        segmenterState.gpuCompositorDisabled = false;
        segmenterState.gpuCompositor = createGpuCompositor(
            processingCanvas,
            nativeResolution.width,
            nativeResolution.height,
            segmenterState.coloredOutputFormat,
        );
        segmenterState.gpuCompositorDisabled =
            !segmenterState.gpuCompositor;
    } catch (error) {
        segmenterState.gpuCompositor = undefined;
        segmenterState.gpuCompositorDisabled = true;
        console.warn("GPU segmentation compositor initialization failed", error);
    }
    console.log(segmenterState.labels);
    return imageSegmenter;
}

export function prepareSegmentationInput(source) {
    const canvas = segmenterState.inputCanvas;
    const context = segmenterState.inputContext;
    if (!canvas || !context) {
        throw new Error("Segmentation input canvas is not initialized");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
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

function buildGpuColoredOutput(confidenceMasks, width, height) {
    if (
        segmenterState.gpuCompositorDisabled ||
        confidenceMasks.length > MAX_GPU_COLOR_MASKS
    ) {
        return null;
    }

    let compositor = segmenterState.gpuCompositor;
    if (
        !compositor ||
        compositor.width !== width ||
        compositor.height !== height ||
        compositor.outputFormat !== segmenterState.coloredOutputFormat
    ) {
        compositor = createGpuCompositor(
            segmenterState.processingCanvas,
            width,
            height,
            segmenterState.coloredOutputFormat,
        );
        segmenterState.gpuCompositor = compositor;
        segmenterState.gpuCompositorDisabled = !compositor;
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

    // Discard errors left by MediaPipe so the check below is specific to this
    // composition/readback pass.
    for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++) {}

    const colors = new Float32Array(MAX_GPU_COLOR_MASKS * 4);
    for (let i = 0; i < confidenceMasks.length; i++) {
        const maskTexture = confidenceMasks[i].getAsWebGLTexture();
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        colors.set(
            segmenterState.legendColors[i] ?? [1, 1, 1, 1],
            i * 4,
        );
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

    const isFloat32 =
        segmenterState.coloredOutputFormat === COLORED_OUTPUT_FLOAT32;
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

function buildColoredOutput(confidenceMasks, width, height) {
    const pixelCount = width * height;
    const rgba = new Float32Array(pixelCount * 4);

    for (let maskIndex = 0; maskIndex < confidenceMasks.length; maskIndex++) {
        const mask = resampleFloatMask(
            confidenceMasks[maskIndex],
            width,
            height,
        );
        const color = segmenterState.legendColors[maskIndex] ?? [1, 1, 1, 1];

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

export function formatSegmentationBinary(results, timing) {
    const confidenceMasks = results.confidenceMasks;
    if (!confidenceMasks?.length) {
        return null;
    }

    const width = segmenterState.outputWidth;
    const height = segmenterState.outputHeight;
    if (width > 0xffff || height > 0xffff) {
        throw new RangeError("Segmentation dimensions exceed uint16");
    }
    if (confidenceMasks.length > 0xff) {
        throw new RangeError("Segmentation mask count exceeds uint8");
    }

    const useColoredOutput =
        confidenceMasks.length > 1 &&
        !segmenterState.showMultiClassBackgroundOnly;
    let output;
    if (useColoredOutput) {
        try {
            output = buildGpuColoredOutput(confidenceMasks, width, height);
        } catch (error) {
            segmenterState.gpuCompositor = undefined;
            segmenterState.gpuCompositorDisabled = true;
            console.warn("GPU segmentation composition failed", error);
        }
        output ??= buildColoredOutput(confidenceMasks, width, height);
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
    // Record packing completion in the packet itself. This keeps the packing
    // duration associated with the exact mask instead of pairing it later with
    // telemetry arriving over the separate control socket.
    header.setFloat64(56, performance.now(), true);
    // TouchDesigner can combine this epoch with the monotonic timestamps above
    // to include socket/callback scheduling in end-to-end cache latency.
    const browserTimeOriginMs = Number.isFinite(performance.timeOrigin)
        ? performance.timeOrigin
        : Date.now() - performance.now();
    header.setFloat64(64, browserTimeOriginMs, true);
    return packet.buffer;
}
