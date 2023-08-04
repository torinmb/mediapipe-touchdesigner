import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

export const createObjectDetector = async (WASM_PATH, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.5,
    });
    return objectDetector;
};
