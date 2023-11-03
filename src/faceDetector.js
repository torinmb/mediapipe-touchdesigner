import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

let faceDetectorModelTypes = {
	'shortrange': './mediapipe/models/face_detection/blaze_face_short_range.tflite',
}

export let faceDetectorState = {
	modelTypes: faceDetectorModelTypes,
	modelPath: faceDetectorModelTypes['shortrange'],
	detect: true,
	landmarker: undefined,
	results: undefined,
	facesDiv: "",
	children: [],
	resultsName: "faceDetectorResults",
	minDetectionConfidence: 0.5,
	minSuppressionThreshold: 0.3,
	draw: (video) => displayFaceDetections(video),
};

export const createFaceDetector = async (wasm_path, facesDiv) => {
	console.log("Starting face detection");
	console.log(faceDetectorState);
	faceDetectorState.facesDiv = facesDiv;
	const vision = await FilesetResolver.forVisionTasks(wasm_path);
	let faceDetector = await FaceDetector.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath: faceDetectorState.modelPath,
			delegate: "GPU",
		},
		runningMode: "VIDEO",
		minSuppressionThreashold: parseFloat(faceDetectorState.minSuppressionThreashold),
		minDetectionConfidence: parseFloat(faceDetectorState.minDetectionConfidence),
	});
	return faceDetector;
};

export function displayFaceDetections(video) {
	let offsetRatioX = faceDetectorState.facesDiv.width / video.width;
	let offsetRatioY = faceDetectorState.facesDiv.height / video.height;

	// Remove any highlighting from previous frame.
	for (let child of faceDetectorState.children) {
		faceDetectorState.facesDiv.removeChild(child);
	}
	faceDetectorState.children.splice(0);
	// Iterate through predictions and draw them to the live view
	for (let detection of faceDetectorState.results.detections) {
		const p = document.createElement("p");
		p.setAttribute("class", "info");
		p.innerText =
			"Face - with " +
			Math.round(parseFloat(detection.categories[0].score) * 100) +
			"% confidence";
		p.style =
			"left: " +
			(detection.boundingBox.originX * offsetRatioX) +
			"px;" +
			"top: " +
			(detection.boundingBox.originY * offsetRatioY)+
			"px;";

		const highlighter = document.createElement("div");
		highlighter.setAttribute("class", "highlighter");
		highlighter.style =
			"left: " +
			(detection.boundingBox.originX * offsetRatioX) +
			"px;" +
			"top: " +
			(detection.boundingBox.originY * offsetRatioY) +
			"px;" +
			"width: " +
			(detection.boundingBox.width * offsetRatioX) +
			"px;" +
			"height: " +
			(detection.boundingBox.height * offsetRatioY) +
			"px;";

		faceDetectorState.facesDiv.appendChild(highlighter);
		faceDetectorState.facesDiv.appendChild(p);

		// Store drawn objects in memory so they are queued to delete at next call.
		faceDetectorState.children.push(highlighter);
		faceDetectorState.children.push(p);

		for (let keypoint of detection.keypoints) {
			const keypointEl = document.createElement("span");
			keypointEl.className = "key-point";
			keypointEl.style.top = `${keypoint.y * faceDetectorState.facesDiv.height}px`;
			keypointEl.style.left = `${keypoint.x * faceDetectorState.facesDiv.width}px`;
			faceDetectorState.facesDiv.appendChild(keypointEl);
			faceDetectorState.children.push(keypointEl);
		}
	}
}