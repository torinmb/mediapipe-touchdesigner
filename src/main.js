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
import { createPoseLandmarker, drawPoseLandmarks } from "./poseTracking.js";

let handLandmarker = undefined;
let faceLandmarker = undefined;
let poseLandmarker = undefined;

let webcamRunning = false;
let ws = undefined;
let webcamDevices = [];
let webcamId = 'default';
let wsURL = 'ws://localhost:9980';

const WASM_PATH = "./mediapipe/tasks-vision/0.10.2/wasm";

async function setup(){
  handelQueryParams()
  webcamDevices = await getWebcamDevices();
  handLandmarker = await createHandLandmarker(WASM_PATH, `./mediapipe/hand_landmarker.task`);
  faceLandmarker = await createFaceLandmarker(WASM_PATH, `./mediapipe/face_landmarker.task`);
  poseLandmarker = await createPoseLandmarker(WASM_PATH, `./mediapipe/pose_landmarker_lite.task`);
  setupWebSocket(wsURL);
  enableCam();
}

function handelQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('wsURL')) {
    wsURL = urlParams.get('wsURL')
  }
  if (urlParams.has('webcamId')) {
    let camID =  urlParams.get('webcamId');
    if (checkDeviceIds(webcamId, webcamDevices)) {
      webcamId = camID;
    }
  }
}

setup();

const video = document.getElementById("webcam");
let canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);

const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

function enableCam() {
  console.log("enableCam")
  const constraints = {
    video: {
      deviceId: webcamId,
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
    webcamRunning = true;
  });
}

let lastVideoTime = -1;
let handResults = undefined;
let faceResults = undefined;
let poseResults = undefined;
console.log(video);

function safeSocketSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(data);
  }
}

async function predictWebcam() {
  canvasElement.style.width = video.videoWidth;;
  canvasElement.style.height = video.videoHeight;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  if (video.videoWidth === 0 || video.videoHeight === 0)  {
    console.log('videoWidth or videoHeight is 0')
    // window.requestAnimationFrame(predictWebcam);
    return;
  }
  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    if(handLandmarker){
      handResults = handLandmarker.detectForVideo(video, startTimeMs);
      safeSocketSend(ws, JSON.stringify({ handResults }));
    }
    if(faceLandmarker){
      faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
      safeSocketSend(ws, JSON.stringify({ faceResults }));
    }
    if(poseLandmarker){
      poseResults = poseLandmarker.detectForVideo(video, startTimeMs);
      safeSocketSend(ws, JSON.stringify({ poseResults }));
    }
  }

  drawFaceLandmarks(faceResults, drawingUtils);
  drawHandLandmarks(handResults, drawingUtils);
  drawPoseLandmarks(poseResults, drawingUtils);
  
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}


function setupWebSocket(socketURL) {
  ws = new WebSocket(socketURL);

  ws.addEventListener('open', () => {
    console.log('WebSocket connection opened:', event);
    ws.send('pong');
    
    getWebcamDevices().then(devices => {
      console.log('devices', devices)
      ws.send(JSON.stringify({ type: 'webcamDevices', devices }));
    });
  });

  ws.addEventListener('message', async (event) => {
    if (event && event.data ) {
      if (event.data === "ping") {
        ws.send("pong");
        return;
      } else if (event.data === "pong") {
        return;
      }
    }
    const message = JSON.parse(event.data);
    if (message.type === 'selectWebcam') {
      console.log("GOT selectwebcam message", message)
      const deviceId = message.deviceId;
      
      if (checkDeviceIds(deviceId, webcamDevices)) {
        // TODO reset webcam
        // webcamId = deviceId;
        // enableCam();
      }
    }
  });  

  ws.addEventListener('error', (error) => {
    console.error('Error in websocket connection', error);
  });

  ws.addEventListener('close', () => {
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
    console.log('webcams', webcams)
    return webcams.map(({ deviceId, label }) => ({ deviceId, label }));
  } catch (error) {
    console.error('Error getting webcam devices:', error);
    return [];
  }
}

