import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

let objectModelTypes = {
	'fast': './mediapipe/models/object_detection/ssd_mobilenet_v2.tflite',
	'full': './mediapipe/models/object_detection/efficientdet_lite0.tflite',
	'accurate': './mediapipe/models/object_detection/efficientdet_lite2.tflite',
}

export let objectState = {
	modelTypes: objectModelTypes,
	detect: true,
	modelPath: objectModelTypes['full'],
	detector: undefined,
	results: undefined,
	objectsDiv: "",
	children: [],
	resultsName: "objectResults",
	maxResults: -1,
	scoreThreshold: 0.5,
	draw: () => drawObjects(),
};

export const createObjectDetector = async (WASM_PATH, objectsDiv) => {
	console.log("Starting object detection");
	console.log(objectState);
	objectState.objectsDiv = objectsDiv;
	const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
	let objectDetector = await ObjectDetector.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath: objectState.modelPath,
			delegate: "GPU",
		},
		runningMode: "VIDEO",
		maxResults: objectState.maxResults,
		scoreThreshold: objectState.scoreThreshold,
	});
	return objectDetector;
};

export function drawObjects() {
	// Remove any highlighting from previous frame.
	for (let child of objectState.children) {
		objectState.objectsDiv.removeChild(child);
	}
	objectState.children.splice(0);
	// Iterate through predictions and draw them to the live view
	for (let detection of objectState.results.detections) {
		const p = document.createElement("p");
		p.innerText =
			detection.categories[0].categoryName +
			" - with " +
			Math.round(parseFloat(detection.categories[0].score) * 100) +
			"% confidence";
		p.style =
			"left: " +
			(detection.boundingBox.originX) +
			"px;" +
			"top: " +
			detection.boundingBox.originY +
			"px;";

		const highlighter = document.createElement("div");
		highlighter.setAttribute("class", "highlighter");
		highlighter.style =
			"left: " +
			(detection.boundingBox.originX) +
			"px;" +
			"top: " +
			detection.boundingBox.originY +
			"px;" +
			"width: " +
			detection.boundingBox.width +
			"px;" +
			"height: " +
			detection.boundingBox.height +
			"px;";

		objectState.objectsDiv.appendChild(highlighter);
		objectState.objectsDiv.appendChild(p);

		// Store drawn objects in memory so they are queued to delete at next call.
		objectState.children.push(highlighter);
		objectState.children.push(p);
	}
}