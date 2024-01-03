import { FilesetResolver, ImageEmbedder } from "@mediapipe/tasks-vision";

let imageEmbedderModelTypes = {
    'small': './mediapipe/models/image_embedder/mobilenet_v3_small.tflite',
    'large': './mediapipe/models/image_embedder/mobilenet_v3_large.tflite',
}

export let imageEmbedderState = {
    modelTypes: imageEmbedderModelTypes,
    detect: true,
    modelPath: imageEmbedderModelTypes['large'],
    landmarker: undefined,
    results: undefined,
    resultsName: "imageEmbedderResults",
    draw: (state, canvas) => drawPoseLandmarks(state, canvas),
};

export const createImageEmbedder = async (WASM_PATH) => {
    console.log("Starting Image Embedder")
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    let imageEmbedder = await ImageEmbedder.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: imageEmbedderState.modelPath,
        },
        runningMode: "VIDEO",
    });
    return imageEmbedder;
};

// export function drawPoseLandmarks(results, drawingUtils) {
//     if (results && results.landmarks) {
//         for (const landmark of results.landmarks) {
//             drawingUtils.drawLandmarks(landmark, {
//                 radius: (data) =>
//                     DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
//             });
//             drawingUtils.drawConnectors(
//                 landmark,
//                 PoseLandmarker.POSE_CONNECTIONS
//             );
//         }
//     }
// }


  async function predictWebcam() {
    // if image mode is initialized, create a new embedder with video runningMode
    if (runningMode === "IMAGE") {
      runningMode = "VIDEO";
      await imageEmbedder.setOptions({ runningMode: runningMode });
    }
  
    // Embed image using imageEmbedder.embedForVideo().
    const startTimeMs = performance.now();
    const embedderResult = await imageEmbedder.embedForVideo(video, startTimeMs);
  
    if (uploadImageEmbedderResult != null) {
      const similarity = ImageEmbedder.cosineSimilarity(
        uploadImageEmbedderResult.embeddings[0],
        embedderResult.embeddings[0]
      );
      videoResult.className = "";
      videoResult.innerText = "Image similarity: " + similarity.toFixed(2);
    }
  
    // Call this function again to keep predicting when the browser is ready
    window.requestAnimationFrame(predictWebcam);
  }
  