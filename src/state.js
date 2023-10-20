import { DrawingUtils } from "@mediapipe/tasks-vision";

const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

export let webcamState = {
  videoElement: "",
  webcamRunning: false,
  webcamDevices: [],
  webcamLabel: '',
  webcamId: 'default',
  lastVideoTime: -1,
  targetFrameRate: 30,
  width: 1280,
  height: 720,
  frameRate: 30,
  flipped: 0,
  drawingUtils: new DrawingUtils(canvasCtx),
  startWebcam: () => changeWebcam(webcamState.webcamLabel),
  changeWebcam: (webcam) => changeWebcam(webcam),
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

async function changeWebcam(webcam) {
  if (webcam !== webcamState.webcamLabel) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const webcamDevices = devices.filter(device => device.kind === 'videoinput');
    // console.log("Got webcams: ", webcamDevices);
    webcamDevices.forEach((webcamDevice) => {
      if (webcamDevice.label == webcam) {
        webcamState.webcamId = webcamDevice.deviceId;
        console.log("Using webcam: " + webcamDevice.label);
        console.log("Reported capabilities:", webcamDevice.getCapabilities());
      }
    });

    const constraints = {
      video: {
        deviceId: {
          exact: webcamState.webcamId,
        },
        height: {
          exact: webcamState.height,
        },
        frameRate: {
          ideal: webcamState.targetFrameRate,
        }
      }
    };

    // Stop the old webcam stream
    if (webcamState.webcamRunning) {
      const tracks = webcamState.videoElement.srcObject.getTracks();
      tracks.forEach((track) => {
        track.stop();
      });
    }

    // Try and start a new one
    try {
      let stream = await navigator.mediaDevices.getUserMedia(constraints);
      webcamState.videoElement.srcObject = stream;
      webcamState.webcamRunning = true;
      webcamState.webcamLabel = webcam;
      stream.getTracks().forEach(function (track) {
        let trackSettings = track.getSettings();
        webcamState.frameRate = trackSettings.frameRate;
        console.log("Webcam started with following settings: ", trackSettings);
      });
    } catch (err) {
      console.log("Error starting webcam: " + err.name + ": " + err.message);
      socketState.ws.send(JSON.stringify({ error: 'webcamStartFail' }));
    }
    webcamState.videoElement.height = webcamState.height;
  }
  if(webcamState.flipped) {
    webcamState.videoElement.style.transform = 'scaleX(-1)';
  }
  else {
    webcamState.videoElement.style.transform = 'scaleX(1)';
  }
}