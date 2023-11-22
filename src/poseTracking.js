import { FilesetResolver, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

let poseModelTypes = {
    'lite': './mediapipe/models/pose_landmark_detection/pose_landmarker_lite.task',
    'full': './mediapipe/models/pose_landmark_detection/pose_landmarker_full.task',
    'heavy': './mediapipe/models/pose_landmark_detection/pose_landmarker_heavy.task',
}

export let poseState = {
    modelTypes: poseModelTypes,
    detect: true,
    modelPath: poseModelTypes['full'],
    landmarker: undefined,
    results: undefined,
    resultsName: "poseResults",
    numPoses: 1,
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    draw: (state, canvas) => drawPoseLandmarks(state, canvas),
};

export const createPoseLandmarker = async (WASM_PATH) => {
    console.log("Starting pose detection")
    console.log(poseState);
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    console.log('numPoses', parseInt(poseState.numPoses))
    let poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: poseState.modelPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: parseInt(poseState.numPoses),
        minPoseDetectionConfidence: parseFloat(poseState.minDetectionConfidence),
        minPosePresenceConfidence: parseFloat(poseState.minPresenceConfidence),
        minTrackingConfidence: parseFloat(poseState.minTrackingConfidence),
    });
    return poseLandmarker;
};

export function drawPoseLandmarks(results, drawingUtils) {
    if (results && results.landmarks) {
        for (const landmark of results.landmarks) {
            drawingUtils.drawLandmarks(landmark, {
                radius: (data) =>
                    DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
            });
            drawingUtils.drawConnectors(
                landmark,
                PoseLandmarker.POSE_CONNECTIONS
            );
        }
    }
}
