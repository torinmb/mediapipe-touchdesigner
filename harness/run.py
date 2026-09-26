#!/usr/bin/env python3
"""MediaPipe TouchDesigner test harness.

  run      Headless Chrome + fake webcam video -> built web app -> fake TD.
           Prints transport / TD-main-thread metrics and saves a JSON report.
  serve    Just the fake TD server; open the printed URL in any browser to use
           a real webcam. Prints live stats.
  compare  Compare two --record files to prove DAT output is unchanged.

Examples:
  harness/.venv/bin/python harness/run.py run --features face,seg
  harness/.venv/bin/python harness/run.py run --features face,seg --record harness/out/base.jsonl
  harness/.venv/bin/python harness/run.py compare harness/out/base.jsonl harness/out/new.jsonl
"""

import argparse
import asyncio
import json
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HARNESS = Path(__file__).resolve().parent
sys.path.insert(0, str(HARNESS))

from fake_td import REPO, FakeTD, summarize  # noqa: E402

OUT = HARNESS / 'out'
MEDIA = HARNESS / 'media'

# feature -> (URL/WS parameter, message kind that proves it is producing output)
FEATURES = {
	'face': ('Detectfacelandmarks', 'faceLandmarkResults'),
	'facedet': ('Detectfaces', 'faceDetectorResults'),
	'hands': ('Detecthands', 'handResults'),
	'gestures': ('Detectgestures', 'gestureResults'),
	'pose': ('Detectposes', 'poseResults'),
	'objects': ('Detectobjects', 'objectResults'),
	'image': ('Detectimages', 'imageResults'),
	'embed': ('Detectimageembeddings', 'imageEmbedderResults'),
	'seg': ('Detectsegments', 'segmentation'),
}

# Records every WebSocket.send so send->TD-callback latency can be joined with
# the server's per-connection receive log. Payloads are never modified.
SEND_PROBE = """
(() => {
  const origSend = WebSocket.prototype.send;
  window.__harnessSockets = [];
  WebSocket.prototype.send = function (data) {
    if (!this.__harness) {
      this.__harness = { url: this.url, sends: [] };
      window.__harnessSockets.push(this.__harness);
    }
    const size = typeof data === 'string' ? data.length : (data.byteLength ?? data.size ?? 0);
    this.__harness.sends.push([performance.timeOrigin + performance.now(), size, this.bufferedAmount]);
    return origSend.call(this, data);
  };
})();
"""


# --------------------------------------------------------------------- build

def build():
	print('build: vite build ...', flush=True)
	start = time.time()
	result = subprocess.run(
		[str(REPO / 'node_modules' / '.bin' / 'vite'), 'build', '--logLevel', 'warn'],
		cwd=REPO,
	)
	if result.returncode != 0:
		sys.exit('vite build failed')
	print('build: done in {:.1f}s'.format(time.time() - start))


def freePort():
	with socket.socket() as sock:
		sock.bind(('127.0.0.1', 0))
		return sock.getsockname()[1]


def startViteDev():
	"""Serve src/ straight from the Vite dev server, like the dev TD setup."""
	port = freePort()
	process = subprocess.Popen(
		[str(REPO / 'node_modules' / '.bin' / 'vite'), '--port', str(port),
			'--strictPort', '--host', '127.0.0.1', '--logLevel', 'warn'],
		cwd=REPO,
		stdout=subprocess.DEVNULL,
	)
	base = 'http://localhost:{}'.format(port)
	deadline = time.time() + 30
	while time.time() < deadline:
		if process.poll() is not None:
			sys.exit('vite dev server exited')
		try:
			urllib.request.urlopen(base + '/vite.svg', timeout=1)
			return process, base
		except OSError:
			time.sleep(0.2)
	process.terminate()
	sys.exit('vite dev server did not start')


async def sampleFrameMarker(page, td, height, stop):
	"""Stand-in for the Web Render TOP: receive every frame the page's
	compositor paints (lossless PNG screencast) and hand the displayed
	bottom-left pixel (the frame marker) to the fake TD."""
	import base64
	import io

	from PIL import Image

	session = await page.context.new_cdp_session(page)

	async def onFrame(event):
		try:
			image = Image.open(io.BytesIO(base64.b64decode(event['data'])))
			td.setMarkerPixel(image.convert('RGB').getpixel((0, image.height - 1)))
		except Exception as error:
			print('marker decode failed: {}'.format(error))
		try:
			await session.send('Page.screencastFrameAck', {'sessionId': event['sessionId']})
		except Exception:
			pass

	session.on('Page.screencastFrame', lambda event: asyncio.ensure_future(onFrame(event)))
	await session.send('Page.startScreencast', {'format': 'png', 'everyNthFrame': 1})
	await stop.wait()
	try:
		await session.send('Page.stopScreencast')
	except Exception:
		pass


# ----------------------------------------------------------------- reporting

def joinLatency(td, browserSockets):
	"""Match the nth browser send on a socket with the nth server receive."""
	results = {}
	byPath = {}
	for connection in td.browserConnections():
		byPath.setdefault(connection.path, []).append(connection)
	for sock in browserSockets:
		path = urllib.parse.urlparse(sock['url']).path or '/'
		candidates = byPath.get(path) or []
		if not candidates:
			continue
		connection = candidates[-1]
		for send, received in zip(sock['sends'], connection.received):
			label, size, recvMs, dispatchMs = received
			if recvMs < td.measureStartMs:
				continue
			entry = results.setdefault(label, {'wire': [], 'toCallback': [], 'buffered': []})
			entry['wire'].append(recvMs - send[0])
			entry['toCallback'].append(dispatchMs - send[0])
			entry['buffered'].append(send[2] / 1024.0)
	return {
		label: {
			'wireMs': summarize(values['wire']),
			'sendToCallbackMs': summarize(values['toCallback']),
			'browserBufferedKB': summarize(values['buffered']),
		}
		for label, values in results.items()
	}


def fmt(stat, key='avg'):
	return '{:>8}'.format('{:.2f}'.format(stat.get(key, 0.0)) if stat.get('n') else '-')


def printReport(report):
	td = report['td']
	latency = report.get('latency', {})
	print()
	print('=' * 100)
	print('{}  |  {:.1f}s measured  |  features: {}  |  video: {}'.format(
		report['label'], td['elapsedSec'], ','.join(report['features']), report['video']))
	if report.get('gpu'):
		print('WebGL: ' + report['gpu'])
	print('=' * 100)
	print('{:<22}{:>7}{:>8}{:>8}{:>8} | {:>8}{:>8}{:>8} | {:>8}{:>8} | {:>8}{:>8}'.format(
		'message kind', 'count', '/sec', 'avgKB', 'MB/s',
		'cb avg', 'cb p95', 'cb max', 'q p50', 'q p95', 'e2e 50', 'e2e 95'))
	for label, kind in td['kinds'].items():
		lat = latency.get(label, {}).get('sendToCallbackMs', {})
		print('{:<22}{:>7}{:>8.1f}{:>8.1f}{:>8.2f} | {}{}{} | {}{} | {}{}'.format(
			label[:22], kind['count'], kind['perSec'], kind['avgKB'], kind['MBps'],
			fmt(kind['callbackMs']), fmt(kind['callbackMs'], 'p95'), fmt(kind['callbackMs'], 'max'),
			fmt(kind['queueMs'], 'p50'), fmt(kind['queueMs'], 'p95'),
			fmt(lat, 'p50'), fmt(lat, 'p95')))
	print('  cb = TD-main-thread callback ms, q = network-recv -> callback ms, '
		'e2e = browser send() -> callback ms')

	frames = td['frames']
	print()
	print('TD main thread @ {}fps: cooked {:.1f}/s, dropped {}, over-budget {}, '
		'work avg {:.2f} / p95 {:.2f} / max {:.2f} ms, msgs/frame max {}, KB/frame p95 {:.0f}, backlog {}'.format(
			td['fps'], frames['cookedPerSec'], frames['dropped'], frames['overBudget'],
			frames['workMs'].get('avg', 0), frames['workMs'].get('p95', 0), frames['workMs'].get('max', 0),
			int(frames['msgsPerFrame'].get('max', 0)), frames['KBPerFrame'].get('p95', 0),
			frames['queueBacklog']))
	if frames['framesThrottled']:
		print('  ingestion throttle deferred messages on {} frames'.format(frames['framesThrottled']))

	if td['dats']:
		print()
		print('DAT outputs (downstream json.loads once per cooked frame):')
		for name, dat in td['dats'].items():
			print('  {:<26} writes/s {:6.1f}   last {:7.1f} KB   parse avg {} / p95 {} ms'.format(
				name, dat['writesPerSec'], dat['lastBytes'] / 1024.0,
				fmt(dat['downstreamParseMs']).strip(), fmt(dat['downstreamParseMs'], 'p95').strip()))

	seg = td['segmentation']
	if seg['commits'] or 'seg' in report['features']:
		print()
		print('seg_data: {} commits ({:.1f}/s)  last {}'.format(
			seg['commits'], seg['commitsPerSec'], seg['last']))
		if seg.get('frameSync'):
			print('  frame sync: marker samples {:.1f}/s, frames with cache match {:.0f}%, sync wait avg {} ms'.format(
				seg['markerSamples'] / td['elapsedSec'], seg['cacheMatchedFramePct'],
				fmt(seg['syncWaitMs']).strip()))
		print('  end-to-end latency avg {} p95 {} ms | inference avg {} ms | droppedUnmatched {}'.format(
			fmt(seg['endToEndLatencyMs']).strip(), fmt(seg['endToEndLatencyMs'], 'p95').strip(),
			fmt(seg['inferenceMs']).strip(), seg['droppedUnmatched']))

	timers = td['browserTimers']
	if timers:
		print()
		print('browser: detectTime avg {} ms, drawTime avg {} ms, rAF loop {:.1f}/s, source fps {}'.format(
			fmt(timers.get('detectTime', {})).strip(), fmt(timers.get('drawTime', {})).strip(),
			td['kinds'].get('timers', {}).get('perSec', 0),
			fmt(timers.get('sourceFrameRate', {})).strip()))
		if 'seg.ackRoundTripMs' in timers:
			print('  seg transport: ack RTT avg {} ms, buffered max {:.0f} KB, skippedInFlight {:.0f}, ackTimeouts {:.0f}'.format(
				fmt(timers['seg.ackRoundTripMs']).strip(),
				timers.get('seg.bufferedBytes', {}).get('max', 0) / 1024.0,
				timers.get('seg.skippedInFlight', {}).get('max', 0),
				timers.get('seg.ackTimeouts', {}).get('max', 0)))

	if report.get('consoleErrors'):
		print()
		print('browser console errors ({}):'.format(len(report['consoleErrors'])))
		for line in report['consoleErrors'][:10]:
			print('  ' + line[:160])
	if td['scriptErrors']:
		print('TD script errors: {}'.format(td['scriptErrors']))
	print()
	print('report: {}'.format(report.get('reportPath')))


# ----------------------------------------------------------------- commands

def resolveVideo(name):
	path = Path(name)
	if not path.exists():
		path = MEDIA / (name if name.endswith('.mjpeg') else name + '.mjpeg')
	if not path.exists():
		sys.exit('video not found: {} (see harness/README.md to make one)'.format(name))
	return path.resolve()


def buildQuery(features, extraParams, webcamLabel):
	params = {'Webcam': webcamLabel}
	for feature, (param, _) in FEATURES.items():
		params[param] = '1' if feature in features else '0'
	params.update(extraParams)
	return urllib.parse.urlencode(params)


async def runCommand(args):
	from playwright.async_api import async_playwright

	features = [f for f in args.features.split(',') if f]
	for feature in features:
		if feature not in FEATURES:
			sys.exit('unknown feature {} (choose from {})'.format(feature, ', '.join(FEATURES)))
	extraParams = dict(p.split('=', 1) for p in args.param)
	video = resolveVideo(args.video)
	if args.build:
		build()

	OUT.mkdir(exist_ok=True)
	label = args.label or '{}-{}'.format('+'.join(features), time.strftime('%H%M%S'))
	td = FakeTD(
		port=args.port,
		fps=args.fps,
		maxMsgsPerFrame=args.max_msgs_per_frame,
		maxBytesPerFrame=args.max_kb_per_frame * 1024,
		recordPath=args.record,
		verbose=args.verbose,
		logPath=OUT / 'textport.log',
		scriptsDir=args.td_scripts,
		saveSegDir=args.save_seg,
		frameSync=not args.no_frame_sync,
	).start()
	print('fake TD listening on http://localhost:{}'.format(td.port))
	vite = None
	if args.source == 'dev':
		vite, base = startViteDev()
		# The page takes its socket port from Wsport, as in the dev TD setup.
		extraParams.setdefault('Wsport', str(td.port))
		print('vite dev server on {}'.format(base))
	else:
		base = 'http://localhost:{}'.format(td.port)

	consoleLines = []
	async with async_playwright() as playwright:
		browser = await playwright.chromium.launch(
			channel='chrome',
			headless=not args.headed,
			args=[
				'--use-fake-ui-for-media-stream',
				'--use-fake-device-for-media-stream',
				'--use-file-for-fake-video-capture={}'.format(video),
				'--autoplay-policy=no-user-gesture-required',
				'--disable-background-timer-throttling',
				'--disable-renderer-backgrounding',
				'--ignore-gpu-blocklist',
				'--enable-gpu',
			],
		)
		context = await browser.new_context(
			viewport={'width': args.width, 'height': args.height},
			permissions=['camera'],
		)
		page = await context.new_page()
		page.on('console', lambda msg: consoleLines.append('[{}] {}'.format(msg.type, msg.text)))
		page.on('pageerror', lambda err: consoleLines.append('[pageerror] {}'.format(err)))
		page.on('response', lambda r: r.status >= 400 and consoleLines.append(
			'[http {}] {}'.format(r.status, r.url)))

		# Find the fake camera's label on the same origin (the app only starts a
		# webcam whose label matches the Webcam parameter, as TD passes it).
		await page.goto(base + '/vite.svg')
		probe = await page.evaluate("""async () => {
			const s = await navigator.mediaDevices.getUserMedia({video: true});
			s.getTracks().forEach(t => t.stop());
			const devices = await navigator.mediaDevices.enumerateDevices();
			const cam = devices.find(d => d.kind === 'videoinput');
			const gl = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas').getContext('webgl2');
			const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
			return {label: cam ? cam.label : '', gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? 'webgl2 (renderer hidden)' : 'NO WEBGL2')};
		}""")
		webcamLabel = args.webcam or probe['label']

		await page.add_init_script(SEND_PROBE)
		url = '{}/?{}'.format(base, buildQuery(features, extraParams, webcamLabel))
		print('opening {}'.format(url))
		pageOpenedAt = time.time()
		await page.goto(url)
		stopSampling = asyncio.Event()
		sampler = None
		if td.frameSync:
			sampler = asyncio.create_task(sampleFrameMarker(page, td, args.height, stopSampling))

		expected = {FEATURES[f][1] for f in features}
		deadline = time.time() + args.ready_timeout
		while time.time() < deadline:
			seen = set(td.metrics.kinds)
			if expected <= seen and 'timers' in seen:
				break
			await asyncio.sleep(0.25)
		else:
			missing = expected - set(td.metrics.kinds)
			print('WARNING: no output yet for {} after {}s'.format(missing, args.ready_timeout))

		readySec = time.time() - pageOpenedAt
		print('first output from every model after {:.1f}s'.format(readySec))
		await asyncio.sleep(args.warmup)
		td.reset()
		print('measuring for {}s ...'.format(args.seconds), flush=True)
		await asyncio.sleep(args.seconds)
		snapshot = td.snapshot()
		sockets = await page.evaluate('window.__harnessSockets')
		stopSampling.set()
		if sampler is not None:
			await sampler
		await browser.close()
	td.stop()
	if vite is not None:
		vite.terminate()

	report = {
		'label': label,
		'features': features,
		'params': extraParams,
		'video': video.name,
		'source': args.source,
		'gpu': probe['gpu'],
		'readySec': readySec,
		'td': snapshot,
		'latency': joinLatency(td, sockets),
		# MediaPipe logs its TFLite delegate banner at error level; ignore it.
		'consoleErrors': [
			line for line in consoleLines
			if line.startswith(('[error]', '[pageerror]', '[http'))
			and 'INFO:' not in line and 'Failed to load resource' not in line
		],
	}
	reportPath = OUT / 'report-{}.json'.format(label)
	report['reportPath'] = str(reportPath.relative_to(REPO))
	reportPath.write_text(json.dumps(report, indent=2))
	(OUT / 'console.log').write_text('\n'.join(consoleLines))
	if args.json:
		print(json.dumps(report, indent=2))
	else:
		printReport(report)
	failed = report['consoleErrors'] or snapshot['scriptErrors'] or not (
		expected <= set(snapshot['kinds']))
	return 1 if failed else 0


def serveCommand(args):
	if args.build:
		build()
	OUT.mkdir(exist_ok=True)
	td = FakeTD(
		port=args.port,
		fps=args.fps,
		maxMsgsPerFrame=args.max_msgs_per_frame,
		maxBytesPerFrame=args.max_kb_per_frame * 1024,
		recordPath=args.record,
		verbose=args.verbose,
		logPath=OUT / 'textport.log',
		scriptsDir=args.td_scripts,
	).start()
	print('fake TD on port {0}. Open your dev page with ?Wsport={0}&Webcam=<camera label>&Detectsegments=1'.format(td.port))
	print('(or the built _mpdist at http://localhost:{}/?Webcam=...)'.format(td.port))
	try:
		while True:
			time.sleep(args.interval)
			snap = td.snapshot()
			td.reset()
			parts = ['{} {:.0f}/s {:.1f}MB/s cb{:.1f}ms'.format(
				k, v['perSec'], v['MBps'], v['callbackMs'].get('avg', 0))
				for k, v in snap['kinds'].items() if k != 'timers']
			frames = snap['frames']
			print('frames {:.0f}/s drop {} work p95 {:.1f}ms | seg {:.0f}/s | {}'.format(
				frames['cookedPerSec'], frames['dropped'], frames['workMs'].get('p95', 0),
				snap['segmentation']['commitsPerSec'], ' | '.join(parts)), flush=True)
	except KeyboardInterrupt:
		td.stop()


# ------------------------------------------------------------------ compare

def shape(value):
	"""Structural signature: keys, types and list lengths, not values."""
	if isinstance(value, dict):
		return {key: shape(item) for key, item in sorted(value.items())}
	if isinstance(value, list):
		return ['list', len(value), shape(value[0]) if value else None]
	if isinstance(value, bool) or value is None:
		return type(value).__name__
	if isinstance(value, (int, float)):
		return 'number'
	return type(value).__name__


def numericLeaves(value, prefix='', out=None):
	out = {} if out is None else out
	if isinstance(value, dict):
		for key, item in value.items():
			numericLeaves(item, prefix + '.' + key, out)
	elif isinstance(value, list):
		for index, item in enumerate(value):
			numericLeaves(item, '{}[{}]'.format(prefix, index), out)
	elif isinstance(value, (int, float)) and not isinstance(value, bool):
		out[prefix] = float(value)
	return out


def loadRecording(path):
	byOp = {}
	for line in Path(path).read_text().splitlines():
		entry = json.loads(line)
		byOp.setdefault(entry['op'], []).append(entry)
	return byOp


def compareCommand(args):
	a, b = loadRecording(args.a), loadRecording(args.b)
	ok = True
	for op in sorted(set(a) | set(b)):
		entriesA, entriesB = a.get(op, []), b.get(op, [])
		print('\n{}: {} vs {} writes'.format(op, len(entriesA), len(entriesB)))
		if not entriesA or not entriesB:
			print('  MISSING in one recording')
			ok = False
			continue
		if op == 'seg_data':
			sigA = {(tuple(e['shape']), e['dtype']) for e in entriesA}
			sigB = {(tuple(e['shape']), e['dtype']) for e in entriesB}
			print('  shape/dtype A={} B={}'.format(sorted(sigA), sorted(sigB)))
			ok &= sigA == sigB
			meanA = sum(e['mean'] for e in entriesA) / len(entriesA)
			meanB = sum(e['mean'] for e in entriesB) / len(entriesB)
			print('  mean pixel A={:.5f} B={:.5f}'.format(meanA, meanB))
			continue
		parsedA = [json.loads(e['text']) for e in entriesA if e['text']]
		parsedB = [json.loads(e['text']) for e in entriesB if e['text']]
		shapesA = {json.dumps(shape(p)) for p in parsedA}
		shapesB = {json.dumps(shape(p)) for p in parsedB}
		if shapesA == shapesB:
			print('  schema identical ({} distinct shape(s))'.format(len(shapesA)))
		else:
			ok = False
			print('  SCHEMA DIFFERS: {} only-in-A, {} only-in-B'.format(
				len(shapesA - shapesB), len(shapesB - shapesA)))
			for s in list(shapesA - shapesB)[:1]:
				print('    A: ' + s[:400])
			for s in list(shapesB - shapesA)[:1]:
				print('    B: ' + s[:400])
		# Mean of every numeric leaf across the run. With the same video these
		# should agree closely even though frames are not aligned 1:1. Leaves
		# with a large spread (e.g. transformation matrices in cm) are judged
		# relative to their own standard deviation instead of absolutely.
		stats = []
		for parsed in (parsedA, parsedB):
			series = {}
			for item in parsed:
				for key, number in numericLeaves(item).items():
					series.setdefault(key, []).append(number)
			stats.append({
				key: (sum(v) / len(v), (sum((x - sum(v) / len(v)) ** 2 for x in v) / len(v)) ** 0.5)
				for key, v in series.items()
			})
		shared = set(stats[0]) & set(stats[1])
		if shared:
			scored = sorted(
				(
					abs(stats[0][k][0] - stats[1][k][0]) / max(1.0, stats[0][k][1]),
					abs(stats[0][k][0] - stats[1][k][0]),
					k,
				)
				for k in shared
			)
			score, rawDiff, key = scored[-1]
			print('  numeric leaves: {} shared, worst mean diff {:.6f} (scaled {:.6f}) at {}'.format(
				len(shared), rawDiff, score, key))
			if score > args.tolerance:
				ok = False
				print('  EXCEEDS tolerance {}'.format(args.tolerance))
	print('\nRESULT: {}'.format('OK' if ok else 'DIFFERENT'))
	return 0 if ok else 1


# --------------------------------------------------------------------- main

def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	sub = parser.add_subparsers(dest='command', required=True)

	def tdOptions(p):
		p.add_argument('--port', type=int, default=0, help='0 = pick a free port (like Autoport)')
		p.add_argument('--fps', type=int, default=60, help='TD cook rate')
		p.add_argument('--max-msgs-per-frame', type=int, default=0,
			help='emulate a TD ingestion limit (0 = unlimited)')
		p.add_argument('--max-kb-per-frame', type=int, default=0,
			help='emulate a TD ingestion byte limit per frame (0 = unlimited)')
		p.add_argument('--record', help='write every DAT/TOP output to this JSONL file')
		p.add_argument('--build', action='store_true', help='run vite build into _mpdist first (only matters for --source dist)')
		p.add_argument('--verbose', action='store_true', help='echo TD textport output')
		p.add_argument('--td-scripts', default=str(REPO / 'td_scripts' / 'Media_Pipe'),
			help='directory holding the callback .py files (e.g. an older release)')

	run = sub.add_parser('run', help='automated headless run')
	tdOptions(run)
	run.add_argument('--features', default='face,seg', help=','.join(FEATURES))
	run.add_argument('--source', choices=('dev', 'dist'), default='dev',
		help='dev: page from the Vite dev server (src/); dist: _mpdist via onHTTPRequest')
	run.add_argument('--video', default='vidtest', help='name in harness/media or path to .mjpeg/.y4m')
	run.add_argument('--seconds', type=float, default=10)
	run.add_argument('--warmup', type=float, default=3)
	run.add_argument('--ready-timeout', type=float, default=90)
	run.add_argument('--param', action='append', default=[], help='extra URL param K=V, e.g. Smodeltype=selfieSquare')
	run.add_argument('--webcam', help='override the webcam label')
	run.add_argument('--width', type=int, default=1280)
	run.add_argument('--height', type=int, default=720)
	run.add_argument('--headed', action='store_true', help='show the Chrome window')
	run.add_argument('--label', help='name for the report file')
	run.add_argument('--no-frame-sync', action='store_true',
		help='skip the Web Render marker emulation; masks commit on arrival')
	run.add_argument('--save-seg', help='save every 10th committed seg_data array (.npy) to this directory')
	run.add_argument('--json', action='store_true', help='print the full JSON report')

	serve = sub.add_parser('serve', help='fake TD server only; bring your own browser')
	tdOptions(serve)
	serve.add_argument('--interval', type=float, default=2.0)

	compare = sub.add_parser('compare', help='compare two --record files')
	compare.add_argument('a')
	compare.add_argument('b')
	compare.add_argument('--tolerance', type=float, default=0.02,
		help='max per-leaf mean difference (divided by the leaf stdev when stdev > 1)')

	args = parser.parse_args()
	if args.command == 'run':
		sys.exit(asyncio.run(runCommand(args)))
	if args.command == 'serve':
		serveCommand(args)
	if args.command == 'compare':
		sys.exit(compareCommand(args))


if __name__ == '__main__':
	main()
