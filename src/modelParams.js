import { faceState, handState, gestureState, poseState, objectState, webcamState, socketState, overlayState } from './state.js';

export const configMap = {
    'Webcam': value => webcamState.webcamId,
    'Wsaddress': value => socketState.adddress,
    'Wsport': value => socketState.port,

    'Detectfaces': value => faceState.detect = parseInt(value) === 1,
    'Detectgestures': value => gestureState.detect = parseInt(value) === 1,
    'Detecthands': value => handState.detect = parseInt(value) === 1,
    'Detectposes': value => poseState.detect = parseInt(value) === 1,
    'Detectobjects': value => objectState.detect = parseInt(value) === 1,
    'Showoverlays': value => overlayState.show = parseInt(value) === 1,

    'Hnumhands': value => handState.numHands,
    'Hdetectconf': value => handState.minDetectionConfidence,
    'Hpresconf': value => handState.minPresenceConfidence,
    'Htrackconf': value => handState.minTrackingConfidence,

    'Gnumgestures': value => gestureState.maxNumGestures,
    'Gscore': value => gestureState.scoreThreshold,

    'Jointthreshold': '',
    'Model': '',
    'Movenetcameraresolution': '',

    'Fnumfaces': value => faceState.numFaces,
    'Fblendshapes': value => faceState.outputBlendshapes = parseInt(value) === 1,
    'Ftransmtrx': value => faceState.outputTransformationMatrixes = parseInt(value) === 1,
    'Fpresconf': value => faceState.minPresenceConfidence,
    'Fdetectconf': value => faceState.minDetectionConfidence,
    'Ftrackconf': value => faceState.minTrackingConfidence,

    'Onumobjects': value => objectState.maxResults,
    'Oscore': value => objectState.scoreThreshold,
};