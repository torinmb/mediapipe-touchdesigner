# me - this DAT.
# webServerDAT - the connected Web Server DAT
# request - A dictionary of the request fields. The dictionary will always contain the below entries, plus any additional entries dependent on the contents of the request
# 		'method' - The HTTP method of the request (ie. 'GET', 'PUT').
# 		'uri' - The client's requested URI path. If there are parameters in the URI then they will be located under the 'pars' key in the request dictionary.
#		'pars' - The query parameters.
# 		'clientAddress' - The client's address.
# 		'serverAddress' - The server's address.
# 		'data' - The data of the HTTP request.
# response - A dictionary defining the response, to be filled in during the request method. Additional fields not specified below can be added (eg. response['content-type'] = 'application/json').
# 		'statusCode' - A valid HTTP status code integer (ie. 200, 401, 404). Default is 404.
# 		'statusReason' - The reason for the above status code being returned (ie. 'Not Found.').
# 		'data' - The data to send back to the client. If displaying a web-page, any HTML would be put here.

import mimetypes
import os
import struct
import time
import zlib
from pathlib import Path

import json
import numpy as np
clients = {}
timersReceived = {}

SEGMENTATION_MAGIC = b'MPSG'
SEGMENTATION_HEADER_BYTES = 72
SEGMENTATION_PROTOCOL_VERSION = 2
SEGMENTATION_DTYPE_UINT8 = 1
SEGMENTATION_DTYPE_FLOAT32 = 2
SEGMENTATION_LAYOUT_HWC = 3
SEGMENTATION_MODE_COLORED = 2
# Header flags (uint16 at byte 14). The browser only sets FLAG_ZLIB after this
# server advertises support, so older callbacks never receive compressed masks.
SEGMENTATION_FLAG_ZLIB = 0x0001
SEGMENTATION_SUPPORTED_FLAGS = SEGMENTATION_FLAG_ZLIB

# The WebSocket callback normally runs partway through a TouchDesigner frame,
# after the Cache TOP's newest image was captured. Move the lookup half a frame
# toward the present to compensate for that average within-frame phase.
SEGMENTATION_CACHE_PHASE_FRAMES = 0.5
SEGMENTATION_PENDING_TIMEOUT_MS = 900.0

latestSegmentationMeta = None
pendingSegmentation = None
segmentationReceiveCount = 0
segmentationDroppedUnmatched = 0

# return the response dictionary
def onHTTPRequest(webServerDAT, request, response):
	fileName = ""
	fileContent = ""
	requestArray = request['uri']
	if(requestArray == "/"):
		requestArray = "index.html"
		# print(op('/project1/vfs_web_server/virtualFile').vfs)
	importRoot = os.path.join(os.getcwd(), '_mpdist/')
	# print("requestArray: " + importRoot + requestArray)
	filePath = Path(importRoot + requestArray)
	if(filePath.exists()):
		print("Serving from file: " + request['uri'])
		# f = filePath.open("r")
		fileName = filePath.name
		fileContent = filePath.read_bytes()
	else:
		print("Serving from VFS: " + request['uri'])
		if(requestArray == "index.html"):
			requestArray = "#index.html"
		requestArray = requestArray.replace("/", "#")
		if(op('virtualFile').vfs[requestArray]):
			fileContent = op('virtualFile').vfs[requestArray]
			# print(op('/project1/vfs_web_server/virtualFile').vfs)
			fileContent = op('virtualFile').vfs[requestArray].byteArray
			fileName = op('virtualFile').vfs[requestArray].name
		else:
			me.parent().addScriptError('MediaPipe files not found. You are running the development environment. Please download release.zip from GitHub to continue with prod build, or run yarn build to generate dev files')
			print('MediaPipe files not found. You are running the development environment. Please download release.zip from GitHub to continue with prod build, or run yarn build to generate dev files')
			return
	me.parent().clearScriptErrors(recurse=False, error='MediaPipe files*')
	mimeType = mimetypes.guess_type(fileName, strict=False)
	if fileName.endswith('.js'):
		mimeType = ['application/javascript']
		
	# print("Think this file is "+str(mimeType))
	response['Content-Type'] = mimeType[0] # Might need content-type header
	response['statusCode'] = 200 # OK
	response['statusReason'] = 'OK'
	response['data'] = fileContent
	return response

def onWebSocketOpen(webServerDAT, client, uri):
	clients[client] = uri
	timersReceived[client] = 0
	print(client, uri)
	if _isSegmentationClient(client):
		# Lets the browser send zlib-compressed masks (decompressed below).
		webServerDAT.webSocketSendText(client, '{"segCapabilities":{"zlib":1}}')
	return

def onWebSocketClose(webServerDAT, client):
	global pendingSegmentation

	if pendingSegmentation is not None and pendingSegmentation['client'] == client:
		pendingSegmentation = None
	if client in clients:
		del clients[client]
	timersReceived.pop(client, None)
	return

def _isSegmentationClient(client):
	uri = str(clients.get(client, ''))
	return uri.split('?', 1)[0].rstrip('/') == '/segmentation'

def _acknowledgeTimers(webServerDAT, client):
	# The browser sends one timers message per processed frame. Echoing the
	# running count lets it see how far behind TouchDesigner is and drop stale
	# results instead of queueing them (latest-wins flow control).
	count = timersReceived.get(client, 0) + 1
	timersReceived[client] = count
	webServerDAT.webSocketSendText(client, '{"timersAck":%d}' % count)
	return

def onWebSocketReceiveText(webServerDAT, client, data):
	# Acknowledge before the play check so a paused timeline cannot leave the
	# browser's flow control waiting on acknowledgements that never arrive.
	if data.startswith('{"timers"'):
		_acknowledgeTimers(webServerDAT, client)
	if not me.time.play:
		return
	# If we receive results data, dump it directly into the relevant DAT
	# Doing this here as TD 2022.33910 is much faster processing this at the WS server than WS client
	if(data.find('handResults', 2, 100) != -1):
		op('hand_results').text = data
		return
	elif(data.find('gestureResults', 2, 100) != -1):
		op('hand_results').text = data
		return
	elif(data.find('faceLandmarkResults', 2, 150) != -1):
		op('face_landmark_results').text = data
		return
	elif(data.find('faceDetectorResults', 2, 100) != -1):
		op('face_detector_results').text = data
		return
	elif(data.find('poseResults', 2, 100) != -1):
		op('pose_results').text = data
		return
	elif(data.find('objectResults', 2, 100) != -1):
		op('object_results').text = data
		return
	elif(data.find('imageResults', 2, 100) != -1):
		op('image_results').text = data
		return
	elif(data.find('imageEmbedderResults', 2, 100) != -1):
		op('image_embedder_results').text = data
		return
	elif(data.find('timers', 2, 100) != -1):
		timerData = json.loads(data)['timers']
		timers = op('timers')
		timers.clear()
		_appendTimerChannel(timers, 'detectTime', timerData['detectTime'])
		_appendTimerChannel(timers, 'drawTime', timerData['drawTime'])
		_appendTimerChannel(timers, 'sourceFrameRate', timerData['sourceFrameRate'])
		transportData = timerData.get('segmentationTransport', {})
		segmentationEnabled = bool(transportData.get('enabled', 0))
		if not segmentationEnabled:
			# Control-socket timer messages can be older than a packet already
			# received on the dedicated segmentation socket. Never let stale
			# telemetry cancel that newer pending mask; its own timeout handles it.
			transportData = {}
		packTimeMs = (
			latestSegmentationMeta['packTimeMs']
			if segmentationEnabled and latestSegmentationMeta is not None
			else transportData.get('packTimeMs', 0)
		)
		_appendTimerChannel(timers, 'segAttempted', transportData.get('attemptedPackets', 0))
		_appendTimerChannel(timers, 'segSent', transportData.get('sentPackets', 0))
		_appendTimerChannel(timers, 'segSendErrors', transportData.get('sendErrors', 0))
		_appendTimerChannel(timers, 'segBufferedBytes', transportData.get('bufferedBytes', 0))
		_appendTimerChannel(timers, 'segPackMs', packTimeMs)
		_appendTimerChannel(timers, 'segAcknowledged', transportData.get('acknowledgedPackets', 0))
		_appendTimerChannel(timers, 'segSkippedInFlight', transportData.get('skippedInFlight', 0))
		_appendTimerChannel(timers, 'segAckTimeouts', transportData.get('ackTimeouts', 0))
		_appendTimerChannel(timers, 'segInFlight', transportData.get('inFlight', 0))
		_appendTimerChannel(timers, 'segAckRoundTripMs', transportData.get('ackRoundTripMs', 0))
		_appendTimerChannel(timers, 'segPacketBytes', transportData.get('packetBytes', 0))

		if segmentationEnabled and latestSegmentationMeta is not None:
			_writeSegmentationMetadata(timers, latestSegmentationMeta)
		else:
			for channelName in (
				'segFrame',
				'segPacketSequence',
				'segReceived',
				'segMediaTimeMs',
				'segTimestampMs',
				'segInferenceMs',
				'segPipelineMs',
				'segCacheLatencyMs',
				'segCacheOffset',
				'segReceiveFrame',
				'segWidth',
				'segHeight',
				'segChannels',
				'segDtype',
				'segMode',
				'segIsMulticlass',
				'segSyncWaitMs',
			):
				_appendTimerChannel(timers, channelName, 0)
		_writePendingSegmentationMetadata(timers)
		# Give an exact marker match priority even if control-socket traffic
		# delayed this timer message close to the pending timeout.
		_tryCommitPendingSegmentation()
		_expirePendingSegmentation()
	# If this is any other type of message, forward it to the other clients
	else:
		# print('received WS from client: ' +client)
		for key in clients.keys():
			if key != client and not _isSegmentationClient(key):
				# print('forwaring WS message to client: ' +key)
				webServerDAT.webSocketSendText(key, data)
	return

def _appendTimerChannel(chop, name, value):
	channel = chop.appendChan(name)
	channel[0] = value
	return

def _setTimerChannel(chop, name, value):
	channel = chop[name]
	if channel is None:
		channel = chop.appendChan(name)
	channel[0] = value
	return

def _writeSegmentationMetadata(timers, metadata):
	cacheLatencyMs = metadata['cacheLatencyMs']
	cacheOffset = metadata.get('cacheOffset')
	if cacheOffset is None:
		latencyFrames = cacheLatencyMs * me.time.rate / 1000.0
		# Compatibility fallback for projects without the seg_offset Script CHOP.
		cacheOffset = min(
			0.0,
			SEGMENTATION_CACHE_PHASE_FRAMES - latencyFrames,
		)
	_setTimerChannel(timers, 'segFrame', metadata['sourceFrame'])
	_setTimerChannel(timers, 'segPacketSequence', metadata['packetSequence'])
	_setTimerChannel(timers, 'segReceived', metadata['receiveCount'])
	_setTimerChannel(timers, 'segMediaTimeMs', metadata['sourceMediaTimeMs'])
	_setTimerChannel(timers, 'segTimestampMs', metadata['mediaPipeTimestampMs'])
	_setTimerChannel(timers, 'segInferenceMs', metadata['inferenceTimeMs'])
	_setTimerChannel(timers, 'segPipelineMs', metadata['pipelineTimeMs'])
	_setTimerChannel(timers, 'segCacheLatencyMs', cacheLatencyMs)
	_setTimerChannel(timers, 'segCacheOffset', cacheOffset)
	_setTimerChannel(timers, 'segReceiveFrame', metadata['receiveFrame'])
	_setTimerChannel(timers, 'segWidth', metadata['width'])
	_setTimerChannel(timers, 'segHeight', metadata['height'])
	_setTimerChannel(timers, 'segChannels', metadata['channels'])
	_setTimerChannel(timers, 'segDtype', metadata['dtype'])
	_setTimerChannel(timers, 'segMode', metadata['mode'])
	_setTimerChannel(
		timers,
		'segIsMulticlass',
		int(metadata['mode'] == SEGMENTATION_MODE_COLORED),
	)
	_setTimerChannel(timers, 'segPackMs', metadata['packTimeMs'])
	_setTimerChannel(timers, 'segSyncWaitMs', metadata.get('syncWaitMs', 0))
	return

def _writePendingSegmentationMetadata(timers):
	if pendingSegmentation is None:
		_setTimerChannel(timers, 'segPending', 0)
		_setTimerChannel(timers, 'segPendingFrame', 0)
		_setTimerChannel(timers, 'segPendingSequence', 0)
		_setTimerChannel(timers, 'segPendingAgeMs', 0)
	else:
		metadata = pendingSegmentation['metadata']
		pendingAgeMs = max(
			0,
			time.monotonic() * 1000.0 - pendingSegmentation['queuedAtMs'],
		)
		_setTimerChannel(timers, 'segPending', 1)
		_setTimerChannel(timers, 'segPendingFrame', metadata['sourceFrame'])
		_setTimerChannel(timers, 'segPendingSequence', metadata['packetSequence'])
		_setTimerChannel(timers, 'segPendingAgeMs', pendingAgeMs)
	_setTimerChannel(
		timers,
		'segDroppedUnmatched',
		segmentationDroppedUnmatched,
	)
	return

def _sendSegmentationAck(packet):
	try:
		packet['webServerDAT'].webSocketSendText(
			packet['client'],
			json.dumps({'segAck': packet['metadata']['packetSequence']}),
		)
	except Exception as error:
		debug('Failed to acknowledge MediaPipe segmentation: {}'.format(error))
	return

def _dropPendingSegmentation(sendAck):
	global pendingSegmentation, segmentationDroppedUnmatched

	packet = pendingSegmentation
	if packet is None:
		return False
	pendingSegmentation = None
	segmentationDroppedUnmatched += 1
	if sendAck:
		_sendSegmentationAck(packet)
	timers = op('timers')
	if timers is not None:
		_writePendingSegmentationMetadata(timers)
	return True

def _expirePendingSegmentation():
	if pendingSegmentation is None:
		return False
	pendingAgeMs = (
		time.monotonic() * 1000.0 - pendingSegmentation['queuedAtMs']
	)
	if pendingAgeMs < SEGMENTATION_PENDING_TIMEOUT_MS:
		return False
	return _dropPendingSegmentation(sendAck=True)

def _commitPendingSegmentation(cacheOffset=None):
	global latestSegmentationMeta, pendingSegmentation
	global segmentationReceiveCount

	packet = pendingSegmentation
	if packet is None:
		return False

	segData = op('seg_data')
	if segData is None:
		debug("MediaPipe segmentation receiver could not find op('seg_data')")
		_dropPendingSegmentation(sendAck=True)
		return False

	try:
		segData.copyNumpyArray(packet['array'])
		segmentationReceiveCount += 1
		metadata = dict(packet['metadata'])
		metadata['receiveCount'] = segmentationReceiveCount
		metadata['receiveFrame'] = int(absTime.frame)
		metadata['syncWaitMs'] = max(
			0,
			time.monotonic() * 1000.0 - packet['queuedAtMs'],
		)
		if cacheOffset is not None:
			metadata['cacheOffset'] = int(cacheOffset)

		latestSegmentationMeta = metadata
		pendingSegmentation = None
		timers = op('timers')
		if timers is not None:
			_writeSegmentationMetadata(timers, metadata)
			_writePendingSegmentationMetadata(timers)
		_sendSegmentationAck(packet)
		return True
	except Exception as error:
		debug('Failed to commit MediaPipe segmentation: {}'.format(error))
		_dropPendingSegmentation(sendAck=True)
		return False

def _tryCommitPendingSegmentation():
	if pendingSegmentation is None:
		return False

	segOffset = op('seg_offset')
	if segOffset is None:
		return _commitPendingSegmentation()

	try:
		pendingMatched = segOffset['segPendingMatched']
		pendingFrame = segOffset['segPendingFrame']
		pendingOffset = segOffset['segPendingCacheOffset']
	except Exception:
		return False
	if (
		pendingMatched is None
		or pendingFrame is None
		or pendingOffset is None
		or pendingMatched[0] < 0.5
	):
		return False

	targetFrame = pendingSegmentation['metadata']['sourceFrame'] & 0x00ffffff
	if int(pendingFrame[0]) != targetFrame:
		return False
	return _commitPendingSegmentation(int(pendingOffset[0]))

def onWebSocketReceiveBinary(webServerDAT, client, data):
	global pendingSegmentation

	if len(data) >= 4 and bytes(data[0:4]) == SEGMENTATION_MAGIC:
		if len(data) < SEGMENTATION_HEADER_BYTES:
			debug('Received truncated MediaPipe segmentation header')
			return

		try:
			(
				magic,
				version,
				dtype,
				layout,
				mode,
				height,
				width,
				channels,
				maskCount,
				flags,
				sourceFrame,
				packetSequence,
				sourceMediaTimeMs,
				mediaPipeTimestampMs,
				segmentationStartedMs,
				completedMs,
				packetReadyMs,
				browserTimeOriginMs,
			) = struct.unpack_from('<4sBBBBHHBBHII6d', data, 0)

			if (
				magic != SEGMENTATION_MAGIC
				or version != SEGMENTATION_PROTOCOL_VERSION
				or dtype not in (SEGMENTATION_DTYPE_UINT8, SEGMENTATION_DTYPE_FLOAT32)
				or layout != SEGMENTATION_LAYOUT_HWC
				or channels not in (1, 4)
				or width <= 0
				or height <= 0
				or flags & ~SEGMENTATION_SUPPORTED_FLAGS
			):
				debug('Received unsupported MediaPipe segmentation packet')
				return

			bytesPerValue = 4 if dtype == SEGMENTATION_DTYPE_FLOAT32 else 1
			expectedBytes = width * height * channels * bytesPerValue
			payload = memoryview(data)[SEGMENTATION_HEADER_BYTES:]
			if flags & SEGMENTATION_FLAG_ZLIB:
				# Lossless: yields the exact bytes the browser packed.
				payload = zlib.decompress(payload)
			if len(payload) != expectedBytes:
				debug('MediaPipe segmentation payload length does not match its header')
				return

			numpyDtype = '<f4' if dtype == SEGMENTATION_DTYPE_FLOAT32 else np.uint8
			array = np.frombuffer(payload, dtype=numpyDtype, count=width * height * channels)
			# The WebSocket callback's byte buffer is only borrowed. Keep one owned,
			# contiguous NumPy packet until its exact Web Render frame is cached.
			array = array.reshape((height, width, channels)).copy()

			packTimeMs = max(0, packetReadyMs - completedMs)
			pipelineTimeMs = max(0, completedMs - mediaPipeTimestampMs)
			fallbackCacheLatencyMs = pipelineTimeMs + packTimeMs
			receiveTimeEpochMs = time.time() * 1000.0
			sourceTimeEpochMs = browserTimeOriginMs + mediaPipeTimestampMs
			endToEndLatencyMs = receiveTimeEpochMs - sourceTimeEpochMs
			# Both clocks use the local machine's epoch. Fall back to packet-local
			# monotonic timing if the system clock changes or the value is invalid.
			if endToEndLatencyMs < 0 or endToEndLatencyMs > 10000:
				endToEndLatencyMs = fallbackCacheLatencyMs
			metadata = {
				'sourceFrame': sourceFrame,
				'packetSequence': packetSequence,
				'sourceMediaTimeMs': sourceMediaTimeMs,
				'mediaPipeTimestampMs': mediaPipeTimestampMs,
				'segmentationStartedMs': segmentationStartedMs,
				'completedMs': completedMs,
				'packetReadyMs': packetReadyMs,
				'inferenceTimeMs': max(0, completedMs - segmentationStartedMs),
				'pipelineTimeMs': pipelineTimeMs,
				'packTimeMs': packTimeMs,
				'cacheLatencyMs': endToEndLatencyMs,
				'packetReceiveFrame': int(absTime.frame),
				'width': width,
				'height': height,
				'channels': channels,
				'dtype': dtype,
				'maskCount': maskCount,
				'mode': mode,
			}
			if pendingSegmentation is not None:
				# The pending mask's frame may have reached the Web Render since the
				# last check. Commits are otherwise only attempted when a message
				# arrives, and on a slow page (many models) the next mask is often
				# the first message after that frame is displayed. Commit it if it
				# matched; otherwise prefer the newest mask and release the old one.
				if not _tryCommitPendingSegmentation():
					_dropPendingSegmentation(sendAck=True)
			pendingSegmentation = {
				'array': array,
				'metadata': metadata,
				'queuedAtMs': time.monotonic() * 1000.0,
				'webServerDAT': webServerDAT,
				'client': client,
			}
			timers = op('timers')
			if timers is not None:
				_writePendingSegmentationMetadata(timers)
			_tryCommitPendingSegmentation()
		except Exception as error:
			debug('Failed to receive MediaPipe segmentation: {}'.format(error))
			return

		# This packet is retained until seg_offset confirms that its exact browser
		# frame exists in the Cache TOP history. Do not echo the binary payload.
		return

	# Preserve the previous behavior for binary messages owned by other clients.
	webServerDAT.webSocketSendBinary(client, data)
	return

def onWebSocketReceivePing(webServerDAT, client, data):
	webServerDAT.webSocketSendPong(client, data=data)
	return

def onWebSocketReceivePong(webServerDAT, client, data):
	return

def onServerStart(webServerDAT):
	# print("Loading MIME types")
	mimetypes.add_type('application/octet-stream', 'task')
	mimetypes.add_type('application/octet-stream', 'tflite')
	print("MP server started")
	return

def onServerStop(webServerDAT):
	global pendingSegmentation
	pendingSegmentation = None
	print("MP server stopped")
	return
