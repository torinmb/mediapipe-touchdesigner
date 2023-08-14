import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

let segmentationModelTypes = {
    'selfieSquare': './mediapipe/models/image_segmentation/selfie_segmenter.tflite',
    'selfieLandscape': './mediapipe/models/image_segmentation/selfie_segmenter_landscape.tflite',
    'hairSegmenter': './mediapipe/models/image_segmentation/hair_segmenter.tflite',
    'selfieMulticlass': './mediapipe/models/image_segmentation/selfie_multiclass_256x256.tflite',
    'deepLabV3': './mediapipe/models/image_segmentation/deeplab_v3.tflite',
}

export let segmenterState = {
    modelTypes: segmentationModelTypes,
    detect: false,
    modelPath: segmentationModelTypes['selfieMulticlass'],
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
        [255, 197, 0, 255],  // Face Skin // Vivid Yellow
        [0, 255, 0, 255],   // Clothes
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
    gl: undefined,
    shaderProgram: undefined,
    buffers: undefined,    
    draw: () => drawSegmentation(),
};

export const createImageSegmenter = async (WASM_PATH, videoElement, segmentationCanvas) => {
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
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
    });
    segmenterState.labels = imageSegmenter.getLabels();
    console.log(segmenterState.labels);
    
    //////////////
    // Enable this code to draw the WebGL segmentation
    // also swap the draw function to drawSegmentationWebGL()
    
    // const { gl, buffers } = initWebGL(segmentationCanvas);
    // const { shaderProgram } = createShader2(gl);
    // segmenterState.gl = gl;
    // segmenterState.shaderProgram = shaderProgram;
    // segmenterState.buffers = buffers;
    return imageSegmenter;
};

export function drawSegmentationWebGL() {
    // let gl = segmenterState.segmentationCanvas.getContext("webgl");
    let gl = segmenterState.gl;
    let buffers = segmenterState.buffers;
    let shaderProgram = segmenterState.shaderProgram;
    segmenterState.videoElement.style.opacity = 0;

    // gl.width = 1280;
    // gl.height = 720;

    segmenterState.videoElement.style.opacity = 0;
    segmenterState.segmentationCanvas.width = 1280;
    segmenterState.segmentationCanvas.height = 720;
    if (!segmenterState.results.categoryMask.hasWebGLTexture()) return;
    // const texture = segmenterState.results.categoryMask.getAsWebGLTexture();
    const texture = createCheckerboardTexture(gl, 1280, 720, 20);

    if (!gl) {
        // gl = segmenterState.results.categoryMask.getGL();
        // setupGL();
        console.log("setup GL");
    }
    let glState = {}
    saveGLState(gl, glState);
    // Save the WebGL state

    gl.useProgram(segmenterState.shaderProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer);
    const a_position = gl.getAttribLocation(shaderProgram, "a_position");
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texCoordBuffer);
    const a_texCoord = gl.getAttribLocation(shaderProgram, "a_texCoord");
    gl.enableVertexAttribArray(a_texCoord);
    gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 0, 0);

    // Texture setup
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const u_texture = gl.getUniformLocation(shaderProgram, "u_texture");
    gl.uniform1i(u_texture, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
        console.error(
            "WebGL Error while drawing:",
            getWebGLErrorMessage(error, gl)
        );
    }

    restoreGLState(gl, glState);
    segmenterState.results.close();
    // draw the texture to the cavas using the gl context without effecting the existing context.
}

export function drawSegmentation(video) {
    let segmentCtx = segmenterState.segmentationCanvas.getContext("2d");

    segmenterState.videoElement.style.opacity = 0;

    segmentCtx.width = 1280;
    segmentCtx.height = 720;

    // segmenterState.segmentsCanvas.width = video.videoWidth;
    // segmenterState.segmentsCanvas.height = video.videoHeight;

    // let texture = result.categoryMask.getAsWebGLTexture();
    // let eightBitMap = result.categoryMask.getAsUint8Array();
    // let floatBitMap = result.categoryMask.getAsFloat32Array();

    let imageData = [];
    let confidenceMasks = [];

    // const { width, height } = result.categoryMask;

    /// let category = "";
    const mask = segmenterState.results.categoryMask.getAsFloat32Array();
    // console.log("Category Mask length: " + mask.length);
    let i = 0;
    for (let c of segmenterState.results.confidenceMasks) {
        confidenceMasks[i] = c.getAsFloat32Array();
        // console.log("Got confidence Mask " + i + " " + confidenceMasks[i].length + " long");
        i++;
    }

    // const mask = confidenceMasks[0];
    // console.log(i + " confidence masks loaded");
    // console.log(confidenceMasks);
    // const mask = result.categoryMask.getAsUint8Array();
    /*
    // Using unit8 is suuuper slow for some reason
    for (let i in mask) {
        if (mask[i] > 0) {
            category = labels[mask[i]];
        }
        const legendColor = legendColors[mask[i] % legendColors.length];
        imageData[i * 4] = legendColor[0];
        imageData[i * 4 + 1] = legendColor[1];
        imageData[i * 4 + 2] = legendColor[2];
        imageData[i * 4 + 3] = legendColor[3];
    }
    */
    // console.log("Mask");
    // console.log(mask);
    // let j = 0;
    // for (let i = 0; i < mask.length; ++i) {
    //     // console.log(mask[i]);
    //   const maskVal = Math.round(mask[i] * 255.0);
    //   const legendColor = legendColors[maskVal % legendColors.length];
    //   imageData[j] = legendColor[0];
    //   imageData[j + 1] = legendColor[1];
    //   imageData[j + 2] = legendColor[2];
    //   imageData[j + 3] = legendColor[3];
    //   j += 4;
    // }

    let j = 0;
    for (let i = 0; i < mask.length; ++i) {
        let maskVal = Math.round(mask[i] * 255.0);
        // let maskVal = mask[i];
        // if(i == 460800) {
        //     console.log("460800: "+ maskVal);
        // }
        // console.log(new Set(mask));

        // Do some silliness because the selfie segmenter works differently to the others
        let confidenceVal = 0;
        if (confidenceMasks.length == 1) {
            if(maskVal == 255) {
                maskVal = 0;
                confidenceVal = 255;
            }
            else if(maskVal == 0) {
                maskVal = 6;
                confidenceVal = Math.round(confidenceMasks[0][i] * 255.0);
            }
            // console.log("Single confidence mask");
            // confidenceVal = Math.round(confidenceMasks[0][i] * 255.0);
            // confidenceVal = confidenceMasks[0][i];
        }
        else confidenceVal = Math.round(confidenceMasks[maskVal][i] * 255.0);
        // const confidenceVal = Math.round(confidenceMasks[maskVal][i] * 255.0);
        // confidenceVal = confidenceMasks[maskVal][i];
        const legendColor = segmenterState.legendColors[maskVal % segmenterState.legendColors.length];
        try {
            imageData[j] = legendColor[0];
        } catch {
            console.log("invalid mask value: " + maskVal);
        }
        imageData[j + 1] = legendColor[1];
        imageData[j + 2] = legendColor[2];
        imageData[j + 3] = confidenceVal;
        j += 4;
    }
    /*
    const p = event.target.parentNode.getElementsByClassName(
        "classification"
    )[0];
    p.classList.remove("removed");
    p.innerText = "Category: " + category;
    */
    const uint8Array = new Uint8ClampedArray(imageData);
    const dataNew = new ImageData(
        uint8Array,
        segmentCtx.width,
        segmentCtx.height
    );
    segmentCtx.putImageData(dataNew, 0, 0);
    segmenterState.results.close();
}

function getWebGLErrorMessage(errorCode, gl) {
    switch (errorCode) {
        case gl.NO_ERROR:
            return "NO_ERROR";
        case gl.INVALID_ENUM:
            return "INVALID_ENUM: An unacceptable value has been specified for an enumerated argument.";
        case gl.INVALID_VALUE:
            return "INVALID_VALUE: A numeric argument is out of range.";
        case gl.INVALID_OPERATION:
            return "INVALID_OPERATION: The specified command is not allowed for the current state.";
        case gl.OUT_OF_MEMORY:
            return "OUT_OF_MEMORY: The command could not be executed due to insufficient memory.";
        case gl.INVALID_FRAMEBUFFER_OPERATION:
            return "INVALID_FRAMEBUFFER_OPERATION: The currently bound framebuffer is not framebuffer complete when trying to render to or to read from it.";
        case gl.CONTEXT_LOST_WEBGL:
            return "CONTEXT_LOST_WEBGL: The WebGL context has been lost and can no longer be used.";
        default:
            return "UNKNOWN_ERROR";
    }
}

function createCheckerboardTexture(gl, width, height, cellSize) {
    // Create a checkerboard pattern
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const value =
                (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2
                    ? 255
                    : 0;
            const index = (y * width + x) * 4;
            data[index] = value; // R
            data[index + 1] = value; // G
            data[index + 2] = value; // B
            data[index + 3] = 255; // A
        }
    }

    // Create WebGL texture and upload the checkerboard pattern
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
    );

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    return texture;
}

function saveGLState(gl, glState) {
    // Viewport
    glState.viewport = gl.getParameter(gl.VIEWPORT);

    // Active texture unit
    glState.activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);

    // TEXTURE_2D bindings and parameters
    glState.textureBinding2D = gl.getParameter(gl.TEXTURE_BINDING_2D);
    glState.textureWrapS = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S);
    glState.textureWrapT = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T);
    glState.textureMinFilter = gl.getTexParameter(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER
    );
    glState.textureMagFilter = gl.getTexParameter(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER
    );

    // Scissor Test
    glState.scissorTest = gl.getParameter(gl.SCISSOR_TEST);
    glState.scissorBox = gl.getParameter(gl.SCISSOR_BOX);

    // Blend mode
    glState.blend = gl.getParameter(gl.BLEND);
    glState.blendFuncSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB);
    glState.blendFuncDstRGB = gl.getParameter(gl.BLEND_DST_RGB);
    glState.blendFuncSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
    glState.blendFuncDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);

    // Depth test
    glState.depthTest = gl.getParameter(gl.DEPTH_TEST);
    glState.depthFunc = gl.getParameter(gl.DEPTH_FUNC);

    // Stencil test
    glState.stencilTest = gl.getParameter(gl.STENCIL_TEST);
    glState.stencilFunc = gl.getParameter(gl.STENCIL_FUNC);
    glState.stencilRef = gl.getParameter(gl.STENCIL_REF);
    glState.stencilValueMask = gl.getParameter(gl.STENCIL_VALUE_MASK);
    glState.stencilOp = {
        fail: gl.getParameter(gl.STENCIL_FAIL),
        zfail: gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL),
        zpass: gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS),
    };

    // Shader and Program
    glState.currentProgram = gl.getParameter(gl.CURRENT_PROGRAM);
}

function restoreGLState(gl, glState) {
    // Viewport
    gl.viewport(
        glState.viewport[0],
        glState.viewport[1],
        glState.viewport[2],
        glState.viewport[3]
    );

    // Active texture unit
    gl.activeTexture(glState.activeTexture);

    // TEXTURE_2D bindings and parameters
    gl.bindTexture(gl.TEXTURE_2D, glState.textureBinding2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glState.textureWrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glState.textureWrapT);
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        glState.textureMinFilter
    );
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        glState.textureMagFilter
    );

    // Scissor Test
    if (glState.scissorTest) {
        gl.enable(gl.SCISSOR_TEST);
    } else {
        gl.disable(gl.SCISSOR_TEST);
    }
    gl.scissor(
        glState.scissorBox[0],
        glState.scissorBox[1],
        glState.scissorBox[2],
        glState.scissorBox[3]
    );

    // Blend mode
    if (glState.blend) {
        gl.enable(gl.BLEND);
    } else {
        gl.disable(gl.BLEND);
    }
    gl.blendFuncSeparate(
        glState.blendFuncSrcRGB,
        glState.blendFuncDstRGB,
        glState.blendFuncSrcAlpha,
        glState.blendFuncDstAlpha
    );

    // Depth test
    if (glState.depthTest) {
        gl.enable(gl.DEPTH_TEST);
    } else {
        gl.disable(gl.DEPTH_TEST);
    }
    gl.depthFunc(glState.depthFunc);

    // Stencil test
    if (glState.stencilTest) {
        gl.enable(gl.STENCIL_TEST);
    } else {
        gl.disable(gl.STENCIL_TEST);
    }
    gl.stencilFunc(
        glState.stencilFunc,
        glState.stencilRef,
        glState.stencilValueMask
    );
    gl.stencilOp(
        glState.stencilOp.fail,
        glState.stencilOp.zfail,
        glState.stencilOp.zpass
    );

    // Shader and Program
    gl.useProgram(glState.currentProgram);
}

function initWebGL(segmentationCanvas) {
    // Get WebGL rendering context
    const gl = segmentationCanvas.getContext("webgl");
    segmentationCanvas.width = 1280;
    segmentationCanvas.height = 720;

    // Check the OES_texture_float extension
    // const ext = gl.getExtension("OES_texture_float");
    // if (!ext) {
    //     console.error("OES_texture_float is not supported by WebGL.");
    //     return null;
    // }

    const buffers = createBuffers(gl);

    return {
        gl,
        buffers,
    };
}

function createBuffers(gl) {
    // Vertex data
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const vertices = new Float32Array([
        -1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    const texCoords = new Float32Array([
        0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    return {
        positionBuffer,
        texCoordBuffer,
    };
}

function createShader2(gl) {
    const vertexShaderSource = `
 attribute vec4 a_position;
 attribute vec2 a_texCoord;
 varying vec2 v_texCoord;
 void main(void) {
     gl_Position = a_position;
     v_texCoord = a_texCoord;
 }
`;

    const fragmentShaderSource = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;
void main(void) {
    //gl_FragColor = vec4(v_texCoord, 0., 1.0)
    float value = texture2D(u_texture, v_texCoord).r;
    gl_FragColor = vec4(value, value, value, 1.0);
    // gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;
    // Shaders
    const vertexShader = compileShader(
        gl,
        vertexShaderSource,
        gl.VERTEX_SHADER
    );
    const fragmentShader = compileShader(
        gl,
        fragmentShaderSource,
        gl.FRAGMENT_SHADER
    );

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error(
            "Unable to initialize the shader program:",
            gl.getProgramInfoLog(shaderProgram)
        );
        return null;
    }

    return {
        shaderProgram,
    };
}

function compileShader(gl, source, type) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(
            "An error occurred compiling the shaders:",
            gl.getShaderInfoLog(shader)
        );
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}
