import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export const createHandLandmarker = async (WASM_PATH, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
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
