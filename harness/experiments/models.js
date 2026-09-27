// Shared by the parallel-models experiment page and its workers: creates the
// app's eight default models and runs one frame through a list of them.
// The MediaPipe build is passed in (lib), so the page can compare versions.
import * as defaultLib from "@mediapipe/tasks-vision";

const MODELS = "/mediapipe/models/";

const factories = {
    face: (lib, vision, canvas, delegate) =>
        lib.FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}face_landmark_detection/face_landmarker.task`, delegate },
            canvas, runningMode: "VIDEO", numFaces: 1,
            outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
        }),
    facedet: (lib, vision, canvas, delegate) =>
        lib.FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}face_detection/blaze_face_short_range.tflite`, delegate },
            canvas, runningMode: "VIDEO",
        }),
    hands: (lib, vision, canvas, delegate) =>
        lib.HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}hand_landmark_detection/hand_landmarker.task`, delegate },
            canvas, runningMode: "VIDEO", numHands: 2,
        }),
    gestures: (lib, vision, canvas, delegate) =>
        lib.GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}gesture_recognition/gesture_recognizer.task`, delegate },
            canvas, runningMode: "VIDEO", numHands: 2,
        }),
    pose: (lib, vision, canvas, delegate) =>
        lib.PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}pose_landmark_detection/pose_landmarker_full.task`, delegate },
            canvas, runningMode: "VIDEO",
        }),
    objects: (lib, vision, canvas, delegate) =>
        lib.ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}object_detection/efficientdet_lite0.tflite`, delegate },
            canvas, runningMode: "VIDEO", scoreThreshold: 0.5,
        }),
    image: (lib, vision, canvas, delegate) =>
        lib.ImageClassifier.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}image_classification/efficientnet_lite0.tflite`, delegate },
            canvas, runningMode: "VIDEO",
        }),
    embed: (lib, vision, canvas, delegate) =>
        lib.ImageEmbedder.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${MODELS}image_embedder/mobilenet_v3_large.tflite`, delegate },
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

// cpuNames: models to run with the CPU (XNNPACK) delegate instead of GPU.
export async function createModels(names, wasmPath, makeCanvas, cpuNames = [], lib = defaultLib) {
    const vision = await lib.FilesetResolver.forVisionTasks(wasmPath);
    const models = [];
    for (const name of names) {
        const delegate = cpuNames.includes(name) ? "CPU" : "GPU";
        models.push([name, await factories[name](lib, vision, makeCanvas(), delegate)]);
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
