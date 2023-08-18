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
    //remap the colors to from 0-255 to 0-1
    segmenterState.legendColors = segmenterState.legendColors.map(color => 
        color.map(channel => channel / 255)
    );

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
        uniform sampler2D masks[6]; // Array of mask samplers
        uniform vec4 colors[6];     // Array of mask colors
    
        void main() {
            vec4 finalColor = vec4(0.0);
            for(int i = 0; i < 6; i++) {
                float maskValue = texture2D(masks[i], texCoords).r;
                finalColor += maskValue * colors[i];
            }
            gl_FragColor = finalColor;
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
            masks: Array.from({ length: 6 }).map((_, i) =>
            gl.getUniformLocation(program, `masks[${i}]`)
            ),
            colors: Array.from({ length: 6 }).map((_, i) =>
                gl.getUniformLocation(program, `colors[${i}]`)
            )
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
        uniformLocations: { masks, colors },
    } = createShaderProgram(gl);
    const vertexBuffer = createVertexBuffer(gl);

    return (allMasks) => {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.useProgram(shaderProgram);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(positionLocation);

        
        
        for (let i = 0; i < allMasks.length; i++) {
            // if(allMasks[i] && allMasks[i].getAsWebGLTexture){
                const maskTexture = allMasks[i].getAsWebGLTexture();
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, maskTexture);
                gl.uniform1i(masks[i], i);
                gl.uniform4fv(colors[i], segmenterState.legendColors[i]);
            // }
        }
        const maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        if (allMasks.length > maxTextureUnits) {
            console.error("Too many textures!");
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return createImageBitmap(canvas);
    };
}

export async function drawSegmentation() {
    segmenterState.videoElement.style.opacity = 0;

    // const segmentationMaskBitmap = await segmenterState.toImageBitmap(segmenterState.results.categoryMask);
    await segmenterState.toImageBitmap(segmenterState.results.confidenceMasks);
    segmenterState.results.close();
}

