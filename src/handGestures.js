import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

let gestureModelTypes = {
	'full': './mediapipe/models/gesture_recognition/gesture_recognizer.task',
}

export let gestureState = {
    modelTypes: gestureModelTypes,
	modelPath: gestureModelTypes['full'],
    detect: true,
    landmarker: undefined,
    results: undefined,
    resultsName: "gestureResults",
    numHands: 2,
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    maxResults: -1,
    scoreThreshold: 0.5,
    draw: (state, canvas) => drawHandGestures(state, canvas),
};

export const createGestureLandmarker = async (WASM_PATH) => {
    console.log("Starting gesture detection");
	console.log(gestureState);
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let handGestures = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: gestureState.modelPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: parseInt(gestureState.numHands),
        minHandDetectionConfidence: parseFloat(gestureState.minDetectionConfidence),
        minHandPresenceConfidence: parseFloat(gestureState.minPresenceConfidence),
        minTrackingConfidence: parseFloat(gestureState.minTrackingConfidence),
        cannedGesturesClassifierOptions: {
            maxResults: parseInt(gestureState.maxResults),
            scoreThreshold: parseFloat(gestureState.scoreThreshold),
        },
    });
    return handGestures;
};

export function drawHandGestures(results, drawingUtils) {
    if (results && results.landmarks) {
        for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(
                landmarks,
                GestureRecognizer.HAND_CONNECTIONS,
                {
                    color: "#00FF00",
                    lineWidth: 5,
                }
            );
            drawingUtils.drawLandmarks(landmarks, {
                color: "#FF0000",
                lineWidth: 2,
            });
        }
    }
}
