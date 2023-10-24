import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let handModelTypes = {
	'full': './mediapipe/models/hand_landmark_detection/hand_landmarker.task',
}

export let handState = {
    modelTypes: handModelTypes,
	modelPath: handModelTypes['full'],
    detect: false,
    landmarker: undefined,
    results: undefined,
    resultsName: "handResults",
    numHands: 2,
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    draw: (state, canvas) => drawHandLandmarks(state, canvas),
  };

export const createHandLandmarker = async (WASM_PATH, modelAssetPath) => {
    console.log("Starting hand landmark detection");
	console.log(handState);
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: handState.modelPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: parseInt(handState.numHands),
        minHandDetectionConfidence: parseFloat(handState.minDetectionConfidence),
        minHandPresenceConfidence: parseFloat(handState.minPresenceConfidence),
        minTrackingConfidence: parseFloat(handState.minTrackingConfidence),
    });
    return handLandmarker;
};

export function drawHandLandmarks(results, drawingUtils) {
    if (results && results.landmarks) {
        for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(
                landmarks,
                HandLandmarker.HAND_CONNECTIONS,
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
