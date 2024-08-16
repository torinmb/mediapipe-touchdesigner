import { faceLandmarkState } from "./faceLandmarks";
import { handState } from "./handDetection";
import { gestureState } from "./handGestures";
import { poseState } from "./poseTracking";
import { objectState } from "./objectDetection";
import { faceDetectorState } from "./faceDetector";
import { imageState } from "./imageClassification";
import { segmenterState } from "./imageSegmentation";
import { imageEmbedderState } from "./imageEmbedder";

import { webcamState, socketState, overlayState, outputState } from './state.js';

export const configMap = {
    'Wsaddress': value => socketState.adddress = value,
    'Wsport': value => socketState.port = value,

    'Webcam': value => webcamState.changeWebcam(value),
    'Wheight': value => webcamState.height = value,
    'Wwidth': value => webcamState.width = value,
    'Wtargetframerate': value => webcamState.targetFrameRate = value,
    'Wflip': value => {
        webcamState.flipped = parseInt(value) === 1;
        webcamState.changeWebcam(webcamState.webcamLabel);
    },
    'Oheight': value => outputState.height = value,
    'Owidth': value => outputState.width = value,

    'Detectfacelandmarks': value => detectSwitch(faceLandmarkState, parseInt(value) === 1),
    'Detectfaces': value => detectSwitch(faceDetectorState, parseInt(value) === 1),
    'Detectgestures': value => detectSwitch(gestureState, parseInt(value) === 1),
    'Detecthands': value => detectSwitch(handState, parseInt(value) === 1),
    'Detectposes': value => detectSwitch(poseState, parseInt(value) === 1),
    'Detectobjects': value => detectSwitch(objectState, parseInt(value) === 1),
    'Detectimages': value => detectSwitch(imageState, parseInt(value) === 1),
    'Detectsegments': value => detectSwitch(segmenterState, parseInt(value) === 1),
    'Detectimageembeddings': value => detectSwitch(imageEmbedderState, parseInt(value) === 1),
    'Showoverlays': value => overlaySwitch(parseInt(value) === 1),

    'Hnumhands': value => handState.numHands = value,
    'Hdetectconf': value => handState.minDetectionConfidence = value,
    'Hpresconf': value => handState.minPresenceConfidence = value,
    'Htrackconf': value => handState.minTrackingConfidence = value,

    'Gnumhands': value => gestureState.numHands = value,
    'Gdetectconf': value => gestureState.minDetectionConfidence = value,
    'Gpresconf': value => gestureState.minPresenceConfidence = value,
    'Gtrackconf': value => gestureState.minTrackingConfidence = value,
    'Gnumgestures': value => gestureState.maxNumGestures = value,
    'Gscore': value => gestureState.scoreThreshold = value,

    'Jointthreshold': '',
    'Posemodeltype': value => modelCheck(poseState, value),
    'Pnumposes': value => poseState.numPoses = value,
    'Pdetectconf': value => poseState.minDetectionConfidence = value,
    'Ppresconf': value => poseState.minPresenceConfidence = value,
    'Ptrackconf': value => poseState.minTrackingConfidence = value,

    'Fnumfaces': value => faceLandmarkState.numFaces = value,
    'Fblendshapes': value => faceLandmarkState.outputBlendshapes = parseInt(value) === 1,
    'Ftransmtrx': value => faceLandmarkState.outputTransformationMatrixes = parseInt(value) === 1,
    'Fpresconf': value => faceLandmarkState.minPresenceConfidence = value,
    'Fdetectconf': value => faceLandmarkState.minDetectionConfidence = value,
    'Ftrackconf': value => faceLandmarkState.minTrackingConfidence = value,

    'Fdtype': value => modelCheck(faceDetectorState, value),
    'Fdminconf': value => faceDetectorState.minDetectionConfidence = value,
    'Fdminsuppression': value => faceDetectorState.minSuppressionThreshold = value,

    'Onumobjects': value => objectState.maxResults = value,
    'Omodeltype': value => modelCheck(objectState, value),
    'Oscore': value => objectState.scoreThreshold = value,

    'Inumoresults': value => imageState.maxResults = value,
    'Imodeltype': value => modelCheck(imageState, value),
    'Iscore': value => imageState.scoreThreshold = value,

    'Smodeltype': value => modelCheck(segmenterState, value),
    
    'Sshowmulticlassbackgroundonly': value => segmenterState.showMultiClassBackgroundOnly = parseInt(value) === 1,

    'Iemodeltype': value => modelCheck(imageEmbedderState, value)

    // 'Scolor0r': value => segmenterState.legendColors[0][0] = Math.round(value * 255.0),
    // 'Scolor0g': value => segmenterState.legendColors[0][1] = Math.round(value * 255.0),
    // 'Scolor0b': value => segmenterState.legendColors[0][2] = Math.round(value * 255.0),
    // 'Scolor1r': value => segmenterState.legendColors[1][0] = Math.round(value * 255.0),
    // 'Scolor1g': value => segmenterState.legendColors[1][1] = Math.round(value * 255.0),
    // 'Scolor1b': value => segmenterState.legendColors[1][2] = Math.round(value * 255.0),
    // 'Scolor2r': value => segmenterState.legendColors[2][0] = Math.round(value * 255.0),
    // 'Scolor2g': value => segmenterState.legendColors[2][1] = Math.round(value * 255.0),
    // 'Scolor2b': value => segmenterState.legendColors[2][2] = Math.round(value * 255.0),
    // 'Scolor3r': value => segmenterState.legendColors[3][0] = Math.round(value * 255.0),
    // 'Scolor3g': value => segmenterState.legendColors[3][1] = Math.round(value * 255.0),
    // 'Scolor3b': value => segmenterState.legendColors[3][2] = Math.round(value * 255.0),
    // 'Scolor4r': value => segmenterState.legendColors[4][0] = Math.round(value * 255.0),
    // 'Scolor4g': value => segmenterState.legendColors[4][1] = Math.round(value * 255.0),
    // 'Scolor4b': value => segmenterState.legendColors[4][2] = Math.round(value * 255.0),
    // 'Scolor5r': value => segmenterState.legendColors[5][0] = Math.round(value * 255.0),
    // 'Scolor5g': value => segmenterState.legendColors[5][1] = Math.round(value * 255.0),
    // 'Scolor5b': value => segmenterState.legendColors[5][2] = Math.round(value * 255.0),
    // 'Scolor6r': value => segmenterState.legendColors[6][0] = Math.round(value * 255.0),
    // 'Scolor6g': value => segmenterState.legendColors[6][1] = Math.round(value * 255.0),
    // 'Scolor6b': value => segmenterState.legendColors[6][2] = Math.round(value * 255.0),
};

function modelCheck(state, value) {
    console.log("Looking for model : " + value);
    if (state.modelTypes.hasOwnProperty(value)) {
        console.log("Setting : " + state.modelTypes[value]);
        state.modelPath = state.modelTypes[value];
    } else {
        console.error(`Invalid modelType: ${state.modelType}`);
    }
}

function detectSwitch(state, value) {
    if (value) {
        state.detect = true;
    }
    else {
        state.detect = false;
        state.results = null;
        if (objectState.children != null) {
            for (let child of objectState.children) {
                objectState.objectsDiv.removeChild(child);
            }
            objectState.children.splice(0);
        }
        if (faceDetectorState.children != null) {
            for (let child of faceDetectorState.children) {
                faceDetectorState.facesDiv.removeChild(child);
            }
            faceDetectorState.children.splice(0);
        }
        let video = document.getElementById("webcam");
        // webcamState.videoElement.style.opacity = 1;
        video.style.opacity = 1;
        // const canvas = document.getElementById("segmentation");
        // const ctx = canvas.getContext("webgl2");
        // ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ctx = document.getElementById("segmentation");
        const gl = ctx.getContext("webgl2");
        gl.clearColor(0,0,0,0);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
    }
}

function overlaySwitch(value) {
    overlayState.show = value;
    if (objectState.children != null) {
        for (let child of objectState.children) {
            objectState.objectsDiv.removeChild(child);
        }
        objectState.children.splice(0);
    }
    if (faceDetectorState.children != null) {
        for (let child of faceDetectorState.children) {
            faceDetectorState.facesDiv.removeChild(child);
        }
        faceDetectorState.children.splice(0);
    }
    let video = document.getElementById("webcam");
    video.style.opacity = 1;
    const canvas = document.getElementById("segmentation");
    // const ctx = canvas.getContext("2d");
    // ctx.clearRect(0, 0, canvas.width, canvas.height);
}