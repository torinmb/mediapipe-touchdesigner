// Gaze estimation from the face landmarker: features, ridge regression, runtime
// smoothing. Pure math, no DOM, so it can be tested under node.
//
// Screen gaze depends on the eyes *and* the head, so the model sees both:
// iris position inside each eye, the eyeLook* blendshapes, head direction and
// head position (from the facial transformation matrix). A ridge regression on
// those, fitted from the calibration targets, gives a viewport (u, v).

// Landmark indices (face landmarker with iris refinement, 478 points).
const LEFT_EYE = { a: 263, b: 362, upper: 386, lower: 374, iris: 473 };
const RIGHT_EYE = { a: 33, b: 133, upper: 159, lower: 145, iris: 468 };

const BLENDSHAPES = [
    "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeLookDownLeft",
    "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeLookDownRight",
];

const BASE_NAMES = [
    "irisHL", "irisVL", "irisHR", "irisVR", "eyeOpen",
    ...BLENDSHAPES,
    "headFwdX", "headFwdY", "headX", "headY", "headZ",
];
// Pairwise products of these four eye summaries let the model bend a little;
// head terms stay linear.
const QUAD_NAMES = [];
const EYE_SUMMARY = ["irisH", "irisV", "blendH", "blendV"];
for (let i = 0; i < EYE_SUMMARY.length; i++) {
    for (let j = i; j < EYE_SUMMARY.length; j++) {
        QUAD_NAMES.push(`${EYE_SUMMARY[i]}*${EYE_SUMMARY[j]}`);
    }
}
export const FEATURE_NAMES = [...BASE_NAMES, ...QUAD_NAMES];

const BLINK_THRESHOLD = 0.5;
const LAMBDAS = [0.01, 0.1, 1, 10, 100];

// One eye's iris offset in a roll-invariant frame, as a fraction of eye width.
// The frame's x axis always points toward image-right, so both eyes agree on
// the sign. Landmark x is scaled by the frame aspect so distances are isotropic.
function eyeFeatures(lm, eye, aspect) {
    let a = lm[eye.a];
    let b = lm[eye.b];
    if (a.x > b.x) [a, b] = [b, a];
    const ax = a.x * aspect, bx = b.x * aspect;
    const ex = bx - ax, ey = b.y - a.y;
    const width = Math.hypot(ex, ey) || 1e-6;
    const ux = ex / width, uy = ey / width;
    const mx = (ax + bx) / 2, my = (a.y + b.y) / 2;
    const dx = lm[eye.iris].x * aspect - mx;
    const dy = lm[eye.iris].y - my;
    const upper = lm[eye.upper], lower = lm[eye.lower];
    const open = Math.hypot((upper.x - lower.x) * aspect, upper.y - lower.y) / width;
    return {
        h: (dx * ux + dy * uy) / width,
        v: (-dx * uy + dy * ux) / width,
        open,
    };
}

// Returns null when there is nothing usable (no face, no iris landmarks).
export function extractFeatures(results, aspect = 16 / 9) {
    const lm = results?.faceLandmarks?.[0];
    if (!lm || lm.length < 478) return null;
    const scores = {};
    const categories = results.faceBlendshapes?.[0]?.categories;
    if (!categories) return null;
    for (const c of categories) scores[c.categoryName] = c.score;
    const matrix = results.facialTransformationMatrixes?.[0]?.data;
    if (!matrix) return null;

    const L = eyeFeatures(lm, LEFT_EYE, aspect);
    const R = eyeFeatures(lm, RIGHT_EYE, aspect);
    const bs = BLENDSHAPES.map((n) => scores[n] ?? 0);
    const blink = Math.max(scores.eyeBlinkLeft ?? 0, scores.eyeBlinkRight ?? 0);

    const base = [
        L.h, L.v, R.h, R.v, (L.open + R.open) / 2,
        ...bs,
        // Column-major 4x4: the third column is the face's forward axis.
        matrix[8], matrix[9],
        matrix[12], matrix[13], matrix[14],
    ];

    const [inL, outL, upL, downL, inR, outR, upR, downR] = bs;
    const eye = [
        (L.h + R.h) / 2,
        (L.v + R.v) / 2,
        // Looking to the subject's left: left eye out, right eye in.
        ((outL - inL) + (inR - outR)) / 2,
        ((upL - downL) + (upR - downR)) / 2,
    ];
    const quad = [];
    for (let i = 0; i < eye.length; i++) {
        for (let j = i; j < eye.length; j++) quad.push(eye[i] * eye[j]);
    }
    return { x: [...base, ...quad], blink, blinking: blink > BLINK_THRESHOLD };
}

function standardize(rows) {
    const n = rows.length, d = rows[0].length;
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / n;
    for (const r of rows) for (let j = 0; j < d; j++) std[j] += (r[j] - mean[j]) ** 2 / n;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1;
    return { mean, std };
}

// Solve A w = b for symmetric positive-definite A (Gauss-Jordan, tiny system).
function solve(A, B) {
    const n = A.length, m = B[0].length;
    const M = A.map((row, i) => [...row, ...B[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (Math.abs(M[p][c]) < 1e-12) return null;
        [M[c], M[p]] = [M[p], M[c]];
        const div = M[c][c];
        for (let k = c; k < n + m; k++) M[c][k] /= div;
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = M[r][c];
            if (f === 0) continue;
            for (let k = c; k < n + m; k++) M[r][k] -= f * M[c][k];
        }
    }
    return M.map((row) => row.slice(n));
}

// Weights are [bias, w1..wd] per output (u and v), on standardized features.
function ridge(Z, Y, lambda) {
    const n = Z.length, d = Z[0].length + 1;
    const A = Array.from({ length: d }, () => new Array(d).fill(0));
    const B = Array.from({ length: d }, () => [0, 0]);
    for (let i = 0; i < n; i++) {
        const z = [1, ...Z[i]];
        for (let a = 0; a < d; a++) {
            for (let b = a; b < d; b++) A[a][b] += z[a] * z[b];
            B[a][0] += z[a] * Y[i][0];
            B[a][1] += z[a] * Y[i][1];
        }
    }
    for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) A[a][b] = A[b][a];
    for (let a = 1; a < d; a++) A[a][a] += lambda * n; // bias not penalized
    return solve(A, B);
}

function applyModel(W, mean, std, x) {
    let u = W[0][0], v = W[0][1];
    for (let j = 0; j < x.length; j++) {
        const z = (x[j] - mean[j]) / std[j];
        u += W[j + 1][0] * z;
        v += W[j + 1][1] * z;
    }
    return [u, v];
}

// samples: [{x: featureVector, target: [u, v], group: targetIndex}], target in
// viewport fractions (0..1, origin top-left). Picks lambda by leave-one-target-
// out error, which measures what matters: accuracy at a point never seen.
export function fitGazeModel(samples) {
    if (samples.length < 20) return null;
    // group -1 samples (a target gliding between points) train the model but
    // are never held out, so the reported error is about the held targets.
    const groups = [...new Set(samples.map((s) => s.group))].filter((g) => g >= 0);
    if (groups.length < 4) return null;
    const { mean, std } = standardize(samples.map((s) => s.x));
    const Z = samples.map((s) => s.x.map((v, j) => (v - mean[j]) / std[j]));
    const Y = samples.map((s) => s.target);

    let best = { lambda: LAMBDAS[0], error: Infinity };
    for (const lambda of LAMBDAS) {
        let sum = 0, count = 0;
        for (const g of groups) {
            const train = [], trainY = [];
            samples.forEach((s, i) => {
                if (s.group !== g) { train.push(Z[i]); trainY.push(Y[i]); }
            });
            const W = ridge(train, trainY, lambda);
            if (!W) { sum = Infinity; break; }
            samples.forEach((s, i) => {
                if (s.group !== g) return;
                const p = applyModel(W, new Array(Z[i].length).fill(0), new Array(Z[i].length).fill(1), Z[i]);
                sum += Math.hypot(p[0] - Y[i][0], p[1] - Y[i][1]);
                count++;
            });
        }
        const error = sum / Math.max(count, 1);
        if (error < best.error) best = { lambda, error };
    }
    const W = ridge(Z, Y, best.lambda);
    if (!W) return null;
    const trainError = Z.reduce((acc, z, i) => {
        const p = applyModel(W, new Array(z.length).fill(0), new Array(z.length).fill(1), z);
        return acc + Math.hypot(p[0] - Y[i][0], p[1] - Y[i][1]);
    }, 0) / Z.length;
    return {
        version: 1,
        features: FEATURE_NAMES,
        mean, std, weights: W,
        lambda: best.lambda,
        cvError: best.error,
        trainError,
        samples: samples.length,
        targets: groups.length,
        createdAt: new Date().toISOString(),
    };
}

export function isCompatibleModel(model) {
    return !!model
        && model.version === 1
        && Array.isArray(model.weights)
        && model.features?.length === FEATURE_NAMES.length
        && model.features.every((n, i) => n === FEATURE_NAMES[i]);
}

export function predictGaze(model, x) {
    return applyModel(model.weights, model.mean, model.std, x);
}

// One Euro filter: heavy smoothing while the gaze is still, light when it moves.
class OneEuro {
    constructor(minCutoff, beta, dCutoff = 1) {
        Object.assign(this, { minCutoff, beta, dCutoff, x: null, dx: 0, t: 0 });
    }
    alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }
    reset() { this.x = null; }
    filter(value, tMs) {
        if (this.x === null) {
            this.x = value; this.dx = 0; this.t = tMs;
            return value;
        }
        const dt = Math.max((tMs - this.t) / 1000, 1e-3);
        this.t = tMs;
        const dRaw = (value - this.x) / dt;
        this.dx += this.alpha(this.dCutoff, dt) * (dRaw - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += this.alpha(cutoff, dt) * (value - this.x);
        return this.x;
    }
}

export class GazeTracker {
    constructor() {
        this.model = null;
        // Units are viewport fractions per second.
        this.fu = new OneEuro(1.5, 4);
        this.fv = new OneEuro(1.5, 4);
    }
    setModel(model) {
        this.model = isCompatibleModel(model) ? model : null;
        this.fu.reset(); this.fv.reset();
        return !!this.model;
    }
    // Returns what is attached to the face results for TouchDesigner. u/v use
    // TouchDesigner's UV convention (origin bottom-left), 0..1 across the
    // viewport; they can run past 0..1 when the gaze is off the surface.
    update(features, nowMs) {
        if (!this.model) return { calibrated: 0, valid: 0, u: 0, v: 0 };
        if (!features || features.blinking) {
            // Hold the last value through blinks; callers see valid = 0.
            return { calibrated: 1, valid: 0, ...this.last };
        }
        const [rawU, rawTop] = predictGaze(this.model, features.x);
        const u = this.fu.filter(rawU, nowMs);
        const v = 1 - this.fv.filter(rawTop, nowMs);
        this.last = { u, v, rawU, rawV: 1 - rawTop, onScreen: Number(u >= 0 && u <= 1 && v >= 0 && v <= 1) };
        return { calibrated: 1, valid: 1, ...this.last };
    }
    last = { u: 0, v: 0, rawU: 0, rawV: 0, onScreen: 0 };
}
