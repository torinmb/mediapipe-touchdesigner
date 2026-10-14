// Synthetic check of the gaze fit: node harness/test_gaze.mjs
// Fake eyes whose iris offset follows a nonlinear function of the true gaze
// point plus head sway and noise; the fit must recover held-out points.
import { fitGazeModel, predictGaze, FEATURE_NAMES, GazeTracker } from "../src/gaze.js";

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());

// Layout must match gaze.js: base features then pairwise products of the 4 eye summaries.
function features(u, v, head) {
    const eh = (u - 0.5) * 0.3 + (u - 0.5) ** 2 * 0.05 - head[0] * 0.2 + gauss() * 0.004;
    const ev = (v - 0.5) * 0.2 - head[1] * 0.15 + gauss() * 0.004;
    const bh = (u - 0.5) * 0.8 + gauss() * 0.03;
    const bv = (v - 0.5) * 0.6 + gauss() * 0.03;
    const base = [eh, ev, eh, ev, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, head[0], head[1], head[2], head[3], 40];
    const eye = [eh, ev, bh, bv];
    const quad = [];
    for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) quad.push(eye[i] * eye[j]);
    return [...base, ...quad];
}

const edges = [0.07, 0.5, 0.93];
const targets = edges.flatMap((x) => edges.map((y) => [x, y]));
const samples = [];
targets.forEach(([u, v], group) => {
    for (let i = 0; i < 60; i++) {
        const t = i / 60;
        const head = [Math.sin(t * 6) * 0.1, Math.cos(t * 4) * 0.05, 0.02, 0.01];
        samples.push({ x: features(u, v, head), target: [u, v], group });
    }
});
if (samples[0].x.length !== FEATURE_NAMES.length) throw new Error("feature layout mismatch");

const model = fitGazeModel(samples);
let err = 0, n = 0;
for (let k = 0; k < 200; k++) {
    const u = 0.1 + rand() * 0.8, v = 0.1 + rand() * 0.8;
    const head = [(rand() - 0.5) * 0.2, (rand() - 0.5) * 0.1, 0.02, 0.01];
    const [pu, pv] = predictGaze(model, features(u, v, head));
    err += Math.hypot(pu - u, pv - v); n++;
}
console.log(`lambda=${model.lambda} cv=${model.cvError.toFixed(3)} train=${model.trainError.toFixed(3)} heldout=${(err / n).toFixed(3)}`);
if (err / n > 0.06) throw new Error("held-out error too large");

const tracker = new GazeTracker();
console.log("model accepted:", tracker.setModel(JSON.parse(JSON.stringify(model))));
console.log(tracker.update({ x: samples[0].x, blinking: false }, 0));
