import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { gestureState, handState } from "./state";

export let handState = {
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

export let gestureState = {
    detect: true,
    landmarker: undefined,
    results: undefined,
    resultsName: "gestureResults",
    maxResults: -1,
    scoreThreshold: 0.5,
    draw: (state, canvas) => drawHandGestures(state, canvas),
};

export const createGestureLandmarker = async (WASM_PATH, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let handGestures = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: handState.numHands,
        minHandDetectionConfidence: handState.minDetectionConfidence,
        minHandPresenceConfidence: handState.minPresenceConfidence,
        minTrackingConfidence: handState.minTrackingConfidence,
        cannedGesturesClassifierOptions: {
            maxResults: gestureState.maxResults,
            scoreThreshold: gestureState.scoreThreshold,
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
