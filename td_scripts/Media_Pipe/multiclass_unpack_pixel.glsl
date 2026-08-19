// TouchDesigner GLSL TOP pixel shader for the colored multiclass segmentation.
//
// Setup:
//   1. Connect seg_data to input 0 of a GLSL TOP.
//   2. Set GLSL Version to 3.30 or newer.
//   3. Set "# of Color Buffers" to 6.
//   4. Use Render Select TOPs with Color Buffer Index 0 through 5.
//   5. Drive segIsMulticlass from the matching timers CHOP channel.
//
// Output indices:
//   0 whole person / foreground
//   1 hair
//   2 body skin
//   3 face skin
//   4 clothes
//   5 accessories
//
// The browser's colored output is a confidence-weighted color mixture, so the
// exact original confidence masks cannot be uniquely recovered. This shader
// unpremultiplies RGB by the combined foreground alpha, finds the closest line
// segment between two known class colors, and uses the position on that segment
// as their soft mixture. This exactly reconstructs a pixel when background and
// at most two foreground classes contributed to it, which is the common case
// along class boundaries.

layout(location = 0) out vec4 fragColor[TD_NUM_COLOR_BUFFERS];

uniform float segIsMulticlass;

const float ALPHA_EPSILON = 0.000001;
const vec2 DEFAULT_PERSON_RANGE = vec2(0.08, 0.98);
const vec2 DEFAULT_CLASS_RANGE = vec2(0.08, 0.98);

// Exact 0-1 equivalents of the default browser legend colors.
const vec3 CLASS_COLORS[5] = vec3[5](
	vec3(0.7568627451, 0.0,          0.1254901961), // Hair:        193, 0, 32
	vec3(1.0,          0.0,          1.0),          // Body skin:   255, 0, 255
	vec3(1.0,          0.7725490196, 0.0),          // Face skin:   255, 197, 0
	vec3(0.0,          1.0,          0.0),          // Clothes:     0, 255, 0
	vec3(0.0,          0.8823529412, 0.8823529412)  // Accessories: 0, 225, 225
);

vec4 maskOutput(float classMask)
{
	// White, premultiplied mask. Pixels outside the mask are transparent black;
	// soft MediaPipe confidence is preserved equally in RGB and alpha.
	return TDOutputSwizzle(vec4(vec3(classMask), classMask));
}

float remapMask(float classMask, vec2 maskRange)
{
	return smoothstep(maskRange.x, maskRange.y, classMask);
}

void main()
{
	vec4 segmentation = texture(sTD2DInputs[0], vUV.st);
	bool isMulticlass = segIsMulticlass >= 0.5;

	// Single-mask modes store their confidence in red. Only output the whole
	// person mask; the five class-specific buffers remain transparent black.
	if (!isMulticlass) {
		float personMask = remapMask(
			segmentation.r,
			DEFAULT_PERSON_RANGE
		);
		fragColor[0] = maskOutput(personMask);
		fragColor[1] = maskOutput(0.0);
		fragColor[2] = maskOutput(0.0);
		fragColor[3] = maskOutput(0.0);
		fragColor[4] = maskOutput(0.0);
		fragColor[5] = maskOutput(0.0);
		return;
	}

	float rawForeground = max(segmentation.a, 0.0);
	float foreground = clamp(rawForeground, 0.0, 1.0);

	float masks[5];
	for (int i = 0; i < 5; ++i) {
		masks[i] = 0.0;
	}

	if (rawForeground > ALPHA_EPSILON) {
		// RGB is confidence-weighted in the browser. Dividing by the summed
		// foreground confidence restores its foreground-only color mixture.
		vec3 observedColor = segmentation.rgb / rawForeground;

		float bestError = 1e20;
		float bestMix = 0.0;
		int bestClassA = 0;
		int bestClassB = 1;

		// Test all ten class-color pairs. Projection onto the closest segment
		// yields a linear mixture instead of a hard nearest-color decision.
		for (int classA = 0; classA < 5; ++classA) {
			for (int classB = classA + 1; classB < 5; ++classB) {
				vec3 colorA = CLASS_COLORS[classA];
				vec3 colorDelta = CLASS_COLORS[classB] - colorA;
				float mixAmount = clamp(
					dot(observedColor - colorA, colorDelta) /
						dot(colorDelta, colorDelta),
					0.0,
					1.0
				);
				vec3 reconstructedColor = colorA + colorDelta * mixAmount;
				vec3 errorDelta = observedColor - reconstructedColor;
				float error = dot(errorDelta, errorDelta);

				if (error < bestError) {
					bestError = error;
					bestMix = mixAmount;
					bestClassA = classA;
					bestClassB = classB;
				}
			}
		}

		masks[bestClassA] = foreground * (1.0 - bestMix);
		masks[bestClassB] += foreground * bestMix;
	}

	float personMask = remapMask(foreground, DEFAULT_PERSON_RANGE);
	float hairMask = remapMask(masks[0], DEFAULT_CLASS_RANGE);
	float bodySkinMask = remapMask(masks[1], DEFAULT_CLASS_RANGE);
	float faceSkinMask = remapMask(masks[2], DEFAULT_CLASS_RANGE);
	float clothesMask = remapMask(masks[3], DEFAULT_CLASS_RANGE);
	float accessoriesMask = remapMask(masks[4], DEFAULT_CLASS_RANGE);

	fragColor[0] = maskOutput(personMask);
	fragColor[1] = maskOutput(hairMask);
	fragColor[2] = maskOutput(bodySkinMask);
	fragColor[3] = maskOutput(faceSkinMask);
	fragColor[4] = maskOutput(clothesMask);
	fragColor[5] = maskOutput(accessoriesMask);
}
