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

import { createFaceLandmarker } from "./faceTracking.js";
import { createHandLandmarker } from "./handTracking.js";
import { createGestureLandmarker } from "./handGestures.js";
import { createPoseLandmarker, poseModelTypes } from "./poseTracking.js";
import { createObjectDetector } from "./objectDetection.js";
import { allowedPars } from "./defaultPars.js";
import { faceState, handState, gestureState, poseState, objectState, webcamState, socketState } from "./state.js";

const WASM_PATH = "./mediapipe/tasks-vision/0.10.3/wasm";
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const objectsDiv = document.getElementById("objects");

let showOverlays = true;
// Keep a reference of all the child elements we create
// so we can remove them easilly on each render.

let allModelState = [faceState, handState, gestureState, poseState, objectState];
let landmarkerModelState = [faceState, handState, gestureState, poseState];


(async function setup() {
  handleQueryParams(socketState, webcamState);
  webcamState.webcamDevices = await getWebcamDevices();
  handState.landmarker = await createHandLandmarker(WASM_PATH, `./mediapipe/hand_landmarker.task`);
  gestureState.landmarker = await createGestureLandmarker(WASM_PATH, `./mediapipe/gesture_recognizer.task`);
  faceState.landmarker = await createFaceLandmarker(WASM_PATH, `./mediapipe/face_landmarker.task`);
  console.log(poseState.poseModelPath)
  poseState.landmarker = await createPoseLandmarker(WASM_PATH, poseState.poseModelPath);
  objectState.landmarker = await createObjectDetector(WASM_PATH, `./mediapipe/efficientdet_lite0.tflite`);
  setupWebSocket(allowedPars['Wsaddress'] + ":" + allowedPars['Wsport'], socketState);
  enableCam(webcamState, video);
})();

function handleQueryParams(socketState, webcamState) {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach((value, key) => {
    //  console.log("Got this: "+ key + " : " + value);
    if(key in allowedPars) {
      allowedPars[key] = value;
    }
  });
  if (urlParams.has('webcamId')) {
    let camID = urlParams.get('webcamId');
    if (checkDeviceIds(camID, webcamState.webcamDevices)) {
      webcamState.webcamId = camID;
    }
  }
  if (urlParams.has('Posemodeltype')) {
    let modelType = urlParams.get('Posemodeltype');
    if (poseModelTypes.hasOwnProperty(modelType)) {
      poseState.poseModelPath = poseModelTypes[modelType];
    } else {
      console.error(`Invalid poseModelType: ${modelType}`);
    }
  }
  if (urlParams.has('Showoverlays')) {
    showOverlays = parseInt(urlParams.get('Showoverlays')) === 1;
  }
  if (urlParams.has('Detecthands')) {
    
    handState.detect = parseInt(urlParams.get('Detecthands')) === 1;
  }
  if (urlParams.has('Detectgestures')) {
    gestureState.detect = parseInt(urlParams.get('Detectgestures')) === 1;
  }
  if (urlParams.has('Detectfaces')) {
    faceState.detect = parseInt(urlParams.get('Detectfaces')) === 1;
  }
  if (urlParams.has('Detectposes')) {
    poseState.detect = parseInt(urlParams.get('Detectposes')) === 1;
  }
  if (urlParams.has('Detectobjects')) {
    objectState.detect = parseInt(urlParams.get('Detectobjects')) === 1;
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
    video.addEventListener("loadeddata", () => predictWebcam(allModelState, objectState, webcamState, video));
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

async function predictWebcam(allModelState, objectState, webcamState, video) {
  let startDetect = Date.now();

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    console.log('videoWidth or videoHeight is 0')
    return;
  }

  canvasElement.style.width = video.videoWidth;
  canvasElement.style.height = video.videoHeight;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  objectsDiv.style.width = video.videoWidth;
  objectsDiv.style.height = video.videoHeight;
  objectsDiv.width = video.videoWidth;
  objectsDiv.height = video.videoHeight;

  let startTimeMs = performance.now();
  if (webcamState.lastVideoTime !== video.currentTime) {
    webcamState.lastVideoTime = video.currentTime;
    for (let landmarker of allModelState) {
      if (landmarker.detect && landmarker.landmarker) {
        // Gesture Model has a different function for detection
        let marker = landmarker.landmarker;
        if(landmarker.resultsName === 'gestureResults') {
          landmarker.results = await marker.recognizeForVideo(video, startTimeMs);
        } else {
          landmarker.results = await marker.detectForVideo(video, startTimeMs);
        }
        safeSocketSend(socketState.ws, JSON.stringify({ [landmarker['resultsName']] : landmarker.results }));
      }
    }
  }

  if (showOverlays) {
    for (let landmarker of landmarkerModelState) {
      if (landmarker.detect && landmarker.results) {
        landmarker.draw(landmarker.results, webcamState.drawingUtils);
      }
    }
    // unique draw function for object detection
    if(objectState.detect && objectState.results) {
      objectState.draw(objectState.results, objectState.children, objectsDiv);
    }
  }

  if (webcamState.webcamRunning) {
    window.requestAnimationFrame(() => predictWebcam(allModelState, objectState, webcamState, video));
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
    if (event.data === 'ping' || event.data === 'pong') return;

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
      for (let child of objectState.children) {
        objectsDiv.removeChild(child);
      }
      objectState.children.splice(0);
    }
    if (data.Detectfaces) {
      console.log("detectFaces: " + data.Detectfaces);
      faceState.results = null;
      faceState.detect = parseInt(data.Detectfaces) === 1;
    }
    if (data.Detecthands) {
      console.log("detectHands: " + data.Detecthands);
      handState.results = null;
      handState.detect = parseInt(data.Detecthands) === 1;
    }
    if (data.Detectgestures) {
      console.log("detectGestures: " + data.Detectgestures);
      gestureState.results = null;
      gestureState.detect = parseInt(data.Detectgestures) === 1;
    }
    if (data.Detectposes) {
      console.log("detectPoses: " + data.Detectposes);
      poseState.results = null;
      poseState.detect = parseInt(data.Detectposes) === 1;
    }
    if (data.Detectobjects) {
      console.log("detectObjects: " + data.Detectobjects);
      objectState.results = null;
      objectState.detect = parseInt(data.Detectobjects) === 1;
      for (let child of objectState.children) {
        objectsDiv.removeChild(child);
      }
      objectState.children.splice(0);
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