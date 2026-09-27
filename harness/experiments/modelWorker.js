// Worker for the parallel-models experiment: runs its share of the models on
// each frame it is given.
import { createModels, runModels } from "./models.js";

// Same importScripts shim as src/segmentationWorker.js (module workers cannot
// importScripts MediaPipe's WASM glue).
try {
    importScripts();
} catch (error) {
    self.importScripts = (...urls) => {
        for (const url of urls) {
            const request = new XMLHttpRequest();
            request.open("GET", String(url), false);
            request.send();
            (0, eval)(`${request.responseText}\n//# sourceURL=${url}`);
        }
    };
}

let models;

self.addEventListener("message", async (event) => {
    const message = event.data;
    if (message.type === "init") {
        try {
            models = await createModels(message.names, message.wasmPath, () => new OffscreenCanvas(1, 1), message.cpuNames);
            self.postMessage({ type: "ready" });
        } catch (error) {
            self.postMessage({ type: "error", message: String(error) });
        }
    } else if (message.type === "frame") {
        const times = runModels(models, message.image, message.timestampMs);
        message.image.close();
        self.postMessage({ type: "done", times });
    }
});
