import {
    COLORED_OUTPUT_UINT8,
    COLORED_OUTPUT_FLOAT32,
} from "./segmentationPipeline.js";
import {
    createSegmentationClient,
    EMPTY_SEGMENTATION_STATS,
} from "./segmentationClient.js";

// Use RGBA8 for the colored multiclass socket output. Change this one line to
// COLORED_OUTPUT_FLOAT32 to restore full-precision transport when needed.
const DEFAULT_COLORED_OUTPUT_FORMAT = COLORED_OUTPUT_UINT8;
export { COLORED_OUTPUT_FLOAT32, COLORED_OUTPUT_UINT8 };

// Pipeline the next mask while TouchDesigner is still receiving the previous
// one. Set to 1 to restore strict one-packet-at-a-time delivery.
const SEGMENTATION_MAX_IN_FLIGHT = 2;
const SEGMENTATION_ACK_TIMEOUT_MS = 1000;
// Losslessly zlib-compress masks before sending (only once TouchDesigner
// advertises support). Set to false to always send raw masks.
const SEGMENTATION_COMPRESSION = true;

const segmentationModelTypes = {
    selfieSquare:
        "./mediapipe/models/image_segmentation/selfie_segmenter.tflite",
    selfieLandscape:
        "./mediapipe/models/image_segmentation/selfie_segmenter_landscape.tflite",
    hairSegmenter:
        "./mediapipe/models/image_segmentation/hair_segmenter.tflite",
    selfieMulticlass:
        "./mediapipe/models/image_segmentation/selfie_multiclass_256x256.tflite",
    deepLabV3: "./mediapipe/models/image_segmentation/deeplab_v3.tflite",
};

const segmentationModelResolutions = {
    selfieSquare: { width: 256, height: 256 },
    selfieLandscape: { width: 256, height: 144 },
    hairSegmenter: { width: 512, height: 512 },
    selfieMulticlass: { width: 256, height: 256 },
    deepLabV3: { width: 257, height: 257 },
};

export const segmenterState = {
    modelTypes: segmentationModelTypes,
    detect: false,
    modelPath: segmentationModelTypes.selfieMulticlass,
    // The segmentation client (worker or main-thread fallback) once created.
    landmarker: undefined,
    // Whole-person confidence output always remains float32. If the GPU
    // compositor fails, the CPU fallback also emits float32.
    coloredOutputFormat: DEFAULT_COLORED_OUTPUT_FORMAT,
    labels: [],
    resultsName: "segmenterResults",
    // Frames not submitted because the previous one was still processing.
    skippedBusy: 0,
    legendColors: [
        [0, 0, 0, 0], // Background
        [193, 0, 32, 255], // Hair
        [255, 0, 255, 255], // Body skin
        [255, 197, 0, 255], // Face skin
        [0, 255, 0, 255], // Clothes
        [0, 225, 225, 255], // Accessories
        [255, 255, 255, 255], // Selfie
        [0, 0, 255, 255],
        [0, 0, 0, 255],
        [0, 125, 52, 255],
        [0, 83, 138, 255],
        [128, 62, 117, 255],
        [255, 104, 0, 255],
        [166, 189, 215, 255],
        [206, 162, 98, 255],
        [129, 112, 102, 255],
        [246, 118, 142, 255],
        [255, 112, 92, 255],
        [83, 55, 112, 255],
        [255, 142, 0, 255],
        [179, 40, 81, 255],
        [244, 200, 0, 255],
        [127, 24, 13, 255],
        [147, 170, 0, 255],
        [89, 51, 21, 255],
        [241, 58, 19, 255],
        [35, 44, 22, 255],
    ].map((color) => color.map((channel) => channel / 255)),
    showMultiClassBackgroundOnly: false,
};

export async function createImageSegmenter(WASM_PATH, socketURL) {
    console.log("Starting image segmentation");
    const selectedModel = Object.entries(segmenterState.modelTypes).find(
        ([, path]) => path === segmenterState.modelPath,
    )?.[0];
    // Supplying MediaPipe a frame at the model's own tensor size prevents the
    // task from upscaling its mask back to the webcam/output resolution.
    const nativeResolution =
        segmentationModelResolutions[selectedModel] ??
        segmentationModelResolutions.selfieMulticlass;

    const client = await createSegmentationClient({
        socketURL,
        // Absolute URLs: a worker resolves relative paths against its own
        // script location, not the page.
        wasmPath: new URL(WASM_PATH, document.baseURI).href,
        modelPath: new URL(segmenterState.modelPath, document.baseURI).href,
        width: nativeResolution.width,
        height: nativeResolution.height,
        coloredOutputFormat: segmenterState.coloredOutputFormat,
        legendColors: segmenterState.legendColors,
        maxInFlight: SEGMENTATION_MAX_IN_FLIGHT,
        ackTimeoutMs: SEGMENTATION_ACK_TIMEOUT_MS,
        compression: SEGMENTATION_COMPRESSION,
    });
    segmenterState.labels = client.labels;
    console.log(segmenterState.labels);
    return client;
}

export function getSegmentationStats() {
    return segmenterState.landmarker?.stats ?? EMPTY_SEGMENTATION_STATS;
}
