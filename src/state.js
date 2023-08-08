import { DrawingUtils } from "@mediapipe/tasks-vision";
import { drawFaceLandmarks } from "./faceTracking.js";
import { drawHandLandmarks } from "./handTracking.js";
import { drawHandGestures } from "./handGestures.js";
import { drawPoseLandmarks, poseModelTypes } from "./poseTracking.js";
import { drawObjects } from "./objectDetection.js";


export let faceState = {
  detect: true,
  landmarker: undefined,
  results: undefined,
  resultsName: "faceResults",
  draw: (state, canvas) => drawFaceLandmarks(state, canvas),
};

export let handState = {
  detect: false,
  landmarker: undefined,
  results: undefined,
  resultsName: "handResults",
  draw: (state, canvas) => drawHandLandmarks(state, canvas),
};

export let gestureState = {
  detect: true,
  landmarker: undefined,
  results: undefined,
  resultsName: "gestureResults",
  draw: (state, canvas) => drawHandGestures(state, canvas),
};

export let poseState = {
  detect: true,
  poseModelPath: poseModelTypes['full'],
  landmarker: undefined,
  results: undefined,
  resultsName: "poseResults",
  draw: (state, canvas) => drawPoseLandmarks(state, canvas),
};

export let objectState = {
  detect: false,
  detector: undefined,
  results: undefined,
  children: [],
  resultsName: "objectResults",
  draw: (result, children, objectsDiv) => drawObjects(result, children, objectsDiv),
};

const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

export let webcamState = {
    webcamRunning: false,
    webcamDevices: [],
    webcamId: 'default',
    lastVideoTime: -1,
    drawingUtils: new DrawingUtils(canvasCtx),
};
  
export let socketState = {
    ws: undefined,
};