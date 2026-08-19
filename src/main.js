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
  formatSegmentationBinary,
  prepareSegmentationInput,
} from "./imageSegmentation.js";
import { imageEmbedderState, createImageEmbedder } from "./imageEmbedder.js";
import { webcamState, socketState, overlayState, outputState } from "./state.js";
import { configMap } from "./modelParams.js";

const WASM_PATH = "./mediapipe/wasm";
const video = document.getElementById("webcam");
let flippedVideo = null;
webcamState.videoElement = video;

const canvasElement = document.getElementById("output_canvas");
const objectsDiv = document.getElementById("objects");
const facesDiv = document.getElementById("faces");
const webcamCanvas = document.getElementById("webcam_canvas");
const webcamCanvasContext = webcamCanvas.getContext("2d", { alpha: false });
const frameMarkerPixel = webcamCanvasContext.createImageData(1, 1);
const SEGMENTATION_ACK_TIMEOUT_MS = 1000;
const FRAME_MARKER_MASK = 0x00ffffff;
const FRAME_MARKER_DEBUG_RED = false;

// Keep a reference of all the child elements we create
// so we can remove them easilly on each render.

let allModelState = [faceLandmarkState, faceDetectorState, handState, gestureState, poseState, objectState, imageState, segmenterState, imageEmbedderState];
let landmarkerModelState = [faceLandmarkState, handState, gestureState, poseState];


(async function setup() {
  handleQueryParams();
  const socketURL = socketState.adddress + ":" + socketState.port;
  setupWebSocket(socketURL, socketState);
  setupSegmentationWebSocket(
    socketURL.replace(/\/$/, '') + '/segmentation',
    socketState,
  );
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
    segmenterState.landmarker = await createImageSegmenter(WASM_PATH);

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

function canProcessSegmentationFrame(ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  if (segmenterState.inFlightPacketSequence !== null) {
    const inFlightAgeMs =
      performance.now() - segmenterState.inFlightSentAtMs;
    if (inFlightAgeMs < SEGMENTATION_ACK_TIMEOUT_MS) {
      segmenterState.skippedInFlight++;
      return false;
    }

    // A missing acknowledgement must not permanently stop segmentation.
    // Treat the old packet as lost so a missing acknowledgement cannot lock
    // segmentation permanently.
    segmenterState.ackTimeouts++;
    segmenterState.inFlightPacketSequence = null;
    segmenterState.inFlightSentAtMs = 0;
  }

  return true;
}

function acknowledgeSegmentationPacket(packetSequence) {
  if (!Number.isInteger(packetSequence)) {
    return;
  }

  const acknowledgedSequence = packetSequence >>> 0;
  if (acknowledgedSequence !== segmenterState.inFlightPacketSequence) {
    return;
  }

  segmenterState.acknowledgedPackets++;
  segmenterState.lastAckRoundTripMs = Math.max(
    0,
    performance.now() - segmenterState.inFlightSentAtMs,
  );
  segmenterState.inFlightPacketSequence = null;
  segmenterState.inFlightSentAtMs = 0;
}

async function predictWebcam(allModelState, objectState, webcamState, video) {

  let timeToDetect = 0;
  let timeToDraw = 0;

  if (!webcamState.webcamRunning || video.videoWidth === 0 || video.videoHeight === 0) {
    // console.log('videoWidth or videoHeight is 0')
    window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));
    return;
  }

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

  webcamState.offscreenCanvas.width = outputState.width;
  webcamState.offscreenCanvas.height = outputState.height;

  let startTimeMs = performance.now();
  if (webcamState.lastVideoTime !== video.currentTime) {
    const sourceFrame = getSourceFrame(video, webcamState);
    const sourceMediaTimeMs = video.currentTime * 1000;
    if(webcamState.webcamRunning && !(video.videoWidth === 0 || video.videoHeight === 0)) {
      flippedVideo = captureAndFlipWebcam(video, webcamState, sourceFrame);
    }
    let startDetect = Date.now();
    webcamState.lastVideoTime = video.currentTime;
    for (let landmarker of allModelState) {
      if (landmarker.detect && landmarker.landmarker) {
        // Gesture Model has a different function for detection
        let marker = landmarker.landmarker;
        if (landmarker.resultsName === 'segmenterResults') {
          if (!canProcessSegmentationFrame(socketState.segmentationWs)) {
            continue;
          }
          const segmentationStartedMs = performance.now();
          const segmentationInput = prepareSegmentationInput(flippedVideo);
          marker.segmentForVideo(segmentationInput, startTimeMs, (results) => {
            segmenterState.attemptedPackets++;
            try {
              const completedMs = performance.now();
              const packStartedMs = performance.now();
              segmenterState.packetSequence =
                (segmenterState.packetSequence + 1) >>> 0;
              const packet = formatSegmentationBinary(results, {
                sourceFrame,
                packetSequence: segmenterState.packetSequence,
                sourceMediaTimeMs,
                mediaPipeTimestampMs: startTimeMs,
                segmentationStartedMs,
                completedMs,
              });
              segmenterState.lastPackTimeMs =
                performance.now() - packStartedMs;
              if (packet && safeSocketSend(socketState.segmentationWs, packet)) {
                segmenterState.sentPackets++;
                segmenterState.lastPacketBytes = packet.byteLength;
                segmenterState.inFlightPacketSequence =
                  segmenterState.packetSequence;
                segmenterState.inFlightSentAtMs = performance.now();
              }
            } catch (error) {
              segmenterState.sendErrors++;
              console.error("Failed to send segmentation output", error);
            }
          });
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

  safeSocketSend(socketState.ws, JSON.stringify({
    timers: {
      detectTime: timeToDetect,
      drawTime: timeToDraw,
      sourceFrameRate: webcamState.frameRate,
      segmentationTransport: {
        enabled: Number(segmenterState.detect),
        attemptedPackets: segmenterState.attemptedPackets,
        sentPackets: segmenterState.sentPackets,
        sendErrors: segmenterState.sendErrors,
        bufferedBytes: socketState.segmentationWs?.bufferedAmount ?? 0,
        packTimeMs: segmenterState.lastPackTimeMs,
        acknowledgedPackets: segmenterState.acknowledgedPackets,
        skippedInFlight: segmenterState.skippedInFlight,
        ackTimeouts: segmenterState.ackTimeouts,
        inFlight: Number(segmenterState.inFlightPacketSequence !== null),
        ackRoundTripMs: segmenterState.lastAckRoundTripMs,
        packetBytes: segmenterState.lastPacketBytes,
      },
    },
  }));

  window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));

}

function sendLandmarkerResults(landmarker, video) {
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

function writeFrameMarker(sourceFrame, context, outputHeight) {
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
  context.putImageData(frameMarkerPixel, 0, outputHeight - 1);
}

function setupWebSocket(socketURL, socketState) {
  socketState.ws = new WebSocket(socketURL);

  socketState.ws.addEventListener('open', () => {
    console.log('WebSocket connection opened');
    socketState.ws.send('pong');

    getWebcamDevices().then(devices => {
      // console.log('Availalbe webcam devices: ', devices)
      socketState.ws.send(JSON.stringify({ type: 'webcamDevices', devices }));
    });
  });

  socketState.ws.addEventListener('message', async (event) => {
    // Process received messages as needed
    if (event.data === 'ping' || event.data === 'pong') return;

    const data = JSON.parse(event.data);
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

function setupSegmentationWebSocket(socketURL, socketState) {
  const ws = new WebSocket(socketURL);
  socketState.segmentationWs = ws;

  ws.addEventListener('open', () => {
    console.log('Segmentation WebSocket connection opened');
    segmenterState.inFlightPacketSequence = null;
    segmenterState.inFlightSentAtMs = 0;
  });

  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      return;
    }
    if (event.data === 'ping' || event.data === 'pong') {
      return;
    }

    try {
      const data = JSON.parse(event.data);
      if (Object.prototype.hasOwnProperty.call(data, 'segAck')) {
        acknowledgeSegmentationPacket(Number(data.segAck));
      }
    } catch (error) {
      console.warn('Ignoring invalid segmentation socket message', error);
    }
  });

  ws.addEventListener('error', (error) => {
    console.error('Error in segmentation websocket connection', error);
  });

  ws.addEventListener('close', () => {
    console.log('Segmentation socket connection closed');
    segmenterState.inFlightPacketSequence = null;
    segmenterState.inFlightSentAtMs = 0;
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
  // to MediaPipe. Draw its marker in the same synchronous canvas update so the
  // frame ID cannot be composited over a newer live-video frame.
  if (
    webcamCanvas.width !== offscreenCanvas.width ||
    webcamCanvas.height !== offscreenCanvas.height
  ) {
    webcamCanvas.width = offscreenCanvas.width;
    webcamCanvas.height = offscreenCanvas.height;
  }
  webcamCanvasContext.drawImage(offscreenCanvas, 0, 0);
  writeFrameMarker(sourceFrame, webcamCanvasContext, webcamCanvas.height);
  return offscreenCanvas; // Returning the canvas for any potential use elsewhere
}
