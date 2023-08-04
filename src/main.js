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

import { DrawingUtils } from "@mediapipe/tasks-vision";
import { createFaceLandmarker, drawFaceLandmarks } from "./faceTracking.js";
import { createHandLandmarker, drawHandLandmarks } from "./handTracking.js";
import { createGestureLandmarker, drawHandGestures } from "./handGestures.js";
import { createPoseLandmarker, drawPoseLandmarks, poseModelTypes } from "./poseTracking.js";
import { createObjectDetector } from "./objectDetection.js";

const WASM_PATH = "./mediapipe/tasks-vision/0.10.3/wasm";
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

let showOverlays = true;
let detectHands = false;
let detectGestures = true;
let detectFaces = true;
let detectPoses = true;
let poseModelPath = poseModelTypes['full'];
let detectObjects = false;

let landmarkerState = {
  handLandmarker: undefined,
  handGestures: undefined,
  faceLandmarker: undefined,
  poseLandmarker: undefined,
  objectDetector: undefined,
  handResults: undefined,
  gestureResults: undefined,
  faceResults: undefined,
  poseResults: undefined,
  objectResults: undefined,
};

let webcamState = {
  webcamRunning: false,
  webcamDevices: [],
  webcamId: 'default',
  lastVideoTime: -1,
  drawingUtils: new DrawingUtils(canvasCtx),
};

let socketState = {
  ws: undefined,
  wsURL: 'ws://localhost:9980',
};

(async function setup() {
  handleQueryParams(socketState, webcamState);
  webcamState.webcamDevices = await getWebcamDevices();
  landmarkerState.handLandmarker = await createHandLandmarker(WASM_PATH, `./mediapipe/hand_landmarker.task`);
  landmarkerState.handGestures = await createGestureLandmarker(WASM_PATH, `./mediapipe/gesture_recognizer.task`);
  landmarkerState.faceLandmarker = await createFaceLandmarker(WASM_PATH, `./mediapipe/face_landmarker.task`);
  console.log(poseModelPath)
  landmarkerState.poseLandmarker = await createPoseLandmarker(WASM_PATH, poseModelPath);
  landmarkerState.objectDetector = await createObjectDetector(WASM_PATH, `./mediapipe/efficientdet_lite0.tflite`);
  setupWebSocket(socketState.wsURL, socketState);
  enableCam(webcamState, video);
})();

function handleQueryParams(socketState, webcamState) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('wsURL')) {
    socketState.wsURL = urlParams.get('wsURL')
  }
  if (urlParams.has('webcamId')) {
    let camID = urlParams.get('webcamId');
    if (checkDeviceIds(camID, webcamState.webcamDevices)) {
      webcamState.webcamId = camID;
    }
  }
  if (urlParams.has('poseModelType')) {
    let modelType = urlParams.get('poseModelType');
    if (poseModelTypes.hasOwnProperty(modelType)) {
      poseModelPath = poseModelTypes[modelType];
    } else {
      console.error(`Invalid poseModelType: ${modelType}`);
    }
  }
  if (urlParams.has('Showoverlays')) {
    showOverlays = parseInt(urlParams.get('Showoverlays')) === 1;
  }
  if (urlParams.has('Detecthands')) {
    detectHands = parseInt(urlParams.get('Detecthands')) === 1;
  }
  if (urlParams.has('Detectgestures')) {
    detectGestures = parseInt(urlParams.get('Detectgestures')) === 1;
  }
  if (urlParams.has('Detectfaces')) {
    detectFaces = parseInt(urlParams.get('Detectfaces')) === 1;
  }
  if (urlParams.has('Detectposes')) {
    detectPoses = parseInt(urlParams.get('Detectposes')) === 1;
  }
  if (urlParams.has('Detectobjects')) {
    detectObjects = parseInt(urlParams.get('Detectobjects')) === 1;
  }
}

function enableCam(webcamState, video) {
  const constraints = {
    video: {
      deviceId: webcamState.webcamId,
      height: {
        exact: 720
      },
      frameRate: {
        ideal: 60,
        min: 25
      }
    }
  };
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", () => predictWebcam(landmarkerState, webcamState, video));
    webcamState.webcamRunning = true;
    stream.getTracks().forEach(function (track) {
      console.log("Webcam settings: ", track.getSettings());
    })
  })
    .catch(function (err) {
      document.body.style.backgroundColor = "red";
      console.log(err.name + ": " + err.message);
    });
}

function safeSocketSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(data);
  }
}

async function predictWebcam(landmarkerState, webcamState, video) {
  let startDetect = Date.now();

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    console.log('videoWidth or videoHeight is 0')
    return;
  }

  canvasElement.style.width = video.videoWidth;
  canvasElement.style.height = video.videoHeight;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  let startTimeMs = performance.now();
  if (webcamState.lastVideoTime !== video.currentTime) {
    webcamState.lastVideoTime = video.currentTime;
    if (detectHands && landmarkerState.handLandmarker) {
      landmarkerState.handResults = await landmarkerState.handLandmarker.detectForVideo(video, startTimeMs);
      safeSocketSend(socketState.ws, JSON.stringify({ handResults: landmarkerState.handResults }));
    }
    if (detectGestures && landmarkerState.handGestures) {
      landmarkerState.gestureResults = await landmarkerState.handGestures.recognizeForVideo(video, startTimeMs);
      safeSocketSend(socketState.ws, JSON.stringify({ gestureResults: landmarkerState.gestureResults }));
    }
    if (detectFaces && landmarkerState.faceLandmarker) {
      landmarkerState.faceResults = await landmarkerState.faceLandmarker.detectForVideo(video, startTimeMs);
      safeSocketSend(socketState.ws, JSON.stringify({ faceResults: landmarkerState.faceResults }));
    }
    if (detectPoses && landmarkerState.poseLandmarker) {
      landmarkerState.poseResults = await landmarkerState.poseLandmarker.detectForVideo(video, startTimeMs);
      safeSocketSend(socketState.ws, JSON.stringify({ poseResults: landmarkerState.poseResults }));
    }
    if (detectObjects && landmarkerState.objectDetector) {
      landmarkerState.objectResults = await landmarkerState.objectDetector.detectForVideo(video, startTimeMs);
      safeSocketSend(socketState.ws, JSON.stringify({ objectResults: landmarkerState.objectResults }));
    }
  }

  if (showOverlays) {
    if (detectHands) {
      drawHandLandmarks(landmarkerState.handResults, webcamState.drawingUtils);
    }
    if (detectGestures) {
      drawHandGestures(landmarkerState.gestureResults, webcamState.drawingUtils);
    }
    if (detectFaces) {
      drawFaceLandmarks(landmarkerState.faceResults, webcamState.drawingUtils);
    }
    if (detectPoses) {
      drawPoseLandmarks(landmarkerState.poseResults, webcamState.drawingUtils);
    }
  }

  if (webcamState.webcamRunning) {
    window.requestAnimationFrame(() => predictWebcam(landmarkerState, webcamState, video));
  }
  // Figure out how long this took
  // Note that this is not the same as the video time
  let endDetect = Date.now();
  let timeToDetect = Math.round(endDetect - startDetect);
  safeSocketSend(socketState.ws, JSON.stringify({ detectTime: timeToDetect }));
}

function setupWebSocket(socketURL, socketState) {
  socketState.ws = new WebSocket(socketURL);

  socketState.ws.addEventListener('open', () => {
    console.log('WebSocket connection opened:');
    socketState.ws.send('pong');

    getWebcamDevices().then(devices => {
      console.log('Availalbe webcam devices: ', devices)
      socketState.ws.send(JSON.stringify({ type: 'webcamDevices', devices }));
    });
  });

  socketState.ws.addEventListener('message', async (event) => {
    // Process received messages as needed
    if(event.data === 'ping' || event.data === 'pong') return;

    const data = JSON.parse(event.data);
    // console.log("Data received: ", data);
    if (data.type == "selectWebcam") {
      console.log("Got webcamId via WS: " + data.deviceId);
      if (checkDeviceIds(data.deviceId, webcamState.webcamDevices)) {
        webcamState.webcamId = data.deviceId;
      }
      enableCam(webcamState, video);
    }
    if (data.Showoverlays) {
      console.log("showOverlays: " + data.Showoverlays);
      showOverlays = parseInt(data.Showoverlays) === 1;
    }
    if (data.Detectfaces) {
      console.log("detectFaces: " + data.Detectfaces);
      landmarkerState.faceResults = null;
      detectFaces = parseInt(data.Detectfaces) === 1;
    }
    if (data.Detecthands) {
      console.log("detectHands: " + data.Detecthands);
      landmarkerState.handResults = null;
      detectHands = parseInt(data.Detecthands)  === 1;
    }
    if (data.Detectgestures) {
      console.log("detectGestures: " + data.Detectgestures);
      landmarkerState.gestureResults = null;
      detectGestures = parseInt(data.Detectgestures)  === 1;
    }
    if (data.Detectposes) {
      console.log("detectPoses: " + data.Detectposes);
      landmarkerState.poseResults = null;
      detectPoses = parseInt(data.Detectposes)  === 1;
    }
    if (data.Detectobjects) {
      console.log("detectObjects: " + data.Detectobjects);
      landmarkerState.objectResults = null;
      detectObjects = parseInt(data.Detectobjects)  === 1;
    }
  });

  socketState.ws.addEventListener('error', (error) => {
    console.error('Error in websocket connection', error);
  });

  socketState.ws.addEventListener('close', () => {
    console.log('Socket connection closed');
  });
}

function checkDeviceIds(key, deviceIds) {
  for (let i = 0; i < deviceIds.length; i++) {
    if (deviceIds[i].deviceId === key) {
      return true;
    }
  }
  return false;
}

async function getWebcamDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const webcams = devices.filter(device => device.kind === 'videoinput');
    return webcams.map(({ deviceId, label }) => ({ deviceId, label }));
  } catch (error) {
    console.error('Error getting webcam devices:', error);
    document.body.style.backgroundColor = "red";
    return [];
  }
}