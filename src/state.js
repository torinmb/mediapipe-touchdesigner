import { DrawingUtils } from "@mediapipe/tasks-vision";

const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

const FRAME_RATE_TOLERANCE = 0.98;

const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");

export let webcamState = {
    videoElement: "",
    webcamRunning: false,
    webcamDevices: [],
    webcamLabel: "",
    webcamId: "default",
    lastVideoTime: -1,
    sourceFrame: 0,
    targetFrameRate: 60,
    width: window.innerWidth,
    height: window.innerHeight,
    frameRate: 60,
    flipped: 0,
    offscreenCanvas,
    offscreenCtx,
    drawingUtils: new DrawingUtils(canvasCtx),
    startWebcam: () => changeWebcam(webcamState.webcamLabel),
    changeWebcam: (webcam) => changeWebcam(webcam),
};

export let socketState = {
    adddress: "ws://localhost",
    port: "3002",
    ws: undefined,
};

export let overlayState = {
    show: true,
};

export let outputState = {
    width: window.innerWidth,
    height: window.innerHeight,
};

async function changeWebcam(webcam) {
    console.log("Attempting to change webcam to " + webcam);
    var webcamFound = true;
    if (webcam !== webcamState.webcamLabel) {
        webcamFound = false;
        if (!navigator.mediaDevices?.enumerateDevices) {
            console.log("enumerateDevices() not supported.");
        } else {
            // List cameras and microphones.
            navigator.mediaDevices
                .enumerateDevices()
                .then((devices) => {
                    devices = devices.filter(
                        (device) => device.kind === "videoinput"
                    );
                    webcamState.webcamDevices = devices;
                    // console.log(`${device.kind}: ${device.label} id = ${device.deviceId}`);
                    devices.forEach((device) => {
                        if (device.label == webcam) {
                            webcamState.webcamId = device.deviceId;
                            console.log("Found webcam: " + device.label);
                            console.log(
                                "Reported capabilities:",
                                device.getCapabilities()
                            );
                            webcamFound = true;
                        }
                    });
                    if (!webcamFound) {
                        console.log(
                            "Can't find webcam: " + webcamState.webcamLabel
                        );
                        // `socketState.ws.send(JSON.stringify({ error: 'webcamNotFound' }));
                    } else if (
                        !webcamState.webcamRunning ||
                        webcamState.webcamLabel != webcam
                    ) {
                        webcamState.webcamLabel = webcam;
                        startNewWebcam();
                    }
                })
                .catch((err) => {
                    console.error(`${err.name}: ${err.message}`);
                });
        }
    }
    if (webcamState.flipped) {
        webcamState.videoElement.style.transform = "scaleX(-1)";
    } else {
        webcamState.videoElement.style.transform = "scaleX(1)";
    }
}

async function startNewWebcam() {
	const requestedFrameRate =
		Number.isFinite(Number(webcamState.targetFrameRate))
			? Number(webcamState.targetFrameRate)
			: 60;
	const constraints = {
        video: {
            deviceId: {
                exact: webcamState.webcamId,
            },
            width: {
                ideal: window.innerWidth,
                // exact: webcamState.width,
            },
            height: {
                ideal: window.innerHeight,
                // exact: webcamState.height,
            },
            // aspectRatio: 1.7777777777777777,
			frameRate: {
				ideal: requestedFrameRate,
			},
        },
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
		let stream;
		try {
			// An `ideal` frame rate never fails and is traded off against the
			// ideal size, so a camera that only reaches the target at a lower
			// resolution would silently stay at 30. Require it first, with 2%
			// slack so NTSC-timed devices (59.94, 29.97, 119.88) still qualify.
			constraints.video.frameRate.min = requestedFrameRate * FRAME_RATE_TOLERANCE;
			stream = await navigator.mediaDevices.getUserMedia(constraints);
		} catch (preferredFrameRateError) {
			// Fall back to whatever the camera does best at the ideal size.
			console.warn(
				`Webcam cannot run at ${requestedFrameRate} FPS; using its closest supported rate`,
				preferredFrameRateError,
			);
			delete constraints.video.frameRate.min;
			stream = await navigator.mediaDevices.getUserMedia(constraints);
		}
		webcamState.videoElement.srcObject = stream;
		const trackSettings = stream.getVideoTracks()[0]?.getSettings() ?? {};
		webcamState.frameRate = trackSettings.frameRate;
		console.log("Webcam started with following settings: ", trackSettings);
        webcamState.webcamRunning = true;
        // webcamState.webcamLabel = webcam;
        webcamState.videoElement.height = webcamState.height;
		// TouchDesigner logs this so users can see whether the requested rate
		// took; timers also carry sourceFrameRate every frame.
		socketState.ws.send(JSON.stringify({
			success: "webcamStarted",
			requestedFrameRate,
			frameRate: trackSettings.frameRate ?? 0,
			width: trackSettings.width ?? 0,
			height: trackSettings.height ?? 0,
		}));
    } catch (err) {
        console.log("Error starting webcam: " + err.name + ": " + err.message);
        socketState.ws.send(JSON.stringify({ error: "webcamStartFail" }));
    }

    offscreenCanvas.width = webcamState.width;
    offscreenCanvas.height = webcamState.height;
}
