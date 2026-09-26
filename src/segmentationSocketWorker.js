// Owns the segmentation WebSocket off the page's main thread.
//
// Chrome streams a large WebSocket message out in chunks, and each chunk is
// only written when the owning thread is free. On the page's main thread that
// means a 256 KB mask waits behind every model's inference for that frame
// (150+ ms with several models running). This worker thread is otherwise
// idle, so masks leave as soon as they are handed over.

const BUFFERED_REPORT_INTERVAL_MS = 50;

let ws;
let bufferedReportTimer;
let lastReportedBuffered = -1;

function reportBufferedAmount() {
    const bufferedAmount = ws ? ws.bufferedAmount : 0;
    if (bufferedAmount !== lastReportedBuffered) {
        lastReportedBuffered = bufferedAmount;
        self.postMessage({ type: "buffered", bufferedAmount });
    }
    if (bufferedAmount === 0) {
        clearInterval(bufferedReportTimer);
        bufferedReportTimer = undefined;
    }
}

function connect(url) {
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => self.postMessage({ type: "open" }));
    ws.addEventListener("error", () => self.postMessage({ type: "error" }));
    ws.addEventListener("close", (event) =>
        self.postMessage({
            type: "close",
            code: event.code,
            reason: event.reason,
        }),
    );
    ws.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
            self.postMessage({ type: "message", data: event.data });
        }
    });
}

function send(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        self.postMessage({ type: "sendFailed" });
        return;
    }
    try {
        ws.send(data);
    } catch (error) {
        self.postMessage({ type: "sendFailed", message: String(error) });
        return;
    }
    reportBufferedAmount();
    if (bufferedReportTimer === undefined && ws.bufferedAmount > 0) {
        bufferedReportTimer = setInterval(
            reportBufferedAmount,
            BUFFERED_REPORT_INTERVAL_MS,
        );
    }
}

self.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "connect") {
        connect(message.url);
    } else if (message.type === "send") {
        send(message.data);
    } else if (message.type === "close") {
        ws?.close();
    }
});
