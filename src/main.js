import { faceLandmarkState, createFaceLandmarker } from "./faceLandmarks.js";
import { faceDetectorState, createFaceDetector } from "./faceDetector.js";
import { handState, createHandLandmarker } from "./handDetection.js";
import { gestureState, createGestureLandmarker } from "./handGestures.js";
import { poseState, createPoseLandmarker } from "./poseTracking.js";
import { objectState, createObjectDetector } from "./objectDetection.js";
import { imageState, createImageClassifier } from "./imageClassification.js";
import { segmenterState, createImageSegmenter } from "./imageSegmentation.js";
import { imageEmbedderState, createImageEmbedder } from "./imageEmbedder.js";
import {
    webcamState,
    socketState,
    overlayState,
    outputState,
} from "./state.js";
import { configMap } from "./modelParams.js";

const WASM_PATH = "./mediapipe/wasm";
const video = document.getElementById("webcam");
let flippedVideo = null;
webcamState.videoElement = video;

const canvasElement = document.getElementById("output_canvas");
const objectsDiv = document.getElementById("objects");
const facesDiv = document.getElementById("faces");
const segmentationCanvas = document.getElementById("segmentation");

// Keep a reference of all the child elements we create
// so we can remove them easilly on each render.
let allModelState = [
    faceLandmarkState,
    faceDetectorState,
    handState,
    gestureState,
    poseState,
    objectState,
    imageState,
    segmenterState,
    imageEmbedderState,
];
let landmarkerModelState = [
    faceLandmarkState,
    handState,
    gestureState,
    poseState,
];

// -----------------------------
// Binary input state
// -----------------------------
const HEADER_BYTES = 16;

const binaryInputState = {
    enabled: false, // toggled by ?binaryInput=true/1
    latestFrame: null, // { width, height, frameIndex, rgb }
    processing: false,
    canvas: document.createElement("canvas"),
    ctx: null,
};

binaryInputState.ctx = binaryInputState.canvas.getContext("2d");

// -------------------------------------------------------
// Setup
// -------------------------------------------------------
(async function setup() {
    handleQueryParams();
    setupWebSocket(socketState.adddress + ":" + socketState.port, socketState);

    webcamState.webcamDevices = await getWebcamDevices();

    // Initialize all landmarker models
    handState.landmarker = await createHandLandmarker(WASM_PATH);
    gestureState.landmarker = await createGestureLandmarker(WASM_PATH);
    faceLandmarkState.landmarker = await createFaceLandmarker(WASM_PATH);
    faceDetectorState.landmarker = await createFaceDetector(
        WASM_PATH,
        facesDiv
    );
    poseState.landmarker = await createPoseLandmarker(WASM_PATH);
    objectState.landmarker = await createObjectDetector(WASM_PATH, objectsDiv);
    imageState.landmarker = await createImageClassifier(WASM_PATH);
    segmenterState.landmarker = await createImageSegmenter(
        WASM_PATH,
        video,
        segmentationCanvas
    );
    imageEmbedderState.landmarker = await createImageEmbedder(WASM_PATH);

    if (!binaryInputState.enabled) {
        // Normal webcam mode (existing behavior)
        webcamState.startWebcam();
        window.requestAnimationFrame(() =>
            predictWebcam(allModelState, objectState, webcamState, video)
        );
    } else {
        // Binary mode: we just wait for incoming binary frames
        console.log("Binary input mode enabled; webcam loop disabled.");
    }
})();

// -------------------------------------------------------
// Query params
// -------------------------------------------------------
function handleQueryParams() {
    socketState.port = window.location.port;
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.forEach((value, key) => {
        const decoded = decodeURIComponent(value);
        if (key === "binaryInput") {
            const v = decoded.toLowerCase();
            binaryInputState.enabled = v === "1" || v === "true";
        } else if (key in configMap) {
            configMap[key](decoded);
        }
    });
}

// -------------------------------------------------------
// Utility: safe WebSocket send
// -------------------------------------------------------
function safeSocketSend(ws, data) {
    if (ws.readyState === ws.OPEN) {
        ws.send(data);
    }
}

// -------------------------------------------------------
// Webcam prediction loop (unchanged behavior)
// -------------------------------------------------------
async function predictWebcam(allModelState, objectState, webcamState, video) {
    let timeToDetect = 0;
    let timeToDraw = 0;

    if (
        !webcamState.webcamRunning ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
    ) {
        window.requestAnimationFrame(() =>
            predictWebcam(allModelState, objectState, webcamState, video)
        );
        return;
    }

    // Layout and sizing
    canvasElement.style.width = outputState.width;
    canvasElement.style.height = outputState.height;
    canvasElement.width = outputState.width;
    canvasElement.height = outputState.height;

    objectsDiv.style.width = outputState.width;
    objectsDiv.style.height = outputState.height;
    objectsDiv.width = outputState.width;
    objectsDiv.height = outputState.height;

    facesDiv.style.width = outputState.width;
    facesDiv.style.height = outputState.height;
    facesDiv.width = outputState.width;
    facesDiv.height = outputState.height;

    segmentationCanvas.style.width = outputState.width;
    segmentationCanvas.style.height = outputState.height;
    segmentationCanvas.width = outputState.width;
    segmentationCanvas.height = outputState.height;

    webcamState.offscreenCanvas.width = outputState.width;
    webcamState.offscreenCanvas.height = outputState.height;

    const startTimeMs = performance.now();
    if (webcamState.lastVideoTime !== video.currentTime) {
        if (
            webcamState.webcamRunning &&
            !(video.videoWidth === 0 || video.videoHeight === 0)
        ) {
            flippedVideo = captureAndFlipWebcam(video, webcamState);
        }
        const startDetect = Date.now();
        webcamState.lastVideoTime = video.currentTime;

        const resolution = {
            width: video.videoWidth,
            height: video.videoHeight,
        };

        for (let landmarker of allModelState) {
            if (landmarker.detect && landmarker.landmarker) {
                const marker = landmarker.landmarker;
                if (landmarker.resultsName === "segmenterResults") {
                    video.style.opacity = 0;
                    await marker.segmentForVideo(
                        flippedVideo,
                        startTimeMs,
                        segmenterState.toImageBitmap
                    );
                } else if (landmarker.resultsName === "gestureResults") {
                    landmarker.results = await marker.recognizeForVideo(
                        flippedVideo,
                        startTimeMs
                    );
                } else if (landmarker.resultsName === "imageResults") {
                    landmarker.results = await marker.classifyForVideo(
                        flippedVideo,
                        startTimeMs
                    );
                } else if (landmarker.resultsName === "imageEmbedderResults") {
                    // Webcam mode embedder uses the video element
                    landmarker.results = await marker.embedForVideo(
                        video,
                        startTimeMs
                    );
                } else {
                    landmarker.results = await marker.detectForVideo(
                        flippedVideo,
                        startTimeMs
                    );
                }

                // NOTE: frame is null in webcam mode (no TD frame index)
                safeSocketSend(
                    socketState.ws,
                    JSON.stringify({
                        frame: null,
                        [landmarker["resultsName"]]: landmarker.results,
                        resolution,
                    })
                );
            }
        }
        const endDetect = Date.now();
        timeToDetect = Math.round(endDetect - startDetect);
    }

    const startDraw = Date.now();
    if (segmenterState.detect && segmenterState.results) {
        // segmenterState.draw();
        // segmenterState.results.close();
    }
    if (overlayState.show) {
        for (let landmarker of landmarkerModelState) {
            if (landmarker.detect && landmarker.results) {
                landmarker.draw(landmarker.results, webcamState.drawingUtils);
            }
        }
        if (objectState.detect && objectState.results) {
            objectState.draw(flippedVideo);
        }
        if (faceDetectorState.detect && faceDetectorState.results) {
            faceDetectorState.draw(flippedVideo);
        }
    }
    const endDraw = Date.now();
    timeToDraw = Math.round(endDraw - startDraw);

    safeSocketSend(
        socketState.ws,
        JSON.stringify({
            frame: null,
            timers: {
                detectTime: timeToDetect,
                drawTime: timeToDraw,
                sourceFrameRate: webcamState.frameRate,
            },
        })
    );

    window.requestAnimationFrame(() =>
        predictWebcam(allModelState, objectState, webcamState, video)
    );
}

// -------------------------------------------------------
// WebSocket setup (supports text + binary)
// -------------------------------------------------------
function setupWebSocket(socketURL, socketState) {
    socketState.ws = new WebSocket(socketURL);
    socketState.ws.binaryType = "arraybuffer";

    socketState.ws.addEventListener("open", () => {
        console.log("WebSocket connection opened");
        socketState.ws.send("pong");

        getWebcamDevices().then((devices) => {
            socketState.ws.send(
                JSON.stringify({ type: "webcamDevices", devices })
            );
        });
    });

    socketState.ws.addEventListener("message", async (event) => {
        // keep ping/pong lightweight
        if (event.data === "ping" || event.data === "pong") return;

        if (typeof event.data === "string") {
            // Existing JSON control path
            const data = JSON.parse(event.data);
            for (let [key, value] of Object.entries(data)) {
                if (key in configMap) {
                    console.log("Got WS data: " + key + " : " + value);
                    configMap[key](value);
                }
            }
        } else if (event.data instanceof ArrayBuffer) {
            // Binary frame from TouchDesigner
            if (binaryInputState.enabled) {
                handleBinaryFrameMessage(event.data);
            }
        } else if (event.data instanceof Blob) {
            // Fallback: convert Blob to ArrayBuffer
            if (binaryInputState.enabled) {
                const buf = await event.data.arrayBuffer();
                handleBinaryFrameMessage(buf);
            }
        }
    });

    socketState.ws.addEventListener("error", (error) => {
        console.error("Error in websocket connection", error);
    });

    socketState.ws.addEventListener("close", () => {
        console.log("Socket connection closed");
    });
}

// -------------------------------------------------------
// Binary frame decode + processing
// -------------------------------------------------------
function handleBinaryFrameMessage(arrayBuffer) {
    if (arrayBuffer.byteLength < HEADER_BYTES) {
        console.warn("Binary frame too small");
        return;
    }

    const view = new DataView(arrayBuffer);
    const type = view.getUint8(0);
    const dtype = view.getUint8(1);
    const layout = view.getUint8(2);
    const flags = view.getUint8(3);
    const height = view.getUint16(4, true);
    const width = view.getUint16(6, true);
    const frameIndex = view.getUint32(8, true);
    // padding at 12–15

    // Expect RGB interleaved
    const expectedPayloadBytes = width * height * 3;
    if (arrayBuffer.byteLength < HEADER_BYTES + expectedPayloadBytes) {
        console.warn("Binary payload incorrect size");
        return;
    }

    const rgb = new Uint8ClampedArray(
        arrayBuffer,
        HEADER_BYTES,
        expectedPayloadBytes
    );

    // Keep only the latest frame (drop older ones automatically)
    binaryInputState.latestFrame = { width, height, frameIndex, rgb };

    if (!binaryInputState.processing) {
        processBinaryFrames();
    }
}

async function processBinaryFrames() {
    binaryInputState.processing = true;

    while (binaryInputState.latestFrame) {
        const frame = binaryInputState.latestFrame;
        // Clear global reference so that if new frames arrive during await,
        // they overwrite latestFrame and we'll pick up only the newest next loop.
        binaryInputState.latestFrame = null;

        const { width, height, frameIndex, rgb } = frame;

        const canvas = binaryInputState.canvas;
        const ctx = binaryInputState.ctx;

        canvas.width = width;
        canvas.height = height;

        // Convert RGB → RGBA for putImageData
        const rgba = new Uint8ClampedArray(width * height * 4);
        let si = 0;
        let di = 0;
        for (let i = 0; i < width * height; i++) {
            rgba[di++] = rgb[si++]; // R
            rgba[di++] = rgb[si++]; // G
            rgba[di++] = rgb[si++]; // B
            rgba[di++] = 255; // A
        }

        const imageData = new ImageData(rgba, width, height);
        ctx.putImageData(imageData, 0, 0);

        await processBinaryFrameCanvas(canvas, frameIndex, width, height);
    }

    binaryInputState.processing = false;
}

// Core MediaPipe pass for binary-input frames
async function processBinaryFrameCanvas(
    sourceCanvas,
    frameIndex,
    width,
    height
) {
    let timeToDetect = 0;
    let timeToDraw = 0;

    // Configure overlay / result canvas sizes
    canvasElement.style.width = outputState.width;
    canvasElement.style.height = outputState.height;
    canvasElement.width = outputState.width;
    canvasElement.height = outputState.width;

    objectsDiv.style.width = outputState.width;
    objectsDiv.style.height = outputState.height;
    objectsDiv.width = outputState.width;
    objectsDiv.height = outputState.height;

    facesDiv.style.width = outputState.width;
    facesDiv.style.height = outputState.height;
    facesDiv.width = outputState.width;
    facesDiv.height = outputState.height;

    segmentationCanvas.style.width = outputState.width;
    segmentationCanvas.style.height = outputState.height;
    segmentationCanvas.width = outputState.width;
    segmentationCanvas.height = outputState.height;

    webcamState.offscreenCanvas.width = outputState.width;
    webcamState.offscreenCanvas.height = outputState.height;

    const startTimeMs = performance.now();
    const startDetect = Date.now();

    const resolution = { width, height };

    for (let landmarker of allModelState) {
        if (landmarker.detect && landmarker.landmarker) {
            const marker = landmarker.landmarker;

            if (landmarker.resultsName === "segmenterResults") {
                await marker.segmentForVideo(
                    sourceCanvas,
                    startTimeMs,
                    segmenterState.toImageBitmap
                );
            } else if (landmarker.resultsName === "gestureResults") {
                landmarker.results = await marker.recognizeForVideo(
                    sourceCanvas,
                    startTimeMs
                );
            } else if (landmarker.resultsName === "imageResults") {
                landmarker.results = await marker.classifyForVideo(
                    sourceCanvas,
                    startTimeMs
                );
            } else if (landmarker.resultsName === "imageEmbedderResults") {
                // In binary mode, use the canvas as the source
                landmarker.results = await marker.embedForVideo(
                    sourceCanvas,
                    startTimeMs
                );
            } else {
                landmarker.results = await marker.detectForVideo(
                    sourceCanvas,
                    startTimeMs
                );
            }

            safeSocketSend(
                socketState.ws,
                JSON.stringify({
                    frame: frameIndex,
                    [landmarker["resultsName"]]: landmarker.results,
                    resolution,
                })
            );
        }
    }

    const endDetect = Date.now();
    timeToDetect = Math.round(endDetect - startDetect);

    const startDraw = Date.now();
    if (segmenterState.detect && segmenterState.results) {
        // segmenterState.draw();
        // segmenterState.results.close();
    }

    if (overlayState.show) {
        for (let landmarker of landmarkerModelState) {
            if (landmarker.detect && landmarker.results) {
                landmarker.draw(landmarker.results, webcamState.drawingUtils);
            }
        }
        if (objectState.detect && objectState.results) {
            objectState.draw(sourceCanvas);
        }
        if (faceDetectorState.detect && faceDetectorState.results) {
            faceDetectorState.draw(sourceCanvas);
        }
    }

    const endDraw = Date.now();
    timeToDraw = Math.round(endDraw - startDraw);

    safeSocketSend(
        socketState.ws,
        JSON.stringify({
            frame: frameIndex,
            timers: {
                detectTime: timeToDetect,
                drawTime: timeToDraw,
                sourceFrameRate: null, // no live video source in binary mode
            },
        })
    );
}

// -------------------------------------------------------
// Helpers: webcam devices & capture
// -------------------------------------------------------
async function getWebcamDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const webcams = devices.filter(
            (device) => device.kind === "videoinput"
        );
        return webcams.map(({ label }) => ({ label }));
    } catch (error) {
        console.error("Error getting webcam devices:", error);
        return [];
    }
}

function captureAndFlipWebcam(video, webcamState) {
    let offscreenCanvas = webcamState.offscreenCanvas;
    let offscreenCtx = webcamState.offscreenCtx;
    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    if (webcamState.flipped) {
        offscreenCtx.save();
        offscreenCtx.scale(-1, 1);
        offscreenCtx.drawImage(
            video,
            -offscreenCanvas.width,
            0,
            offscreenCanvas.width,
            offscreenCanvas.height
        );
        offscreenCtx.restore();
    } else {
        offscreenCtx.drawImage(
            video,
            0,
            0,
            offscreenCanvas.width,
            offscreenCanvas.height
        );
    }
    return offscreenCanvas;
}
