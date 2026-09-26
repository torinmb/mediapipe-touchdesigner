// Main-thread handle for the segmentation socket that lives in
// segmentationSocketWorker.js. It mirrors the parts of the WebSocket API that
// main.js uses (readyState, bufferedAmount, send, open/message/error/close
// events), so callers treat it like a regular WebSocket.

class WorkerWebSocket extends EventTarget {
    constructor(url, onWorkerUnavailable) {
        super();
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.bufferedAmount = 0;
        this.worker = new Worker(
            new URL("./segmentationSocketWorker.js", import.meta.url),
            { type: "module" },
        );
        this.worker.addEventListener("message", (event) =>
            this.handleWorkerMessage(event.data),
        );
        this.worker.addEventListener("error", (event) => {
            const failedBeforeOpen =
                this.readyState === WebSocket.CONNECTING;
            this.readyState = WebSocket.CLOSED;
            this.worker.terminate();
            if (failedBeforeOpen && onWorkerUnavailable) {
                onWorkerUnavailable(event);
            } else {
                this.dispatchEvent(new Event("close"));
            }
        });
        this.worker.postMessage({ type: "connect", url });
    }

    send(data) {
        if (this.readyState !== WebSocket.OPEN) {
            throw new DOMException(
                "Segmentation socket is not open",
                "InvalidStateError",
            );
        }
        // Transfer ArrayBuffers so the mask is handed over without a copy.
        // The caller's buffer is detached afterwards.
        const transfer = data instanceof ArrayBuffer ? [data] : [];
        this.bufferedAmount += data.byteLength ?? data.length ?? 0;
        this.worker.postMessage({ type: "send", data }, transfer);
    }

    close() {
        this.worker.postMessage({ type: "close" });
    }

    handleWorkerMessage(message) {
        if (message.type === "open") {
            this.readyState = WebSocket.OPEN;
            this.dispatchEvent(new Event("open"));
        } else if (message.type === "message") {
            this.dispatchEvent(
                new MessageEvent("message", { data: message.data }),
            );
        } else if (message.type === "buffered") {
            this.bufferedAmount = message.bufferedAmount;
        } else if (message.type === "error") {
            this.dispatchEvent(new Event("error"));
        } else if (message.type === "sendFailed") {
            console.warn(
                "Segmentation worker failed to send",
                message.message ?? "",
            );
        } else if (message.type === "close") {
            this.readyState = WebSocket.CLOSED;
            this.worker.terminate();
            this.dispatchEvent(new Event("close"));
        }
    }
}

// Prefer the worker-owned socket. Fall back to a main-thread WebSocket if the
// browser cannot start the worker (onFallback receives the replacement).
export function createSegmentationSocket(url, onFallback) {
    try {
        return new WorkerWebSocket(url, (error) => {
            console.warn(
                "Segmentation socket worker unavailable; using the main thread",
                error,
            );
            onFallback(new WebSocket(url));
        });
    } catch (error) {
        console.warn(
            "Segmentation socket worker unavailable; using the main thread",
            error,
        );
        return new WebSocket(url);
    }
}
