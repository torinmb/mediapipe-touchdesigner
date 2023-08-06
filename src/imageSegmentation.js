import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const legendColors = [
    [255, 197, 0, 255], // Vivid Yellow
    [128, 62, 117, 255], // Strong Purple
    [255, 104, 0, 255], // Vivid Orange
    [166, 189, 215, 255], // Very Light Blue
    [193, 0, 32, 255], // Vivid Red
    [206, 162, 98, 255], // Grayish Yellow
    [129, 112, 102, 255], // Medium Gray
    [0, 125, 52, 255], // Vivid Green
    [246, 118, 142, 255], // Strong Purplish Pink
    [0, 83, 138, 255], // Strong Blue
    [255, 112, 92, 255], // Strong Yellowish Pink
    [83, 55, 112, 255], // Strong Violet
    [255, 142, 0, 255], // Vivid Orange Yellow
    [179, 40, 81, 255], // Strong Purplish Red
    [244, 200, 0, 255], // Vivid Greenish Yellow
    [127, 24, 13, 255], // Strong Reddish Brown
    [147, 170, 0, 255], // Vivid Yellowish Green
    [89, 51, 21, 255], // Deep Yellowish Brown
    [241, 58, 19, 255], // Vivid Reddish Orange
    [35, 44, 22, 255], // Dark Olive Green
    [0, 161, 194, 255] // Vivid Blue
];

export const segmentationModelTypes = {
    'selfieSquare': './mediapipe/selfie_segmenter.tflite',
    'selfieLandscape': './mediapipe/selfie_segmenter_landscape.tflite',
    'selfieMulticlass': './mediapipe/selfie_multiclass_256x256.tflite',
    'deepLabV3': './mediapipe/deeplab_v3.tflite',
}

let segmentationCanvas = document.getElementById("segmentation");
let segmentCtx = segmentationCanvas.getContext("2d");

segmentCtx.width = "1280px";
segmentCtx.height = "720px";
// let segmentationWebgl = segmentationCanvas.getContext("webgl");

export const createImageSegmenter = async (WASM_PATH, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
    });
    return imageSegmenter;
};

export function drawSegmentation(result, video) {
    // let texture = result.categoryMask.getAsWebGLTexture();
    let eightBitMap = result.categoryMask.getAsUint8Array();
    // let floatBitMap = result.categoryMask.getAsFloat32Array();

    const maskCanvas = result.categoryMask.canvas;
    const gl = maskCanvas.getContext("webgl2");

    // console.log(gl);
    // console.log(eightBitMap);
    // https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap
    // const renderedBitmap = maskCanvas.transferToImageBitmap();
    // const two = segmentationCanvas.getContext("bitmaprenderer");

    // two.transferFromImageBitmap(renderedBitmap);

    // Tell WebGL how to convert from clip space to pixels
    // console.log(result.categoryMask.canvas);


    // result.close();
}