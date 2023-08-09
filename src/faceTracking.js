import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { faceLandmarkState } from "./state";

export const createFaceLandmarker = async (wasm_path, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(wasm_path);
    let faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: faceLandmarkState.numFaces,
        minDetectionConfidence: faceLandmarkState.minDetectionConfidence,
        minPresenceConfidence: faceLandmarkState.minPresenceConfidence,
        minTrackingConfidence: faceLandmarkState.minTrackingConfidence,
        outputBlendshapes: faceLandmarkState.outputBlendshapes,
        outputTransformationMatrixes: faceLandmarkState.outputTransformationMatrixes,
    });
    return faceLandmarker;
};

export function drawFaceLandmarks(results, drawingUtils) {
    if (results && results.faceLandmarks) {
        for (const landmarks of results.faceLandmarks) {
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                { color: "#C0C0C070", lineWidth: 1 }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                { color: "#FF3030" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
                { color: "#FF3030" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                { color: "#30FF30" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
                { color: "#30FF30" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                { color: "#E0E0E0" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LIPS,
                { color: "#E0E0E0" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
                { color: "#FF3030" }
            );
            drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
                { color: "#30FF30" }
            );
        }
    }
}
