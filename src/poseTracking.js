import { FilesetResolver, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

let poseModelTypes = {
    'lite': './mediapipe/models/pose_landmark_detection/pose_landmarker_lite.task',
    'full': './mediapipe/models/pose_landmark_detection/pose_landmarker_full.task',
    'heavy': './mediapipe/models/pose_landmark_detection/pose_landmarker_heavy.task',
    'segmenterResults': false,
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
    outputSegmentationMasks: true,
    segmentationCanvas: "pose_segmentation",
    segmentationDrawingUtils: null,
    drawPoseSegmentation: undefined,
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
        outputSegmentationMasks: true, ///////////////////////////////////////////////////
    });
    let segmentationCanvas = document.getElementById(poseState.segmentationCanvas);
    let segmentationCtx = segmentationCanvas.getContext("webgl2");
    // let segmentationCtx = segmentationCanvas.getContext("2d");
    poseState.segmentationDrawingUtils = new DrawingUtils(segmentationCtx);
    poseState.drawPoseSegmentation = drawPoseSegmentation;
    return poseLandmarker;
};

export function drawPoseLandmarks(results, drawingUtils) {
    if (results && results.landmarks) {
        // console.log("got pose landmarks");
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

export function drawPoseSegmentation(results) {
    console.log(results);
    if (results && results.g[0]) {
        // console.log("Got a mask");
        poseState.segmentationDrawingUtils.drawConfidenceMask(
            results.g[0],
            [255, 0, 0, 255], // Canvas or RGBA colour to use when confisence values are low
            [0, 255, 0, 255]);  // Canvas or RGBA colour to use when confisence values are high
    }
}