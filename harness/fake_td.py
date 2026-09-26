"""A headless stand-in for the MediaPipe TouchDesigner component.

Network I/O runs on an asyncio thread (like TD's Web Server DAT network
thread). Every callback runs on one "TD main thread" that cooks at a fixed
frame rate and drains the queued events each frame, which is how TD delivers
Web Server DAT callbacks. The callback files in td_scripts/ are loaded as-is.
"""

import asyncio
import collections
import json
import re
import threading
import time
from pathlib import Path

from aiohttp import ClientSession, WSMsgType, web

import numpy as np

from td_stubs import FakeCHOP, FakeScriptCHOP, TDEnvironment, arrayDigest

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / 'td_scripts' / 'Media_Pipe'
TEXT_KIND = re.compile(r'^\s*\{\s*"([A-Za-z_]+)"')
SEG_MAGIC = b'MPSG'
HARNESS_HEADER = 'X-Harness-Client'


def classifyText(data):
	match = TEXT_KIND.match(data[:200])
	return match.group(1) if match else 'text:' + data[:12]


def classifyBinary(data):
	return 'segmentation' if bytes(data[:4]) == SEG_MAGIC else 'binary'


def pct(values, p):
	if not values:
		return 0.0
	values = sorted(values)
	index = min(len(values) - 1, max(0, int(round(p / 100.0 * (len(values) - 1)))))
	return values[index]


def summarize(values):
	if not values:
		return {'n': 0}
	return {
		'n': len(values),
		'avg': sum(values) / len(values),
		'p50': pct(values, 50),
		'p95': pct(values, 95),
		'max': max(values),
	}


class KindStats:
	def __init__(self):
		self.count = 0
		self.bytes = 0
		self.callbackMs = []
		self.queueMs = []


class Metrics:
	def __init__(self):
		self.startedAt = time.time()
		self.kinds = collections.defaultdict(KindStats)
		self.frameWorkMs = []
		self.msgsPerFrame = []
		self.bytesPerFrame = []
		self.droppedFrames = 0
		self.frames = 0
		self.deferredFrames = 0
		self.datWrites = collections.Counter()
		self.downstreamParseMs = collections.defaultdict(list)
		self.segCommits = 0
		self.segLatencyMs = []
		self.segSyncWaitMs = []
		self.segInferenceMs = []
		self.segLast = None
		self.browserTimers = collections.defaultdict(list)
		self.sentToBrowser = collections.Counter()
		self.cacheMatchedFrames = 0


class Connection:
	def __init__(self, clientId, path, ws, internal):
		self.clientId = clientId
		self.path = path
		self.ws = ws
		self.internal = internal
		self.openedAt = time.time() * 1000.0
		# (kind, bytes, recvEpochMs, dispatchEpochMs) in socket order.
		self.received = []


class WebServerDATStub:
	"""The `webServerDAT` argument handed to webserver_callbacks.py."""

	def __init__(self, td):
		self._td = td

	def webSocketSendText(self, client, data):
		self._td.sendToClient(client, str(data), text=True)

	def webSocketSendBinary(self, client, data):
		self._td.sendToClient(client, bytes(data), text=False)

	def webSocketSendPong(self, client, data=None):
		return


class WebSocketDATStub:
	"""The `dat` argument handed to websocket_callbacks.py (websocket1)."""

	def __init__(self, td):
		self._td = td

	def sendText(self, message):
		self._td.sendFromWebsocket1(str(message))

	def sendPong(self, contents):
		return


class FakeTD:
	def __init__(
		self,
		port=0,
		fps=60,
		maxMsgsPerFrame=0,
		maxBytesPerFrame=0,
		recordPath=None,
		verbose=False,
		logPath=None,
		scriptsDir=SCRIPTS,
		saveSegDir=None,
		saveSegEvery=10,
		frameSync=False,
	):
		self.port = port
		self.fps = fps
		self.maxMsgsPerFrame = maxMsgsPerFrame
		self.maxBytesPerFrame = maxBytesPerFrame
		self.verbose = verbose
		self._logFile = open(logPath, 'w') if logPath else None
		self._recordFile = open(recordPath, 'w') if recordPath else None
		self._recording = False
		self.saveSegDir = Path(saveSegDir) if saveSegDir else None
		self.saveSegEvery = max(1, saveSegEvery)
		if self.saveSegDir:
			self.saveSegDir.mkdir(parents=True, exist_ok=True)

		self._lock = threading.Lock()
		self._events = collections.deque()
		self._dirtyDats = set()
		self._running = False
		self._resetRequested = threading.Event()
		self.metrics = Metrics()
		self.measureStartMs = time.time() * 1000.0
		self.connections = {}
		self.closedConnections = []
		self.loop = None
		self.websocket1 = None

		self.env = TDEnvironment(
			rate=fps,
			log=self.log,
			onDatWrite=self._onDatWrite,
			onTopCopy=self._onTopCopy,
		)
		# TD runs these with the component's cwd at the project folder, which
		# is where onHTTPRequest looks for _mpdist/.
		scriptsDir = Path(scriptsDir)
		self.server = self.env.loadCallbacks(scriptsDir / 'webserver_callbacks.py')
		self.ws1 = self.env.loadCallbacks(scriptsDir / 'websocket_callbacks.py')
		# Frame sync: emulate the Web Render TOP's bottom-left marker pixel and
		# cook the real seg_offset.py Script CHOP every frame, so masks commit
		# only once their exact frame has been "displayed", as in TD.
		self.frameSync = frameSync
		self.markerRGB = None
		self.markerSamples = 0
		if frameSync:
			self.markerCHOP = FakeCHOP('marker_rgb')
			for channel in ('r', 'g', 'b'):
				self.markerCHOP.appendChan(channel)
			self.segOffsetCHOP = FakeScriptCHOP(
				'seg_offset', [self.markerCHOP, self.env.ops['timers']]
			)
			self.segOffset = self.env.loadCallbacks(scriptsDir / 'seg_offset.py')
			self.env.ops['seg_offset'] = self.segOffsetCHOP
		self.webServerDAT = WebServerDATStub(self)
		self.websocket1DAT = WebSocketDATStub(self)
		self._lastSegSequence = None

	# ------------------------------------------------------------------ logging

	def log(self, message):
		if self._logFile:
			self._logFile.write(message + '\n')
			self._logFile.flush()
		if self.verbose:
			print('[td] ' + message, flush=True)

	def _record(self, entry):
		if self._recordFile and self._recording:
			entry['frame'] = self.env.absTime.frame
			entry['t'] = round(time.time() * 1000.0 - self.measureStartMs, 3)
			self._recordFile.write(json.dumps(entry) + '\n')

	def _onDatWrite(self, name, text):
		self.metrics.datWrites[name] += 1
		self._dirtyDats.add(name)
		self._record({'op': name, 'text': text})

	def _onTopCopy(self, name, array):
		self.metrics.segCommits += 1
		if (
			self.saveSegDir
			and self._recording
			and self.metrics.segCommits % self.saveSegEvery == 0
		):
			np.save(self.saveSegDir / 'seg_{:05d}.npy'.format(self.metrics.segCommits), array)
		self._record({
			'op': name,
			'shape': list(array.shape),
			'dtype': str(array.dtype),
			'sha1': arrayDigest(array),
			'mean': float(array.mean()),
		})

	# --------------------------------------------------------------- lifecycle

	def start(self):
		ready = threading.Event()
		self._running = True
		self._netThread = threading.Thread(
			target=self._runNetwork, args=(ready,), daemon=True, name='td-network'
		)
		self._netThread.start()
		ready.wait()
		self._frameThread = threading.Thread(
			target=self._runFrames, daemon=True, name='td-main'
		)
		self._frameThread.start()
		self._enqueue(('serverStart',))
		asyncio.run_coroutine_threadsafe(self._connectWebsocket1(), self.loop)
		return self

	def stop(self):
		self._running = False
		if self.loop:
			self.loop.call_soon_threadsafe(self.loop.stop)

	def reset(self):
		"""Start a fresh measurement window (called after warmup)."""
		self._resetRequested.set()
		while self._resetRequested.is_set():
			time.sleep(0.005)

	# ---------------------------------------------------------------- network

	def _runNetwork(self, ready):
		self.loop = asyncio.new_event_loop()
		asyncio.set_event_loop(self.loop)
		app = web.Application(client_max_size=1024 ** 3)
		app.router.add_route('*', '/{tail:.*}', self._handle)
		runner = web.AppRunner(app, access_log=None)
		self.loop.run_until_complete(runner.setup())
		site = web.TCPSite(runner, '127.0.0.1', self.port)
		self.loop.run_until_complete(site.start())
		self.port = site._server.sockets[0].getsockname()[1]
		ready.set()
		self.loop.run_forever()

	async def _handle(self, request):
		if request.headers.get('Upgrade', '').lower() == 'websocket':
			return await self._handleWebSocket(request)
		future = self.loop.create_future()
		self._enqueue(('http', request.method, request.path, dict(request.query), future))
		status, contentType, body = await future
		return web.Response(
			status=status,
			body=body,
			headers={'Content-Type': contentType or 'application/octet-stream'},
		)

	async def _handleWebSocket(self, request):
		ws = web.WebSocketResponse(max_msg_size=0, compress=False)
		await ws.prepare(request)
		peer = request.transport.get_extra_info('peername') or ('127.0.0.1', 0)
		clientId = '{}:{}'.format(peer[0], peer[1])
		internal = request.headers.get(HARNESS_HEADER) == 'websocket1'
		connection = Connection(clientId, request.path, ws, internal)
		with self._lock:
			self.connections[clientId] = connection
		self._enqueue(('open', clientId, request.path))
		try:
			async for message in ws:
				recvMs = time.time() * 1000.0
				if message.type == WSMsgType.TEXT:
					self._enqueue(('text', clientId, message.data, recvMs))
				elif message.type == WSMsgType.BINARY:
					self._enqueue(('binary', clientId, message.data, recvMs))
		finally:
			self._enqueue(('close', clientId))
		return ws

	async def _connectWebsocket1(self):
		session = ClientSession()
		for _ in range(50):
			try:
				self.websocket1 = await session.ws_connect(
					'ws://127.0.0.1:{}/'.format(self.port),
					headers={HARNESS_HEADER: 'websocket1'},
					max_msg_size=0,
				)
				break
			except Exception:
				await asyncio.sleep(0.1)
		self._enqueue(('ws1connect',))
		async for message in self.websocket1:
			if message.type == WSMsgType.TEXT:
				self._enqueue(('ws1text', message.data))

	def sendToClient(self, clientId, data, text):
		connection = self.connections.get(clientId)
		if connection is None or connection.ws.closed:
			return
		self.metrics.sentToBrowser['text' if text else 'binary'] += 1
		send = connection.ws.send_str(data) if text else connection.ws.send_bytes(data)
		asyncio.run_coroutine_threadsafe(send, self.loop)

	def sendFromWebsocket1(self, message):
		if self.websocket1 is not None and not self.websocket1.closed:
			asyncio.run_coroutine_threadsafe(self.websocket1.send_str(message), self.loop)

	def sendConfig(self, **params):
		"""Send a parameter change exactly like par_change_handler does."""
		self.sendFromWebsocket1(json.dumps({key: str(value) for key, value in params.items()}))

	def _enqueue(self, event):
		with self._lock:
			self._events.append(event)

	# ------------------------------------------------------------- main thread

	def _runFrames(self):
		period = 1.0 / self.fps
		origin = time.perf_counter()
		lastFrameIndex = 0
		while self._running:
			if self._resetRequested.is_set():
				self.metrics = Metrics()
				self.measureStartMs = time.time() * 1000.0
				self._recording = True
				self._resetRequested.clear()

			frameIndex = int((time.perf_counter() - origin) / period) + 1
			skipped = max(0, frameIndex - lastFrameIndex - 1)
			lastFrameIndex = frameIndex
			self.metrics.droppedFrames += skipped
			self.env.absTime.frame = frameIndex
			self.env.absTime.seconds = frameIndex * period

			workStart = time.perf_counter()
			self._cookSegOffset()
			messages, byteCount = self._cookFrame()
			self._cookDownstream()
			workMs = (time.perf_counter() - workStart) * 1000.0

			self.metrics.frames += 1
			self.metrics.frameWorkMs.append(workMs)
			self.metrics.msgsPerFrame.append(messages)
			self.metrics.bytesPerFrame.append(byteCount)

			nextFrame = origin + frameIndex * period
			delay = nextFrame - time.perf_counter()
			if delay > 0:
				time.sleep(delay)

	def _cookFrame(self):
		messages = 0
		byteCount = 0
		while True:
			with self._lock:
				if not self._events:
					break
				event = self._events[0]
				if event[0] in ('text', 'binary'):
					size = len(event[2])
					overMsgs = self.maxMsgsPerFrame and messages >= self.maxMsgsPerFrame
					overBytes = (
						self.maxBytesPerFrame
						and messages > 0
						and byteCount + size > self.maxBytesPerFrame
					)
					if overMsgs or overBytes:
						self.metrics.deferredFrames += 1
						break
					messages += 1
					byteCount += size
				self._events.popleft()
			try:
				self._dispatch(event)
			except Exception as error:
				self.log('[exception] {}: {!r}'.format(event[0], error))
		self._checkSegmentationCommit()
		return messages, byteCount

	def _dispatch(self, event):
		kind = event[0]
		if kind in ('text', 'binary'):
			_, clientId, data, recvMs = event
			dispatchMs = time.time() * 1000.0
			label = classifyText(data) if kind == 'text' else classifyBinary(data)
			start = time.perf_counter()
			if kind == 'text':
				self.server.onWebSocketReceiveText(self.webServerDAT, clientId, data)
			else:
				self.server.onWebSocketReceiveBinary(self.webServerDAT, clientId, data)
			callbackMs = (time.perf_counter() - start) * 1000.0

			stats = self.metrics.kinds[label]
			stats.count += 1
			stats.bytes += len(data)
			stats.callbackMs.append(callbackMs)
			stats.queueMs.append(dispatchMs - recvMs)
			connection = self.connections.get(clientId)
			if connection is not None:
				connection.received.append((label, len(data), recvMs, dispatchMs))
			if label == 'timers':
				self._collectBrowserTimers(data)
		elif kind == 'open':
			self.server.onWebSocketOpen(self.webServerDAT, event[1], event[2])
		elif kind == 'close':
			self.server.onWebSocketClose(self.webServerDAT, event[1])
			with self._lock:
				connection = self.connections.pop(event[1], None)
				if connection is not None:
					self.closedConnections.append(connection)
		elif kind == 'http':
			_, method, path, query, future = event
			request = {'method': method, 'uri': path, 'pars': query, 'data': b''}
			response = {'statusCode': 404, 'statusReason': 'Not Found', 'data': b''}
			result = self.server.onHTTPRequest(self.webServerDAT, request, response) or response
			body = result.get('data') or b''
			if isinstance(body, str):
				body = body.encode()
			reply = (int(result.get('statusCode', 404)), result.get('Content-Type'), bytes(body))
			self.loop.call_soon_threadsafe(future.set_result, reply)
		elif kind == 'serverStart':
			self.server.onServerStart(self.webServerDAT)
		elif kind == 'ws1connect':
			self.ws1.onConnect(self.websocket1DAT)
		elif kind == 'ws1text':
			self.ws1.onReceiveText(self.websocket1DAT, 0, event[1])

	def _collectBrowserTimers(self, data):
		try:
			timers = json.loads(data)['timers']
		except (ValueError, KeyError):
			return
		prefixes = {'segmentationTransport': 'seg.', 'controlTransport': 'control.'}
		for key, value in timers.items():
			if isinstance(value, dict):
				prefix = prefixes.get(key, key + '.')
				for subKey, subValue in value.items():
					self.metrics.browserTimers[prefix + subKey].append(subValue)
			else:
				self.metrics.browserTimers[key].append(value)

	def setMarkerPixel(self, rgb):
		"""Latest displayed bottom-left pixel (0-255 ints) from the page."""
		self.markerRGB = rgb
		self.markerSamples += 1

	def _cookSegOffset(self):
		if not self.frameSync or self.markerRGB is None:
			return
		for channel, value in zip(('r', 'g', 'b'), self.markerRGB):
			self.markerCHOP[channel][0] = value / 255.0
		try:
			self.segOffset.onCook(self.segOffsetCHOP)
		except Exception as error:
			self.log('[exception] seg_offset: {!r}'.format(error))
		marker = self.segOffsetCHOP['segMarkerFrame']
		pending = self.segOffsetCHOP['segPendingFrame']
		sample = (
			int(marker[0]) if marker is not None else None,
			int(pending[0]) if pending is not None else None,
		)
		if sample != getattr(self, '_lastSyncSample', None):
			self._lastSyncSample = sample
			self.log('[sync] frame {} marker {} pending {} rgb {}'.format(
				self.env.absTime.frame, sample[0], sample[1], self.markerRGB))
		matched = self.segOffsetCHOP['segCacheMatched']
		if matched is not None:
			self.metrics.cacheMatchedFrames += int(matched[0] > 0.5)

	def _checkSegmentationCommit(self):
		meta = self.server.latestSegmentationMeta
		if meta is None or meta['packetSequence'] == self._lastSegSequence:
			return
		self._lastSegSequence = meta['packetSequence']
		self.metrics.segLatencyMs.append(meta['cacheLatencyMs'])
		self.metrics.segSyncWaitMs.append(meta.get('syncWaitMs', 0))
		self.metrics.segInferenceMs.append(meta['inferenceTimeMs'])
		self.metrics.segLast = {
			key: meta[key]
			for key in ('width', 'height', 'channels', 'dtype', 'mode', 'maskCount')
		}

	def _cookDownstream(self):
		"""Emulate downstream DATs that json.loads each changed results DAT
		once per frame (landmarks_to_CHOP_exec, build_facemesh_SOP, ...)."""
		dirty, self._dirtyDats = self._dirtyDats, set()
		for name in dirty:
			text = self.env.ops[name].text
			start = time.perf_counter()
			try:
				json.loads(text)
			except ValueError:
				pass
			self.metrics.downstreamParseMs[name].append(
				(time.perf_counter() - start) * 1000.0
			)

	# ----------------------------------------------------------------- report

	def snapshot(self):
		metrics = self.metrics
		elapsed = max(1e-6, time.time() - metrics.startedAt)
		kinds = {}
		for label, stats in sorted(metrics.kinds.items()):
			kinds[label] = {
				'count': stats.count,
				'perSec': stats.count / elapsed,
				'avgKB': stats.bytes / max(1, stats.count) / 1024.0,
				'MBps': stats.bytes / elapsed / 1024.0 / 1024.0,
				'callbackMs': summarize(stats.callbackMs),
				'queueMs': summarize(stats.queueMs),
			}
		frameBudgetMs = 1000.0 / self.fps
		return {
			'elapsedSec': elapsed,
			'fps': self.fps,
			'kinds': kinds,
			'frames': {
				'cooked': metrics.frames,
				'cookedPerSec': metrics.frames / elapsed,
				'dropped': metrics.droppedFrames,
				'overBudget': sum(1 for ms in metrics.frameWorkMs if ms > frameBudgetMs),
				'workMs': summarize(metrics.frameWorkMs),
				'msgsPerFrame': summarize(metrics.msgsPerFrame),
				'KBPerFrame': summarize([b / 1024.0 for b in metrics.bytesPerFrame]),
				'framesThrottled': metrics.deferredFrames,
				'queueBacklog': len(self._events),
			},
			'dats': {
				name: {
					'writes': count,
					'writesPerSec': count / elapsed,
					'downstreamParseMs': summarize(metrics.downstreamParseMs.get(name, [])),
					'lastBytes': len(self.env.ops[name].text),
				}
				for name, count in sorted(metrics.datWrites.items())
			},
			'segmentation': {
				'commits': metrics.segCommits,
				'commitsPerSec': metrics.segCommits / elapsed,
				'endToEndLatencyMs': summarize(metrics.segLatencyMs),
				'syncWaitMs': summarize(metrics.segSyncWaitMs),
				'inferenceMs': summarize(metrics.segInferenceMs),
				'last': metrics.segLast,
				'droppedUnmatched': self.server.segmentationDroppedUnmatched,
				'frameSync': self.frameSync,
				'markerSamples': self.markerSamples,
				'cacheMatchedFramePct': 100.0 * metrics.cacheMatchedFrames / max(1, metrics.frames),
			},
			'browserTimers': {
				key: summarize([float(v) for v in values])
				for key, values in sorted(metrics.browserTimers.items())
			},
			'timersCHOP': self.env.ops['timers'].values(),
			'scriptErrors': list(self.env.me.parent().errors),
		}

	def browserConnections(self):
		with self._lock:
			connections = list(self.closedConnections) + list(self.connections.values())
		return [c for c in connections if not c.internal]
