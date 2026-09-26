// Shared by the parallel-models experiment page and its workers: creates the
// app's eight default models and runs one frame through a list of them.
import {
    FilesetResolver,
    FaceLandmarker,
    FaceDetector,
    HandLandmarker,
    GestureRecognizer,
    PoseLandmarker,
    ObjectDetector,
    ImageClassifier,
    ImageEmbedder,
} from "@mediapipe/tasks-vision";

const MODELS = "/mediapipe/models/";

const factories = {
    face: (vision, canvas) =>
        FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}face_landmark_detection/face_landmarker.task`, delegate: "GPU" },
            canvas, runningMode: "VIDEO", numFaces: 1,
            outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
        }),
    facedet: (vision, canvas) =>
        FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}face_detection/blaze_face_short_range.tflite`, delegate: "GPU" },
            canvas, runningMode: "VIDEO",
        }),
    hands: (vision, canvas) =>
        HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}hand_landmark_detection/hand_landmarker.task`, delegate: "GPU" },
            canvas, runningMode: "VIDEO", numHands: 2,
        }),
    gestures: (vision, canvas) =>
        GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}gesture_recognition/gesture_recognizer.task`, delegate: "GPU" },
            canvas, runningMode: "VIDEO", numHands: 2,
        }),
    pose: (vision, canvas) =>
        PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}pose_landmark_detection/pose_landmarker_full.task`, delegate: "GPU" },
            canvas, runningMode: "VIDEO",
        }),
    objects: (vision, canvas) =>
        ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}object_detection/efficientdet_lite0.tflite`, delegate: "GPU" },
            canvas, runningMode: "VIDEO", scoreThreshold: 0.5,
        }),
    image: (vision, canvas) =>
        ImageClassifier.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}image_classification/efficientnet_lite0.tflite`, delegate: "GPU" },
            canvas, runningMode: "VIDEO",
        }),
    embed: (vision, canvas) =>
        ImageEmbedder.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}image_embedder/mobilenet_v3_large.tflite`, delegate: "GPU" },
            canvas, runningMode: "VIDEO",
        }),
};

const runners = {
    face: (m, image, ts) => m.detectForVideo(image, ts),
    facedet: (m, image, ts) => m.detectForVideo(image, ts),
    hands: (m, image, ts) => m.detectForVideo(image, ts),
    gestures: (m, image, ts) => m.recognizeForVideo(image, ts),
    pose: (m, image, ts) => m.detectForVideo(image, ts),
    objects: (m, image, ts) => m.detectForVideo(image, ts),
    image: (m, image, ts) => m.classifyForVideo(image, ts),
    embed: (m, image, ts) => m.embedForVideo(image, ts),
};

export async function createModels(names, wasmPath, makeCanvas) {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    const models = [];
    for (const name of names) {
        models.push([name, await factories[name](vision, makeCanvas())]);
    }
    return models;
}

// Runs every model on one frame. Returns milliseconds spent per model.
export function runModels(models, image, timestampMs) {
    const times = {};
    for (const [name, model] of models) {
        const start = performance.now();
        const result = runners[name](model, image, timestampMs);
        // Pose returns masks that must be released.
        result?.segmentationMasks?.forEach?.((mask) => mask.close());
        times[name] = performance.now() - start;
    }
    return times;
}
