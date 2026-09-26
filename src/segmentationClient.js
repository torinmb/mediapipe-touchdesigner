// Page-side handle for segmentation. Prefers segmentationWorker.js, which runs
// inference, packing and the /segmentation socket off the main thread. Falls
// back to running the same SegmentationProcessor on the main thread if the
// worker cannot start (for example an older embedded Chromium).
//
// Both variants expose: ready (Promise), canSubmit(), submit(source, frame),
// stats and labels.

import { SegmentationProcessor } from "./segmentationPipeline.js";

// One frame processing in the worker plus one waiting, so the worker starts
// the next frame as soon as it finishes instead of idling until the page's
// main thread is free to hand it another.
const MAX_WORKER_FRAMES = 2;

const EMPTY_STATS = {
    attemptedPackets: 0,
    sentPackets: 0,
    sendErrors: 0,
    packTimeMs: 0,
    acknowledgedPackets: 0,
    skippedInFlight: 0,
    ackTimeouts: 0,
    ackRoundTripMs: 0,
    packetBytes: 0,
    rawPacketBytes: 0,
    compressedPackets: 0,
    inFlight: 0,
    bufferedBytes: 0,
};

// Resize to the model's native size while copying the frame. The copy is a
// snapshot, so the caller may redraw its canvas immediately afterwards.
function captureModelInput(source, width, height) {
    return createImageBitmap(source, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
    });
}

class WorkerSegmentationClient {
    constructor(options) {
        this.width = options.width;
        this.height = options.height;
        this.labels = [];
        this.stats = { ...EMPTY_STATS };
        this.framesInWorker = 0;
        this.open = false;
        this.worker = new Worker(
            new URL("./segmentationWorker.js", import.meta.url),
            { type: "module" },
        );
        this.ready = new Promise((resolve, reject) => {
            this.worker.addEventListener("message", (event) => {
                const message = event.data;
                if (message.type === "ready") {
                    this.labels = message.labels;
                    resolve(this);
                } else if (message.type === "initError") {
                    this.worker.terminate();
                    reject(new Error(message.message));
                } else {
                    this.handleWorkerMessage(message);
                }
            });
            this.worker.addEventListener("error", (event) => {
                this.open = false;
                reject(event.error ?? new Error(event.message));
            });
        });
        this.worker.postMessage({
            type: "init",
            socketURL: options.socketURL,
            processorOptions: {
                wasmPath: options.wasmPath,
                modelPath: options.modelPath,
                width: options.width,
                height: options.height,
                coloredOutputFormat: options.coloredOutputFormat,
                legendColors: options.legendColors,
                maxInFlight: options.maxInFlight,
                ackTimeoutMs: options.ackTimeoutMs,
                compression: options.compression,
                reportTimeOriginMs: performance.timeOrigin,
            },
        });
    }

    handleWorkerMessage(message) {
        if (message.type === "stats") {
            Object.assign(this.stats, message.stats);
            if (message.frameDone) {
                this.framesInWorker = Math.max(0, this.framesInWorker - 1);
            }
        } else if (message.type === "open") {
            console.log("Segmentation WebSocket connection opened (worker)");
            this.open = true;
        } else if (message.type === "close") {
            console.log("Segmentation socket connection closed");
            this.open = false;
            this.framesInWorker = 0;
        } else if (message.type === "error") {
            console.error("Error in segmentation websocket connection");
        }
    }

    // Frames arriving while the worker already holds MAX_WORKER_FRAMES are
    // skipped, so it never falls more than one frame behind.
    canSubmit() {
        return this.open && this.framesInWorker < MAX_WORKER_FRAMES;
    }

    submit(source, frame) {
        this.framesInWorker++;
        captureModelInput(source, this.width, this.height)
            .then((image) => {
                this.worker.postMessage({ type: "frame", image, frame }, [image]);
            })
            .catch((error) => {
                this.framesInWorker = Math.max(0, this.framesInWorker - 1);
                this.stats.sendErrors++;
                console.error("Failed to capture segmentation input", error);
            });
    }
}

class MainThreadSegmentationClient {
    constructor(options) {
        this.width = options.width;
        this.height = options.height;
        this.labels = [];
        this.busy = false;
        this.ws = undefined;
        this.processor = new SegmentationProcessor({
            wasmPath: options.wasmPath,
            modelPath: options.modelPath,
            width: options.width,
            height: options.height,
            coloredOutputFormat: options.coloredOutputFormat,
            legendColors: options.legendColors,
            maxInFlight: options.maxInFlight,
            ackTimeoutMs: options.ackTimeoutMs,
            compression: options.compression,
            reportTimeOriginMs: performance.timeOrigin,
            send: (packet) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    return false;
                }
                this.ws.send(packet);
                return true;
            },
        });
        this.ready = this.processor.init().then((labels) => {
            this.labels = labels;
            this.connect(options.socketURL);
            return this;
        });
    }

    get stats() {
        return {
            ...this.processor.stats,
            bufferedBytes: this.ws?.bufferedAmount ?? 0,
        };
    }

    connect(url) {
        this.ws = new WebSocket(url);
        this.ws.addEventListener("open", () => {
            console.log("Segmentation WebSocket connection opened");
            this.processor.resetConnection();
        });
        this.ws.addEventListener("message", (event) => {
            if (typeof event.data === "string") {
                this.processor.handleSocketText(event.data);
            }
        });
        this.ws.addEventListener("error", (error) => {
            console.error("Error in segmentation websocket connection", error);
        });
        this.ws.addEventListener("close", () => {
            console.log("Segmentation socket connection closed");
            this.processor.resetConnection();
        });
    }

    canSubmit() {
        return this.ws?.readyState === WebSocket.OPEN && !this.busy;
    }

    submit(source, frame) {
        this.busy = true;
        captureModelInput(source, this.width, this.height)
            .then((image) => {
                try {
                    if (this.processor.canAccept()) {
                        // Compression and sending continue in the processor's
                        // ordered delivery chain.
                        this.processor.process(image, frame);
                    }
                } finally {
                    image.close();
                    this.busy = false;
                }
            })
            .catch((error) => {
                this.busy = false;
                this.processor.stats.sendErrors++;
                console.error("Segmentation failed", error);
            });
    }
}

export async function createSegmentationClient(options) {
    try {
        return await new WorkerSegmentationClient(options).ready;
    } catch (error) {
        console.warn(
            "Segmentation worker unavailable; running segmentation on the main thread",
            error,
        );
    }
    return new MainThreadSegmentationClient(options).ready;
}

export { EMPTY_STATS as EMPTY_SEGMENTATION_STATS };
