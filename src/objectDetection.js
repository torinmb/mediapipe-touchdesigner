import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

export const createObjectDetector = async (WASM_PATH, modelAssetPath) => {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: modelAssetPath,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.5,
    });
    return objectDetector;
};

export function drawObjects(result, children, objectsDiv) {
	// Remove any highlighting from previous frame.
	for (let child of children) {
        objectsDiv.removeChild(child);
	}
	children.splice(0);
	// Iterate through predictions and draw them to the live view
	for (let detection of result.detections) {
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
		(detection.boundingBox.width - 10) +
		"px;" +
		"height: " +
		detection.boundingBox.height +
		"px;";
  
        objectsDiv.appendChild(highlighter);
        objectsDiv.appendChild(p);
  
	  // Store drawn objects in memory so they are queued to delete at next call.
	  children.push(highlighter);
	  children.push(p);
	}
  }