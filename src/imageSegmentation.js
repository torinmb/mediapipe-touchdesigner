import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

let segmentationModelTypes = {
    selfieSquare:
        "./mediapipe/models/image_segmentation/selfie_segmenter.tflite",
    selfieLandscape:
        "./mediapipe/models/image_segmentation/selfie_segmenter_landscape.tflite",
    hairSegmenter:
        "./mediapipe/models/image_segmentation/hair_segmenter.tflite",
    selfieMulticlass:
        "./mediapipe/models/image_segmentation/selfie_multiclass_256x256.tflite",
    deepLabV3: "./mediapipe/models/image_segmentation/deeplab_v3.tflite",
};

export let segmenterState = {
    modelTypes: segmentationModelTypes,
    detect: true,
    modelPath: segmentationModelTypes["selfieMulticlass"],
    detector: undefined,
    results: undefined,
    segmentationCanvas: "",
    videoElement: "",
    labels: [],
    resultsName: "segmenterResults",
    legendColors: [
        [0, 0, 0, 0], // Background
        [193, 0, 32, 255], // Hair // Vivid Red
        [255, 0, 255, 255], // Body-skin
        [255, 197, 0, 255], // Face Skin // Vivid Yellow
        [0, 255, 0, 255], // Clothes
        [0, 225, 225, 255], // Accessories
        [255, 255, 255, 255], // Selfie // White
        [0, 0, 255, 255],
        [0, 0, 0, 255],
        [0, 125, 52, 255], // Vivid Green
        [0, 83, 138, 255], // Strong Blue
        [128, 62, 117, 255], // Strong Purple
        [255, 104, 0, 255], // Vivid Orange
        [166, 189, 215, 255], // Very Light Blue
        [206, 162, 98, 255], // Grayish Yellow
        [129, 112, 102, 255], // Medium Gray
        [246, 118, 142, 255], // Strong Purplish Pink
        [255, 112, 92, 255], // Strong Yellowish Pink
        [83, 55, 112, 255], // Strong Violet
        [255, 142, 0, 255], // Vivid Orange Yellow
        [179, 40, 81, 255], // Strong Purplish Red
        [244, 200, 0, 255], // Vivid Greenish Yellow
        [127, 24, 13, 255], // Strong Reddish Brown
        [147, 170, 0, 255], // Vivid Yellowish Green
        [89, 51, 21, 255], // Deep Yellowish Brown
        [241, 58, 19, 255], // Vivid Reddish Orange
        [35, 44, 22, 255], // Dark Olive Green
    ],
    toImageBitmap: undefined,
    draw: () => drawSegmentation(),
};

export const createImageSegmenter = async (
    WASM_PATH,
    videoElement,
    segmentationCanvas
) => {
    segmenterState.videoElement = videoElement;
    segmenterState.segmentationCanvas = segmentationCanvas;
    console.log("Starting image segmentation");
    console.log(segmenterState);
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    let imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: segmenterState.modelPath,
            delegate: "GPU",
        },
        canvas: segmenterState.segmentationCanvas,
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
    });
    segmenterState.toImageBitmap = createCopyTextureToCanvas(segmenterState.segmentationCanvas);
    segmenterState.labels = imageSegmenter.getLabels();
    console.log(segmenterState.labels);
    return imageSegmenter;
};

const createShaderProgram = (gl) => {
    const vs = `
      attribute vec2 position;
      varying vec2 texCoords;
    
      void main() {
        texCoords = (position + 1.0) / 2.0;
        texCoords.y = 1.0 - texCoords.y;
        gl_Position = vec4(position, 0, 1.0);
      }
    `;

    const fs = `
      precision highp float;
      varying vec2 texCoords;
      uniform sampler2D textureSampler;
      void main() {
        float a = texture2D(textureSampler, texCoords).r;
        if(a == 0.0) discard;
        gl_FragColor = vec4(0.0,0.0,0.0,a);
      }
    `;
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
        throw Error("can not create vertex shader");
    }
    gl.shaderSource(vertexShader, vs);
    gl.compileShader(vertexShader);

    // Create our fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
        throw Error("can not create fragment shader");
    }
    gl.shaderSource(fragmentShader, fs);
    gl.compileShader(fragmentShader);

    // Create our program
    const program = gl.createProgram();
    if (!program) {
        throw Error("can not create program");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    return {
        vertexShader,
        fragmentShader,
        shaderProgram: program,
        attribLocations: {
            position: gl.getAttribLocation(program, "position"),
        },
        uniformLocations: {
            textureSampler: gl.getUniformLocation(program, "textureSampler"),
        },
    };
};
const createVertexBuffer = (gl) => {
    if (!gl) {
        return null;
    }
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]),
        gl.STATIC_DRAW
    );
    return vertexBuffer;
};

export function createCopyTextureToCanvas(canvas) {
    const gl = canvas.getContext("webgl2");
    gl.disable(gl.BLEND);
    gl.width = segmenterState.videoElement.videoWidth;
    gl.height = segmenterState.videoElement.videoHeight;
    if (!gl) {
        return undefined;
    }
    const {
        shaderProgram,
        attribLocations: { position: positionLocation },
        uniformLocations: { textureSampler: textureLocation },
    } = createShaderProgram(gl);
    const vertexBuffer = createVertexBuffer(gl);

    return (mask) => {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.useProgram(shaderProgram);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const texture = mask.getAsWebGLTexture();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(positionLocation);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(textureLocation, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return createImageBitmap(canvas);
    };
}

export async function drawSegmentation() {
    // let segmentCtx = segmenterState.segmentationCanvas.getContext("2d");

    segmenterState.videoElement.style.opacity = 0;

    // segmentCtx.width = segmenterState.videoElement.videoWidth;
    // segmentCtx.height = segmenterState.videoElement.videoHeight;

    // segmenterState.segmentationCanvas.width =
    //     segmenterState.videoElement.videoWidth;
    // segmenterState.segmentationCanvas.height =
    //     segmenterState.videoElement.videoHeight;

    // console.log("Segmenter width, height "+segmentCtx.width +", "+ segmentCtx.height);

    // segmenterState.segmentsCanvas.width = video.videoWidth;
    // segmenterState.segmentsCanvas.height = video.videoHeight;

    // let texture = result.categoryMask.getAsWebGLTexture();
    // let eightBitMap = result.categoryMask.getAsUint8Array();
    // let floatBitMap = result.categoryMask.getAsFloat32Array();

    // const segmentationMaskBitmap = await segmenterState.toImageBitmap(segmenterState.results.categoryMask);
    await segmenterState.toImageBitmap(segmenterState.results.confidenceMasks[0]);
    segmenterState.results.close();
}

