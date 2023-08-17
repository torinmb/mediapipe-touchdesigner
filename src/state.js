import { DrawingUtils } from "@mediapipe/tasks-vision";

const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

export let webcamState = {
    videoElement: "",
    webcamRunning: false,
    webcamDevices: [],
    webcamId: 'default',
    lastVideoTime: -1,
    targetFrameRate: 30,
    width: 1280,
    height: 720,
    frameRate: 30,
    drawingUtils: new DrawingUtils(canvasCtx),
};
  
export let socketState = {
    adddress: 'ws://localhost',
    port: '9980',
    ws: undefined,
};

export let overlayState = {
  show: true,
}

export let outputState = {
  width: 1280,
  height: 720,
}