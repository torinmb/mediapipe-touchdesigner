import { faceState, handState, gestureState, poseState, objectState, webcamState, socketState, overlayState } from './state.js';

export const configMap = {
    'Wsaddress': value => socketState.adddress = value,
    'Wsport': value => socketState.port = value,

    'Detectfaces': value => detectSwitch(faceState, parseInt(value) === 1),
    'Detectgestures': value => detectSwitch(gestureState, parseInt(value) === 1),
    'Detecthands': value => detectSwitch(handState, parseInt(value) === 1),
    'Detectposes': value => detectSwitch(poseState, parseInt(value) === 1),
    'Detectobjects': value => detectSwitch(objectState, parseInt(value) === 1),
    'Showoverlays': value => overlaySwitch(parseInt(value) === 1),

    'Hnumhands': value => handState.numHands = value,
    'Hdetectconf': value => handState.minDetectionConfidence = value,
    'Hpresconf': value => handState.minPresenceConfidence = value,
    'Htrackconf': value => handState.minTrackingConfidence = value,

    'Gnumgestures': value => gestureState.maxNumGestures = value,
    'Gscore': value => gestureState.scoreThreshold = value,

    'Jointthreshold': '',
    'Model': value => modelCheck(poseState.modelPath, poseState.modelTypes, value),
    'Movenetcameraresolution': '',

    'Fnumfaces': value => faceState.numFaces = value,
    'Fblendshapes': value => faceState.outputBlendshapes = parseInt(value) === 1,
    'Ftransmtrx': value => faceState.outputTransformationMatrixes = parseInt(value) === 1,
    'Fpresconf': value => faceState.minPresenceConfidence = value,
    'Fdetectconf': value => faceState.minDetectionConfidence = value,
    'Ftrackconf': value => faceState.minTrackingConfidence = value,

    'Onumobjects': value => objectState.maxResults = value,
    'OmodelType': value => modelCheck(objectState.modelPath, objectState.modelTypes, value),
    'Oscore': value => objectState.scoreThreshold = value,
    //'Omodel': value => modelCheck(objectState.modelPath, objectState.modelTypes, value),
};

function modelCheck(modelPath, modelTypes, value) {
    if (modelTypes.hasOwnProperty(value)) {
        return value[value];
    } else {
        console.error(`Invalid modelType: ${modelType}`);
        return modelPath;
    }
}

function detectSwitch(stateObj, value) {
    if (value) {
        stateObj.detect = true;
    }
    else {
        stateObj.detect = false;
        stateObj.results = null;
    }
}

function overlaySwitch(value) {
    overlayState.show = value;
    for (let child of objectState.children) {
        objectState.objectsDiv.removeChild(child);
      }
      objectState.children.splice(0);
}
