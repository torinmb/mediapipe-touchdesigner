import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { handState } from "./state";

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

export const createHandLandmarker = async (WASM_PATH, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: handState.numHands,
        minHandDetectionConfidence: handState.minDetectionConfidence,
        minHandPresenceConfidence: handState.minPresenceConfidence,
        minTrackingConfidence: handState.minTrackingConfidence,
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
