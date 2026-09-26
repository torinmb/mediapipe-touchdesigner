// Runs segmentation entirely off the page's main thread: inference, colour
// composition, GPU readback, packing, and the /segmentation socket.
//
// The page transfers one model-sized ImageBitmap per frame. Keeping the rest
// here means the synchronous readPixels stall and the model's inference never
// block the page (and so never delay Web Render or the other models), and
// Chrome can stream large masks out as soon as they are sent instead of
// waiting for the main thread to become free between frames.

import { SegmentationProcessor } from "./segmentationPipeline.js";

const BUFFERED_REPORT_INTERVAL_MS = 50;

// MediaPipe loads its WASM glue with importScripts(), which module workers do
// not support. Load it with a synchronous request instead and evaluate it at
// global scope so it defines the same globals (ModuleFactory).
try {
    importScripts();
} catch (error) {
    self.importScripts = (...urls) => {
        for (const url of urls) {
            const request = new XMLHttpRequest();
            request.open("GET", String(url), false);
            request.send();
            if (request.status < 200 || request.status >= 300) {
                throw new Error(`Failed to load ${url}: ${request.status}`);
            }
            (0, eval)(`${request.responseText}\n//# sourceURL=${url}`);
        }
    };
}

let ws;
let processor;
let bufferedReportTimer;

function postStats(frameDone = false) {
    const stats = processor ? { ...processor.stats } : {};
    stats.bufferedBytes = ws ? ws.bufferedAmount : 0;
    self.postMessage({ type: "stats", stats, frameDone });
}

function watchBufferedAmount() {
    if (bufferedReportTimer !== undefined || !ws || ws.bufferedAmount === 0) {
        return;
    }
    bufferedReportTimer = setInterval(() => {
        postStats();
        if (!ws || ws.bufferedAmount === 0) {
            clearInterval(bufferedReportTimer);
            bufferedReportTimer = undefined;
        }
    }, BUFFERED_REPORT_INTERVAL_MS);
}

function send(packet) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return false;
    }
    ws.send(packet);
    return true;
}

function connect(url) {
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => {
        processor?.resetConnection();
        self.postMessage({ type: "open" });
    });
    ws.addEventListener("error", () => self.postMessage({ type: "error" }));
    ws.addEventListener("close", () => {
        processor?.resetConnection();
        self.postMessage({ type: "close" });
    });
    ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string" || !processor) {
            return;
        }
        processor.handleSocketText(event.data);
        postStats();
    });
}

async function init(message) {
    try {
        const candidate = new SegmentationProcessor({
            ...message.processorOptions,
            send,
        });
        const labels = await candidate.init();
        processor = candidate;
        connect(message.socketURL);
        self.postMessage({ type: "ready", labels });
    } catch (error) {
        self.postMessage({ type: "initError", message: String(error) });
    }
}

function processFrame(image, frame) {
    let delivery;
    try {
        if (
            processor &&
            ws?.readyState === WebSocket.OPEN &&
            processor.canAccept()
        ) {
            delivery = processor.process(image, frame);
        }
    } catch (error) {
        if (processor) {
            processor.stats.sendErrors++;
        }
        console.error("Segmentation failed", error);
    } finally {
        // The image is only read synchronously by process().
        image.close();
    }
    // Ready for the next frame now; compression and sending continue in the
    // processor's ordered delivery chain.
    postStats(true);
    delivery?.then(() => {
        postStats();
        watchBufferedAmount();
    });
}

self.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "init") {
        init(message);
    } else if (message.type === "frame") {
        processFrame(message.image, message.frame);
    }
});
