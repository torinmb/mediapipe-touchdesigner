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
import { segmenterState, createImageSegmenter } from "./imageSegmentation.js";
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
const segmentationCanvas = document.getElementById("segmentation");

// Keep a reference of all the child elements we create
// so we can remove them easilly on each render.

let allModelState = [faceLandmarkState, faceDetectorState, handState, gestureState, poseState, objectState, imageState, segmenterState, imageEmbedderState];
let landmarkerModelState = [faceLandmarkState, handState, gestureState, poseState];


(async function setup() {
  handleQueryParams();
  setupWebSocket(socketState.adddress + ":" + socketState.port, socketState);
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
    segmenterState.landmarker = await createImageSegmenter(WASM_PATH, video, segmentationCanvas);

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
  if (ws.readyState === ws.OPEN) {
    ws.send(data);
  }
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

  segmentationCanvas.style.width = outputState.width;
  segmentationCanvas.style.height = outputState.height;
  segmentationCanvas.width = outputState.width;
  segmentationCanvas.height = outputState.height;
  
  webcamState.offscreenCanvas.width = outputState.width;
  webcamState.offscreenCanvas.height = outputState.height;

  let startTimeMs = performance.now();
  if (webcamState.lastVideoTime !== video.currentTime) {
    if(webcamState.webcamRunning && !(video.videoWidth === 0 || video.videoHeight === 0)) {
      flippedVideo = captureAndFlipWebcam(video, webcamState);
    }
    let startDetect = Date.now();
    webcamState.lastVideoTime = video.currentTime;
    for (let landmarker of allModelState) {
      if (landmarker.detect && landmarker.landmarker) {
        // Gesture Model has a different function for detection
        let marker = landmarker.landmarker;
        if (landmarker.resultsName === 'segmenterResults') {
          video.style.opacity = 0;
          await marker.segmentForVideo(flippedVideo, startTimeMs, segmenterState.toImageBitmap);
        }
        else if (landmarker.resultsName === 'gestureResults') {
          landmarker.results = await marker.recognizeForVideo(flippedVideo, startTimeMs);
        }
        else if (landmarker.resultsName === 'imageResults') {
          landmarker.results = await marker.classifyForVideo(flippedVideo, startTimeMs);
        }
        else if (landmarker.resultsName === 'imageEmbedderResults') {
          landmarker.results = await marker.embedForVideo(video, startTimeMs);
        }
        else {
          landmarker.results = await marker.detectForVideo(flippedVideo, startTimeMs);
        }
        safeSocketSend(socketState.ws, JSON.stringify({
          [landmarker['resultsName']]: landmarker.results,
          'resolution': { 'width': video.videoWidth, 'height': video.videoHeight }
        }));
      }
      let endDetect = Date.now();
      timeToDetect = Math.round(endDetect - startDetect);
    }
  }

  let startDraw = Date.now();
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

  safeSocketSend(socketState.ws, JSON.stringify({ 'timers': { 'detectTime': timeToDetect, 'drawTime': timeToDraw, 'sourceFrameRate': webcamState.frameRate } }));

  window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));

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

function captureAndFlipWebcam(video, webcamState) {
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
  return offscreenCanvas; // Returning the canvas for any potential use elsewhere
}