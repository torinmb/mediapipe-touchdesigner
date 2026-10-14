// Eye tracking calibration: a white full-viewport layer (it lights the face and
// hides the webcam image and overlays; the frame marker pixel sits above it and
// keeps working). One practice dot, then 9 targets: press and hold each while
// looking at it. Between targets the dot glides to the next position: eyes
// follow motion smoothly, so those frames also train the model without the
// jumps (saccades) that make single-point labels noisy. No text changes during
// the targets, since reading it would pull the eyes off the dot.
import { GazeTracker, extractFeatures, fitGazeModel } from "./gaze.js";

const STORAGE_KEY = "mpGazeCalibration";
const HOLD_MS = 2600;
// The eye is still travelling to the target just after the press.
const SETTLE_MS = 450;
// After this long, ask for head movement so head pose and eye angle decorrelate.
const MOVE_HEAD_AT_MS = 1300;
const MIN_SAMPLES_PER_TARGET = 15;
const TARGET_SIZE = 64;
const EDGE = 0.07;
const GLIDE_MS = 1100;
// Pursuit lags the dot slightly: skip the onset and label with where the dot was.
const GLIDE_ONSET_SKIP_MS = 300;
const PURSUIT_LAG_MS = 100;
const HEAD_COLOR = "#ff6a00";

// Whether frames recorded while the dot glides between targets train the model.
// A/B switch: the checkbox on the demo screen, or the Gazeusemotion parameter.
let useMotionSamples = true;
export function setUseMotionSamples(value) { useMotionSamples = !!value; }

const edges = [EDGE, 0.5, 1 - EDGE];
// Center first, then corners, then edge midpoints: neighbours are never
// consecutive, so each target needs a real saccade.
const TARGETS = [
    [1, 1], [0, 0], [2, 2], [2, 0], [0, 2],
    [1, 0], [1, 2], [0, 1], [2, 1],
].map(([i, j]) => [edges[i], edges[j]]);

export const gazeTracker = new GazeTracker();

let sendToTouchDesigner = () => {};
let session = null;

export function initGaze({ send }) {
    sendToTouchDesigner = send;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) gazeTracker.setModel(JSON.parse(saved));
    } catch (e) { /* storage can be unavailable; TouchDesigner restores it */ }
}

// TouchDesigner replies to the page's request with its saved calibration.
export function loadGazeModel(value) {
    try {
        const model = typeof value === "string" ? JSON.parse(value) : value;
        if (gazeTracker.setModel(model)) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(model)); } catch (e) { /* ignore */ }
        }
    } catch (e) {
        console.warn("Ignoring invalid gaze calibration", e);
    }
}

export function isCalibrating() {
    return session !== null;
}

// Called for every processed face frame. Returns the gaze to attach to results.
export function updateGaze(results, videoWidth, videoHeight) {
    // Landmarks are normalized, so stretching the image to the canvas does not
    // change them; the camera's own pixel aspect restores real distances.
    lastCamera = [videoWidth, videoHeight];
    const features = extractFeatures(results, videoWidth / videoHeight);
    if (session && features) collectSample(features);
    const gaze = gazeTracker.update(features, performance.now());
    gaze.setupChanged = Number(setupChanged());
    if (session?.testDot && gaze.valid) moveTestDot(gaze);
    return gaze;
}

let lastCamera = [0, 0];
const ASPECT_TOLERANCE = 0.03;

const aspectOf = ([w, h]) => (h ? w / h : 0);
const differs = (a, b) => Math.abs(a / b - 1) > ASPECT_TOLERANCE;

// The mapping learned at calibration time assumes the same camera aspect and
// the same content shape on the display. Flag it when either has changed.
function setupChanged() {
    const m = gazeTracker.model;
    if (!m?.viewport || !m?.camera) return false;
    return differs(aspectOf([innerWidth, innerHeight]), aspectOf(m.viewport))
        || differs(aspectOf(lastCamera), aspectOf(m.camera));
}


function el(tag, css, parent) {
    const node = document.createElement(tag);
    node.style.cssText = css;
    if (parent) parent.appendChild(node);
    return node;
}

function button(label, onClick, parent) {
    const b = el("button", `
        font:inherit; font-size:20px; padding:10px 28px; margin:0 10px; cursor:pointer;
        background:#fff; color:#222; border:2px solid #222; border-radius:8px;
    `, parent);
    b.textContent = label;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", onClick);
    return b;
}

function createOverlay() {
    const root = el("div", `
        position:fixed; inset:0; background:#fff; z-index:1000; cursor:crosshair;
        touch-action:none; user-select:none; -webkit-user-select:none;
        font-family:Roboto,Helvetica,Arial,sans-serif; color:#333;
    `, document.body);
    const message = el("div", `
        position:absolute; left:50%; top:16%; transform:translateX(-50%);
        text-align:center; font-size:24px; line-height:1.5; pointer-events:none; width:62%;
    `, root);
    const buttons = el("div", `
        position:absolute; left:50%; bottom:12%; transform:translateX(-50%);
    `, root);
    const dot = el("div", `
        position:absolute; width:${TARGET_SIZE}px; height:${TARGET_SIZE}px; border-radius:50%;
        transform:translate(-50%,-50%); display:none; box-sizing:border-box;
    `, root);
    const core = el("div", `
        position:absolute; inset:${TARGET_SIZE * 0.36}px; border-radius:50%; background:#111;
    `, dot);
    session = {
        phase: "demo", index: 0, samples: [], current: null, glide: null, raf: 0, testDot: null,
        holdStart: 0, root, message, buttons, dot, core, pos: [0.5, 0.5],
    };
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", cancelHold);
    root.addEventListener("pointercancel", cancelHold);
    window.addEventListener("keydown", onKeyDown);
    return session;
}

// The single explainer. The dot is a practice target; Skip goes straight on.
export function startGazeCalibration() {
    if (session) return;
    const s = createOverlay();
    s.message.innerHTML = "<b>Eye tracking calibration</b><br>" +
        "Press and hold the dot and look at it.<br>" +
        "When it changes color, slowly move your head side to side while still looking at it.";
    const label = el("label", "display:block; font-size:18px; margin-bottom:18px; cursor:pointer;", s.buttons);
    const box = el("input", "margin-right:8px; transform:scale(1.2);", label);
    box.type = "checkbox";
    box.checked = useMotionSamples;
    box.addEventListener("change", () => { useMotionSamples = box.checked; });
    label.append("Train on the moving dot too");
    label.addEventListener("pointerdown", (e) => e.stopPropagation());
    button("Skip demo", beginRun, s.buttons);
    placeDot([0.5, 0.5]);
    setDot(0, false, false);
}

function beginRun() {
    const s = session;
    if (!s || s.phase !== "demo") return;
    cancelHold();
    s.phase = "run";
    s.message.textContent = "";
    s.buttons.textContent = "";
    s.index = 0;
    placeDot(TARGETS[0]);
    setDot(0, false, false);
}

function placeDot([fx, fy]) {
    const s = session;
    s.pos = [fx, fy];
    s.dot.style.left = `${fx * window.innerWidth}px`;
    s.dot.style.top = `${fy * window.innerHeight}px`;
    s.dot.style.display = "block";
}

function setDot(progress, active, headCue) {
    const s = session;
    const color = headCue ? HEAD_COLOR : active ? "#0a7cff" : "#999";
    s.dot.style.background = `conic-gradient(${color} ${progress * 360}deg, #ddd 0)`;
    s.core.style.background = headCue ? HEAD_COLOR : active ? "#111" : "#666";
}

function overDot(event) {
    const [fx, fy] = session.pos;
    return Math.hypot(event.clientX - fx * innerWidth, event.clientY - fy * innerHeight)
        <= TARGET_SIZE * 0.75;
}

function onPointerDown(event) {
    const s = session;
    if (!s || s.current || s.glide || s.dot.style.display === "none") return;
    if (s.phase !== "demo" && s.phase !== "run") return;
    if (!overDot(event)) return;
    s.current = { group: s.index, demo: s.phase === "demo" };
    s.holdStart = performance.now();
    s.root.setPointerCapture(event.pointerId);
    s.raf = requestAnimationFrame(tickHold);
}

function onPointerMove(event) {
    // Sliding off the dot means the eyes may have left it too.
    if (session?.current && !overDot(event)) cancelHold();
}

function cancelHold() {
    const s = session;
    if (!s || !s.current) return;
    cancelAnimationFrame(s.raf);
    s.current = null;
    s.heldRows = 0;
    setDot(0, false, false);
}

function tickHold() {
    const s = session;
    if (!s || !s.current) return;
    const elapsed = performance.now() - s.holdStart;
    setDot(Math.min(elapsed / HOLD_MS, 1), true, elapsed >= MOVE_HEAD_AT_MS);
    if (elapsed >= HOLD_MS) {
        finishHold();
        return;
    }
    s.raf = requestAnimationFrame(tickHold);
}

function collectSample(features) {
    const s = session;
    if (features.blinking) return;
    const now = performance.now();
    if (s.current && !s.current.demo) {
        if (now - s.holdStart < SETTLE_MS) return;
        s.current.rows = s.current.rows ?? [];
        s.current.rows.push({ x: features.x, target: TARGETS[s.current.group], group: s.current.group });
    } else if (s.glide) {
        const t = now - s.glide.start;
        if (t < GLIDE_ONSET_SKIP_MS || t > GLIDE_MS) return;
        s.glide.rows.push({
            x: features.x,
            target: glidePosition(s.glide, Math.max(t - PURSUIT_LAG_MS, 0)),
            group: -1,
        });
    }
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);

function glidePosition(g, t) {
    const k = ease(Math.min(t / GLIDE_MS, 1));
    return [g.from[0] + (g.to[0] - g.from[0]) * k, g.from[1] + (g.to[1] - g.from[1]) * k];
}

function finishHold() {
    const s = session;
    const hold = s.current;
    s.current = null;
    if (hold.demo) {
        beginRun();
        return;
    }
    if (!hold.rows || hold.rows.length < MIN_SAMPLES_PER_TARGET) {
        // Face lost or eyes closed for most of the hold; the ring resets so
        // the same dot can simply be held again.
        setDot(0, false, false);
        return;
    }
    s.samples.push(...hold.rows);
    s.index++;
    if (s.index >= TARGETS.length) {
        finish();
        return;
    }
    startGlide(TARGETS[s.index - 1], TARGETS[s.index]);
}

function startGlide(from, to) {
    const s = session;
    setDot(0, false, false);
    s.glide = { from, to, start: performance.now(), rows: [] };
    const step = () => {
        if (!session || session.glide !== s.glide) return;
        const t = performance.now() - s.glide.start;
        placeDot(glidePosition(s.glide, t));
        if (t >= GLIDE_MS) {
            if (useMotionSamples) s.samples.push(...s.glide.rows);
            s.glide = null;
            placeDot(to);
            return;
        }
        s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
}

function onKeyDown(event) {
    if (event.key === "Escape") endCalibration();
}

function finish() {
    const s = session;
    s.dot.style.display = "none";
    const model = fitGazeModel(s.samples);
    if (!model) {
        s.message.textContent = "Calibration failed. Try again.";
        setTimeout(endCalibration, 2000);
        return;
    }
    model.viewport = [innerWidth, innerHeight];
    model.camera = lastCamera;
    model.motionSamples = useMotionSamples;
    gazeTracker.setModel(model);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(model)); } catch (e) { /* ignore */ }
    sendToTouchDesigner({ gazeCalibration: model });
    console.log("Gaze calibration done", {
        samples: model.samples, lambda: model.lambda,
        cvError: model.cvError, trainError: model.trainError,
    });
    showTest(model.cvError, model.motionSamples);
}

// A dot at the estimated gaze point, to judge the calibration by eye.
function showTest(cvError, motion) {
    const s = session;
    s.phase = "test";
    s.dot.style.display = "none";
    const error = Number.isFinite(cvError) ? ` Typical error: ${(cvError * 100).toFixed(1)}% of the screen.` : "";
    const mode = motion === undefined ? "" : motion ? " (trained with moving dot)" : " (held dots only)";
    s.message.textContent = `Calibrated. The red dot is where it thinks you are looking.${error}${mode}`;
    s.buttons.textContent = "";
    button("Done", endCalibration, s.buttons);
    button("Recalibrate", () => { endCalibration(); startGazeCalibration(); }, s.buttons);
    s.testDot = el("div", `
        position:absolute; left:0; top:0; width:34px; height:34px; margin:-17px 0 0 -17px;
        border-radius:50%; background:rgba(255,40,40,0.8); border:3px solid #fff;
        box-shadow:0 0 0 2px #b00; pointer-events:none; display:none;
    `, s.root);
}

function moveTestDot(gaze) {
    const x = Math.min(Math.max(gaze.u, 0), 1) * innerWidth;
    const y = Math.min(Math.max(1 - gaze.v, 0), 1) * innerHeight;
    session.testDot.style.display = "block";
    session.testDot.style.transform = `translate(${x}px, ${y}px)`;
}

// Test an existing calibration (the saved one) without recalibrating.
export function startGazeTest() {
    if (session || !gazeTracker.model) return;
    createOverlay();
    showTest(gazeTracker.model.cvError, gazeTracker.model.motionSamples);
}

function endCalibration() {
    const s = session;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    window.removeEventListener("keydown", onKeyDown);
    s.root.remove();
    session = null;
}
