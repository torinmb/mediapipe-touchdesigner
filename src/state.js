import { DrawingUtils } from "@mediapipe/tasks-vision";

const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

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
  offscreenCanvas,
  offscreenCtx,
  drawingUtils: new DrawingUtils(canvasCtx),
  startWebcam: () => changeWebcam(webcamState.webcamLabel),
  changeWebcam: (webcam) => changeWebcam(webcam),
};

export let socketState = {
  adddress: 'ws://localhost',
  port: '3002',
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
  let webcamFound = true;
  if (webcam !== webcamState.webcamLabel) {
    webcamFound = false;
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.log("enumerateDevices() not supported.");
    } else {
      // List cameras and microphones.
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          devices = devices.filter(device => device.kind === 'videoinput');
          webcamDevices.push(devices);
          devices.forEach((device) => {
            if (device.label == webcam) {
              webcamState.webcamId = device.deviceId;
              console.log("Found webcam: " + device.label);
              console.log("Reported capabilities:", device.getCapabilities());
            }
            webcamFound = true;
            // console.log(`${device.kind}: ${device.label} id = ${device.deviceId}`);
          });
        })
        .catch((err) => {
          console.error(`${err.name}: ${err.message}`);
        });
    }

    if (!webcamFound) {
      console.log("Can't find webcam: " + webcamState.webcamLabel);
      // `socketState.ws.send(JSON.stringify({ error: 'webcamNotFound' }));
    } else {
      const constraints = {
        video: {
          deviceId: {
            exact: webcamState.webcamId,
          },
          height: {
            exact: webcamState.height,
          },
          width: {
            exact: webcamState.width,
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
        webcamState.webcamRunning = false;
      }

      // Try and start a new one
      try {
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        webcamState.videoElement.srcObject = stream;
        webcamState.webcamLabel = webcam;
        stream.getTracks().forEach(function (track) {
          let trackSettings = track.getSettings();
          webcamState.frameRate = trackSettings.frameRate;
          console.log("Webcam started with following settings: ", trackSettings);
        });
        webcamState.webcamRunning = true;
        webcamState.videoElement.height = webcamState.height;
        socketState.ws.send(JSON.stringify({ success: 'webcamStarted' }));
      } catch (err) {
        console.log("Error starting webcam: " + err.name + ": " + err.message);
        socketState.ws.send(JSON.stringify({ error: 'webcamStartFail' }));
      }
    }
    offscreenCanvas.width = webcamState.width;
    offscreenCanvas.height = webcamState.height;
    if (webcamState.flipped) {
      webcamState.videoElement.style.transform = 'scaleX(-1)';
    }
    else {
      webcamState.videoElement.style.transform = 'scaleX(1)';
    }
  }
}