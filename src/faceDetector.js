import { FilesetResolver, FaceDetector, Detection } from "@mediapipe/tasks-vision";
import { faceDetectorState } from "./state";

export const createFaceDetector = async (wasm_path, modelAssetPath) => {
    console.log(faceDetectorState);
    const vision = await FilesetResolver.forVisionTasks(wasm_path);
    let FaceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
		minSuppressionThreashold: faceDetectorState.minSuppressionThreashold,
        minDetectionConfidence: faceDetectorState.minDetectionConfidence,
    });
    return faceDetector;
};

export function displayImageDetections() {

	// Remove any highlighting from previous frame.
	for (let child of faceDetectorState.children) {
        faceDetectorState.objectsDiv.removeChild(child);
	}
	faceDetectorState.children.splice(0);
	// Iterate through predictions and draw them to the live view
	for (let detection of faceDetectorState.results.detections) {
	  const p = document.createElement("p");
	  p.setAttribute("class", "info");
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
  
        faceDetectorState.objectsDiv.appendChild(highlighter);
        faceDetectorState.objectsDiv.appendChild(p);
  
	  // Store drawn objects in memory so they are queued to delete at next call.
	  faceDetectorState.children.push(highlighter);
	  faceDetectorState.children.push(p);

	  for (let keypoint of detection.keypoints) {
		const keypointEl = document.createElement("spam");
		keypointEl.className = "key-point";
		keypointEl.style.top = `${keypoint.y * video.offsetHeight - 3}px`;
		keypointEl.style.left = `${
		  video.offsetWidth - keypoint.x * video.offsetWidth - 3
		}px`;
		faceDetectorState.liveView.appendChild(keypointEl);
		faceDetectorState.children.push(keypointEl);
	  }
	}
  }