// Copyright 2023 The MediaPipe Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//      http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { faceLandmarkState, createFaceLandmarker } from "./faceLandmarks.js";
import { faceDetectorState, createFaceDetector } from "./faceDetector.js";
import { handState, createHandLandmarker } from "./handDetection.js";
import { gestureState, createGestureLandmarker } from "./handGestures.js";
import { poseState, createPoseLandmarker } from "./poseTracking.js";
import { objectState, createObjectDetector } from "./objectDetection.js";
import { imageState, createImageClassifier } from "./imageClassification.js";
import {
  segmenterState,
  createImageSegmenter,
  getSegmentationStats,
} from "./imageSegmentation.js";
import { imageEmbedderState, createImageEmbedder } from "./imageEmbedder.js";
import { webcamState, socketState, overlayState, outputState } from "./state.js";
import { configMap } from "./modelParams.js";

const WASM_PATH = "./mediapipe/wasm";
const video = document.getElementById("webcam");
let flippedVideo = null;
webcamState.videoElement = video;

const canvasElement = document.getElementById("output_canvas");
const canvasContext = canvasElement.getContext("2d");
const objectsDiv = document.getElementById("objects");
const facesDiv = document.getElementById("faces");
const webcamCanvas = document.getElementById("webcam_canvas");
const webcamCanvasContext = webcamCanvas.getContext("2d", { alpha: false });
const frameMarkerCanvas = document.getElementById("frame_marker");
const frameMarkerContext = frameMarkerCanvas.getContext("2d", { alpha: false });
const frameMarkerPixel = frameMarkerContext.createImageData(1, 1);
// TouchDesigner acknowledges each timers message. When it falls further behind
// than this many frames, drop that frame's results instead of queueing stale
// data behind them (latest-wins).
const CONTROL_MAX_FRAMES_IN_FLIGHT = 3;
const CONTROL_ACK_STALL_MS = 1000;
const FRAME_MARKER_MASK = 0x00ffffff;
const FRAME_MARKER_DEBUG_RED = false;

// Keep a reference of all the child elements we create
// so we can remove them easilly on each render.

let allModelState = [faceLandmarkState, faceDetectorState, handState, gestureState, poseState, objectState, imageState, segmenterState, imageEmbedderState];
let landmarkerModelState = [faceLandmarkState, handState, gestureState, poseState];

const controlTransport = {
  timersSent: 0,
  timersAcked: 0,
  // Stays false with older TouchDesigner callbacks that never acknowledge, so
  // they keep receiving every result as before.
  ackSupported: false,
  lastAckAtMs: 0,
  droppedResults: 0,
  sendResultsThisFrame: true,
};
let outputSizeKey = "";


(async function setup() {
  handleQueryParams();
  const socketURL = socketState.adddress + ":" + socketState.port;
  setupWebSocket(socketURL, socketState);
  const segmentationSocketURL = socketURL.replace(/\/$/, '') + '/segmentation';
  webcamState.webcamDevices = await getWebcamDevices();
  // if(handState.detect)
    handState.landmarker = await createHandLandmarker(WASM_PATH);
  // if(gestureState.detect)
    gestureState.landmarker = await createGestureLandmarker(WASM_PATH);
  // if(faceLandmarkState.detect)
    faceLandmarkState.landmarker = await createFaceLandmarker(WASM_PATH);
  // if(faceDetectorState.detect)
    faceDetectorState.landmarker = await createFaceDetector(WASM_PATH, facesDiv);
  // if(poseState.detect)
    poseState.landmarker = await createPoseLandmarker(WASM_PATH);
  // if(objectState.detect)
    objectState.landmarker = await createObjectDetector(WASM_PATH, objectsDiv);
  // if(imageState.detect)
    imageState.landmarker = await createImageClassifier(WASM_PATH);
  // if(segmenterState.detect)
    segmenterState.landmarker = await createImageSegmenter(WASM_PATH, segmentationSocketURL);

    imageEmbedderState.landmarker = await createImageEmbedder(WASM_PATH);
  webcamState.startWebcam();
  window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));
})();

function handleQueryParams() {
  socketState.port = window.location.port;
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    if (key in configMap) {
      configMap[key](decodeURIComponent(value));
    }
  });
}

function safeSocketSend(ws, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(data);
    return true;
  } catch (error) {
    console.error("WebSocket send failed", error);
    return false;
  }
}

function canSendResults() {
  if (!controlTransport.ackSupported) {
    return true;
  }

  const framesInFlight =
    controlTransport.timersSent - controlTransport.timersAcked;
  if (framesInFlight < CONTROL_MAX_FRAMES_IN_FLIGHT) {
    return true;
  }

  // TouchDesigner stopped acknowledging (older callbacks, server restart).
  // Fall back to unthrottled sending until acknowledgements resume.
  if (performance.now() - controlTransport.lastAckAtMs > CONTROL_ACK_STALL_MS) {
    controlTransport.ackSupported = false;
    return true;
  }
  return false;
}

function acknowledgeTimers(count) {
  if (!Number.isFinite(count)) {
    return;
  }
  controlTransport.timersAcked = Math.max(controlTransport.timersAcked, count);
  controlTransport.ackSupported = true;
  controlTransport.lastAckAtMs = performance.now();
}

function resizeOutputElements() {
  const width = outputState.width;
  const height = outputState.height;
  const sizeKey = `${width}x${height}`;
  if (sizeKey === outputSizeKey) {
    return false;
  }
  outputSizeKey = sizeKey;

  // Assigning canvas.width reallocates the backing store, so only do it when
  // the output size actually changes.
  canvasElement.style.width = width;
  canvasElement.style.height = height;
  canvasElement.width = width;
  canvasElement.height = height;

  objectsDiv.style.width = width;
  objectsDiv.style.height = height;
  objectsDiv.width = width;
  objectsDiv.height = height;

  facesDiv.style.width = width;
  facesDiv.style.height = height;
  facesDiv.width = width;
  facesDiv.height = height;

  webcamState.offscreenCanvas.width = width;
  webcamState.offscreenCanvas.height = height;
  return true;
}

function clearOutputCanvas() {
  // Matches the old per-frame canvas.width reset: clear pixels and state.
  if (typeof canvasContext.reset === "function") {
    canvasContext.reset();
    return;
  }
  canvasContext.setTransform(1, 0, 0, 1, 0, 0);
  canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

async function predictWebcam(allModelState, objectState, webcamState, video) {

  let timeToDetect = 0;
  let timeToDraw = 0;

  if (!webcamState.webcamRunning || video.videoWidth === 0 || video.videoHeight === 0) {
    // console.log('videoWidth or videoHeight is 0')
    window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));
    return;
  }

  if (!resizeOutputElements()) {
    clearOutputCanvas();
  }

  let startTimeMs = performance.now();
  const hasNewFrame = webcamState.lastVideoTime !== video.currentTime;
  controlTransport.sendResultsThisFrame = canSendResults();
  if (hasNewFrame) {
    if (!controlTransport.sendResultsThisFrame) {
      controlTransport.droppedResults++;
    }
    const sourceFrame = getSourceFrame(video, webcamState);
    const sourceMediaTimeMs = video.currentTime * 1000;
    if(webcamState.webcamRunning && !(video.videoWidth === 0 || video.videoHeight === 0)) {
      flippedVideo = captureAndFlipWebcam(video, webcamState, sourceFrame);
    }
    // Give segmentation its frame first: it runs off the main thread, so it
    // should not wait behind the other models' inference.
    const segmentationClient = segmenterState.landmarker;
    if (segmenterState.detect && segmentationClient && flippedVideo) {
      if (segmentationClient.canSubmit()) {
        segmentationClient.submit(flippedVideo, {
          sourceFrame,
          sourceMediaTimeMs,
          mediaPipeTimestampMs: startTimeMs,
          showMultiClassBackgroundOnly:
            segmenterState.showMultiClassBackgroundOnly,
        });
      } else {
        segmenterState.skippedBusy++;
      }
    }
    let startDetect = Date.now();
    webcamState.lastVideoTime = video.currentTime;
    for (let landmarker of allModelState) {
      if (landmarker.detect && landmarker.landmarker) {
        // Gesture Model has a different function for detection
        let marker = landmarker.landmarker;
        if (landmarker.resultsName === 'segmenterResults') {
          // Submitted before this loop; it runs in its own worker.
          continue;
        }
        else if (landmarker.resultsName === 'gestureResults') {
          landmarker.results = await marker.recognizeForVideo(flippedVideo, startTimeMs);
          sendLandmarkerResults(landmarker, video);
        }
        else if (landmarker.resultsName === 'imageResults') {
          landmarker.results = await marker.classifyForVideo(flippedVideo, startTimeMs);
          sendLandmarkerResults(landmarker, video);
        }
        else if (landmarker.resultsName === 'imageEmbedderResults') {
          landmarker.results = await marker.embedForVideo(video, startTimeMs);
          sendLandmarkerResults(landmarker, video);
        }
        else {
          landmarker.results = await marker.detectForVideo(flippedVideo, startTimeMs);
          sendLandmarkerResults(landmarker, video);
        }
      }
      let endDetect = Date.now();
      timeToDetect = Math.round(endDetect - startDetect);
    }
  }

  let startDraw = Date.now();
  if (overlayState.show) {
    for (let landmarker of landmarkerModelState) {
      if (landmarker.detect && landmarker.results) {
        landmarker.draw(landmarker.results, webcamState.drawingUtils);
      }
    }
    // unique draw function for object detection
    if (objectState.detect && objectState.results) {
      objectState.draw(flippedVideo);
    }
    if (faceDetectorState.detect && faceDetectorState.results) {
      faceDetectorState.draw(flippedVideo);
    }
  }
  let endDraw = Date.now();
  timeToDraw = Math.round(endDraw - startDraw);
  // Figure out how long this took
  // Note that this is not the same as the video time

  // Telemetry is only meaningful for processed frames. While a mask is in
  // flight keep sending every tick: each timers message also lets
  // TouchDesigner retry committing its pending mask. Under backpressure hold
  // timers too; acknowledgements for the ones already queued still arrive.
  const segmentationStats = getSegmentationStats();
  const sendTimers =
    controlTransport.sendResultsThisFrame &&
    (hasNewFrame || segmentationStats.inFlight > 0);
  if (sendTimers && safeSocketSend(socketState.ws, JSON.stringify({
    timers: {
      detectTime: timeToDetect,
      drawTime: timeToDraw,
      sourceFrameRate: webcamState.frameRate,
      segmentationTransport: {
        enabled: Number(segmenterState.detect),
        attemptedPackets: segmentationStats.attemptedPackets,
        sentPackets: segmentationStats.sentPackets,
        sendErrors: segmentationStats.sendErrors,
        bufferedBytes: segmentationStats.bufferedBytes,
        packTimeMs: segmentationStats.packTimeMs,
        acknowledgedPackets: segmentationStats.acknowledgedPackets,
        skippedInFlight: segmentationStats.skippedInFlight,
        ackTimeouts: segmentationStats.ackTimeouts,
        inFlight: segmentationStats.inFlight,
        ackRoundTripMs: segmentationStats.ackRoundTripMs,
        packetBytes: segmentationStats.packetBytes,
        rawPacketBytes: segmentationStats.rawPacketBytes,
        compressedPackets: segmentationStats.compressedPackets,
        skippedBusy: segmenterState.skippedBusy,
      },
      controlTransport: {
        ackSupported: Number(controlTransport.ackSupported),
        framesInFlight:
          controlTransport.timersSent - controlTransport.timersAcked,
        droppedResultFrames: controlTransport.droppedResults,
      },
    },
  }))) {
    controlTransport.timersSent++;
  }

  window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));

}

function sendLandmarkerResults(landmarker, video) {
  if (!controlTransport.sendResultsThisFrame) {
    return;
  }
  safeSocketSend(socketState.ws, JSON.stringify({
    [landmarker.resultsName]: landmarker.results,
    resolution: { width: video.videoWidth, height: video.videoHeight },
  }));
}

function getSourceFrame(video, webcamState) {
  const videoQuality = video.getVideoPlaybackQuality?.();
  if (Number.isFinite(videoQuality?.totalVideoFrames)) {
    return videoQuality.totalVideoFrames >>> 0;
  }

  webcamState.sourceFrame = (webcamState.sourceFrame + 1) >>> 0;
  return webcamState.sourceFrame;
}

function writeFrameMarker(sourceFrame) {
  // The segmentation packet carries sourceFrame as uint32. The visible marker
  // carries its low 24 bits as little-endian RGB so TouchDesigner can recover
  // the same frame ID from one normalized RGBA pixel:
  // R + (G << 8) + (B << 16).
  const markerFrame = (sourceFrame >>> 0) & FRAME_MARKER_MASK;
  const pixel = frameMarkerPixel.data;
  pixel[0] = FRAME_MARKER_DEBUG_RED ? 0xff : markerFrame & 0xff;
  pixel[1] = FRAME_MARKER_DEBUG_RED ? 0 : (markerFrame >>> 8) & 0xff;
  pixel[2] = FRAME_MARKER_DEBUG_RED ? 0 : (markerFrame >>> 16) & 0xff;
  pixel[3] = 0xff;
  frameMarkerContext.putImageData(frameMarkerPixel, 0, 0);
}

function setupWebSocket(socketURL, socketState) {
  socketState.ws = new WebSocket(socketURL);

  socketState.ws.addEventListener('open', () => {
    console.log('WebSocket connection opened');
    controlTransport.timersSent = 0;
    controlTransport.timersAcked = 0;
    controlTransport.ackSupported = false;
    socketState.ws.send('pong');

    getWebcamDevices().then(devices => {
      // console.log('Availalbe webcam devices: ', devices)
      socketState.ws.send(JSON.stringify({ type: 'webcamDevices', devices }));
    });
  });

  socketState.ws.addEventListener('message', async (event) => {
    // Process received messages as needed
    if (event.data === 'ping' || event.data === 'pong') return;

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.warn('Ignoring invalid control socket message', error);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'timersAck')) {
      acknowledgeTimers(Number(data.timersAck));
      return;
    }
    for (let [key, value] of Object.entries(data)) {
      if (key in configMap) {
        console.log("Got WS dats: " + key + " : " + value);
        configMap[key](value);
      }
    }
  });

  socketState.ws.addEventListener('error', (error) => {
    console.error('Error in websocket connection', error);
  });

  socketState.ws.addEventListener('close', () => {
    console.log('Socket connection closed');
  });
}

async function getWebcamDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const webcams = devices.filter(device => device.kind === 'videoinput');
    // console.log("Got webcams: ", webcams);
    
    // webcams.forEach((value) => {
    //   console.log(value.label + " capabilities:", value.getCapabilities());
    // });
    return webcams.map(({ label }) => ({ label }));
  } catch (error) {
    console.error('Error getting webcam devices:', error);
    // document.body.style.backgroundColor = "red";
    return [];
  }
}

function captureAndFlipWebcam(video, webcamState, sourceFrame) {
  let offscreenCanvas = webcamState.offscreenCanvas;
  let offscreenCtx = webcamState.offscreenCtx;
  offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  if (webcamState.flipped) {
      offscreenCtx.save();
      offscreenCtx.scale(-1, 1);
      offscreenCtx.drawImage(video, -offscreenCanvas.width, 0, offscreenCanvas.width, offscreenCanvas.height);
      offscreenCtx.restore();
  } else {
      offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
  }

  // The visible Web Render image is a snapshot of the exact clean canvas sent
  // to MediaPipe. Write its marker in the same synchronous update so the frame
  // ID is always composited together with this exact image.
  if (
    webcamCanvas.width !== offscreenCanvas.width ||
    webcamCanvas.height !== offscreenCanvas.height
  ) {
    webcamCanvas.width = offscreenCanvas.width;
    webcamCanvas.height = offscreenCanvas.height;
  }
  webcamCanvasContext.drawImage(offscreenCanvas, 0, 0);
  writeFrameMarker(sourceFrame);
  return offscreenCanvas; // Returning the canvas for any potential use elsewhere
}
