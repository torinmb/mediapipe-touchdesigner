import { FilesetResolver, ImageClassifier } from "@mediapipe/tasks-vision";

let imageModelTypes = {
	'full': './mediapipe/models/image_classification/efficientnet_lite0.tflite',
	'accurate': './mediapipe/models/image_classification/efficientnet_lite2.tflite',
}

export let imageState = {
	modelTypes: imageModelTypes,
	detect: false,
	modelPath: imageModelTypes['full'],
	detector: undefined,
	results: undefined,
	objectsDiv: "",
	children: [],
	resultsName: "imageResults",
	maxResults: -1,
	scoreThreshold: 0.5,
	draw: () => drawObjects(),
};

export const createImageClassifier = async (WASM_PATH) => {
	console.log("Starting image classifier: "+ imageState);
	const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
	let imageClassifier = await ImageClassifier.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath: imageState.modelPath,
			delegate: "GPU",
		},
		runningMode: "VIDEO",
		maxResults: parseInt(imageState.maxResults),
		scoreThreshold: parseFloat(imageState.scoreThreshold),
	});
	return imageClassifier;
};