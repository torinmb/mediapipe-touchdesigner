import { faceState, handState, gestureState, poseState, objectState, webcamState, socketState } from "./state.js";


const urlConfigMap = {
    'MinFaceDetectionConfidence': setFaceDetectionConfidence,
    'Detectfaces': value => toggleDetection(faceState, value),
    // ... Add more mappings here
};

function setFaceDetectionConfidence(value) {
    // Assuming faceState.landmarker has a method to set confidence:
    faceState.landmarker.setDetectionConfidence(value);
}

function toggleDetection(stateObject, value) {
    stateObject.detect = parseInt(value) === 1;
}


///////////////////////////
function handleQueryParams(socketState, webcamState) {
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.forEach((value, key) => {
        if (key in urlConfigMap) {
            urlConfigMap[key](value);
        }
    });
    // ... rest of your function
}

///////////////////////////////
socketState.ws.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data);
    for (let [key, value] of Object.entries(data)) {
        if (key in wsConfigMap) {
            urlConfigMap[key](value);
        }
    }

    // ... rest of your function
});