import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

let segmentationModelTypes = {
    'selfieSquare': './mediapipe/models/image_segmentation/selfie_segmenter.tflite',
    'selfieLandscape': './mediapipe/models/image_segmentation/selfie_segmenter_landscape.tflite',
    'hairSegmenter': './mediapipe/models/image_segmentation/hair_segmenter.tflite',
    'selfieMulticlass': './mediapipe/models/image_segmentation/selfie_multiclass_256x256.tflite',
    'deepLabV3': './mediapipe/models/image_segmentation/deeplab_v3.tflite',
}

export let segmenterState = {
    modelTypes: segmentationModelTypes,
    detect: false,
    modelPath: segmentationModelTypes['selfieMulticlass'],
    detector: undefined,
    results: undefined,
    segmentationCanvas: "",
    videoElement: "",
    labels: [],
    resultsName: "segmenterResults",
    legendColors: [
        [0, 0, 0, 0], // Background 
        [255, 255, 255, 255], // Hair
        [255, 197, 0, 255], // Body-skin // Vivid Yellow
        [128, 62, 117, 255], // Face-skin // Strong Purple
        [255, 104, 0, 255], // Clothes // Vivid Orange
        [166, 189, 215, 255], // Accessories // Very Light Blue
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
    ],
    draw: () => drawSegmentation(),
};

export const createImageSegmenter = async (WASM_PATH, videoElement, segmentationCanvas) => {
    segmenterState.videoElement = videoElement;
    segmenterState.segmentationCanvas = segmentationCanvas;
    console.log("Starting image segmentation");
    console.log(segmenterState);
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: segmenterState.modelPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
    });
    segmenterState.labels = imageSegmenter.getLabels();
    console.log(segmenterState.labels);
    return imageSegmenter;
};

export function drawSegmentation(video) {
    let segmentCtx = segmenterState.segmentationCanvas.getContext("2d");

    segmenterState.videoElement.style.opacity = 0;

    segmentCtx.width = 1280;
    segmentCtx.height = 720;

    // segmenterState.segmentsCanvas.width = video.videoWidth;
    // segmenterState.segmentsCanvas.height = video.videoHeight;

    // let texture = result.categoryMask.getAsWebGLTexture();
    // let eightBitMap = result.categoryMask.getAsUint8Array();
    // let floatBitMap = result.categoryMask.getAsFloat32Array();

    let imageData = [];
    let confidenceMasks = [];

    // const { width, height } = result.categoryMask;

    /// let category = "";
    const mask = segmenterState.results.categoryMask.getAsFloat32Array();
    // console.log("Category Mask length: " + mask.length);
    let i = 0;
    for (let c of segmenterState.results.confidenceMasks) {
        confidenceMasks[i] = c.getAsFloat32Array();
        // console.log("Got confidence Mask " + i + " " + confidenceMasks[i].length + " long");
        i++;
    }

    // const mask = confidenceMasks[0];
    // console.log(i + " confidence masks loaded");
    // console.log(confidenceMasks);
    // const mask = result.categoryMask.getAsUint8Array();
    /*
    // Using unit8 is suuuper slow for some reason
    for (let i in mask) {
        if (mask[i] > 0) {
            category = labels[mask[i]];
        }
        const legendColor = legendColors[mask[i] % legendColors.length];
        imageData[i * 4] = legendColor[0];
        imageData[i * 4 + 1] = legendColor[1];
        imageData[i * 4 + 2] = legendColor[2];
        imageData[i * 4 + 3] = legendColor[3];
    }
    */
    // console.log("Mask");
    // console.log(mask);
    // let j = 0;
    // for (let i = 0; i < mask.length; ++i) {
    //     // console.log(mask[i]);
    //   const maskVal = Math.round(mask[i] * 255.0);
    //   const legendColor = legendColors[maskVal % legendColors.length];
    //   imageData[j] = legendColor[0];
    //   imageData[j + 1] = legendColor[1];
    //   imageData[j + 2] = legendColor[2];
    //   imageData[j + 3] = legendColor[3];
    //   j += 4;
    // }

    let j = 0;
    for (let i = 0; i < mask.length; ++i) {
        let maskVal = Math.round(mask[i] * 255.0);
        // let maskVal = mask[i];
        // if(i == 460800) {
        //     console.log("460800: "+ maskVal);
        // }
        // console.log(new Set(mask));

        // Do some silliness because the selfie segmenter works differently to the others
        let confidenceVal = 0;
        if (confidenceMasks.length == 1) {
            if(maskVal == 255) {
                maskVal = 0;
                confidenceVal = 255;
            }
            else if(maskVal == 0) {
                maskVal = 1;
                confidenceVal = Math.round(confidenceMasks[0][i] * 255.0);
            }
            // console.log("Single confidence mask");
            // confidenceVal = Math.round(confidenceMasks[0][i] * 255.0);
            // confidenceVal = confidenceMasks[0][i];
        }
        else confidenceVal = Math.round(confidenceMasks[maskVal][i] * 255.0);
        // const confidenceVal = Math.round(confidenceMasks[maskVal][i] * 255.0);
        // confidenceVal = confidenceMasks[maskVal][i];
        const legendColor = segmenterState.legendColors[maskVal % legendColors.length];
        try {
            imageData[j] = legendColor[0];
        } catch {
            console.log("invalid mask value: " + maskVal);
        }
        imageData[j + 1] = legendColor[1];
        imageData[j + 2] = legendColor[2];
        imageData[j + 3] = confidenceVal;
        j += 4;
    }
    /*
    const p = event.target.parentNode.getElementsByClassName(
        "classification"
    )[0];
    p.classList.remove("removed");
    p.innerText = "Category: " + category;
    */
    const uint8Array = new Uint8ClampedArray(imageData);
    const dataNew = new ImageData(
        uint8Array,
        segmentCtx.width,
        segmentCtx.height
    );
    segmentCtx.putImageData(dataNew, 0, 0);
    segmenterState.results.close();
}