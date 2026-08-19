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
import math
import os
import struct
from pathlib import Path

import json
import numpy as np
clients = {}

SEGMENTATION_MAGIC = b'MPSG'
SEGMENTATION_HEADER_BYTES = 56
SEGMENTATION_PROTOCOL_VERSION = 1
SEGMENTATION_DTYPE_UINT8 = 1
SEGMENTATION_DTYPE_FLOAT32 = 2
SEGMENTATION_LAYOUT_HWC = 3
SEGMENTATION_MODE_COLORED = 2

latestSegmentationMeta = None
segmentationReceiveCount = 0

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
	print(client, uri)
	return

def onWebSocketClose(webServerDAT, client):
	if client in clients:
		del clients[client]
	return

def _isSegmentationClient(client):
	uri = str(clients.get(client, ''))
	return uri.split('?', 1)[0].rstrip('/') == '/segmentation'

def onWebSocketReceiveText(webServerDAT, client, data):
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
			transportData = {}
		packTimeMs = transportData.get('packTimeMs', 0)
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
			_appendTimerChannel(timers, 'segFrame', latestSegmentationMeta['sourceFrame'])
			_appendTimerChannel(timers, 'segPacketSequence', latestSegmentationMeta['packetSequence'])
			_appendTimerChannel(timers, 'segReceived', latestSegmentationMeta['receiveCount'])
			_appendTimerChannel(timers, 'segMediaTimeMs', latestSegmentationMeta['sourceMediaTimeMs'])
			_appendTimerChannel(timers, 'segTimestampMs', latestSegmentationMeta['mediaPipeTimestampMs'])
			_appendTimerChannel(timers, 'segInferenceMs', latestSegmentationMeta['inferenceTimeMs'])
			_appendTimerChannel(timers, 'segPipelineMs', latestSegmentationMeta['pipelineTimeMs'])
			segCacheLatencyMs = latestSegmentationMeta['pipelineTimeMs'] + packTimeMs
			segCacheOffset = -int(math.ceil(segCacheLatencyMs * me.time.rate / 1000.0))
			_appendTimerChannel(timers, 'segCacheLatencyMs', segCacheLatencyMs)
			_appendTimerChannel(timers, 'segCacheOffset', segCacheOffset)
			_appendTimerChannel(timers, 'segReceiveFrame', latestSegmentationMeta['receiveFrame'])
			_appendTimerChannel(timers, 'segWidth', latestSegmentationMeta['width'])
			_appendTimerChannel(timers, 'segHeight', latestSegmentationMeta['height'])
			_appendTimerChannel(timers, 'segChannels', latestSegmentationMeta['channels'])
			_appendTimerChannel(timers, 'segDtype', latestSegmentationMeta['dtype'])
			_appendTimerChannel(timers, 'segMode', latestSegmentationMeta['mode'])
			_appendTimerChannel(timers, 'segIsMulticlass', int(latestSegmentationMeta['mode'] == SEGMENTATION_MODE_COLORED))
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
			):
				_appendTimerChannel(timers, channelName, 0)
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

def onWebSocketReceiveBinary(webServerDAT, client, data):
	global latestSegmentationMeta, segmentationReceiveCount

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
				_reserved,
				sourceFrame,
				packetSequence,
				sourceMediaTimeMs,
				mediaPipeTimestampMs,
				segmentationStartedMs,
				completedMs,
			) = struct.unpack_from('<4sBBBBHHBBHII4d', data, 0)

			if (
				magic != SEGMENTATION_MAGIC
				or version != SEGMENTATION_PROTOCOL_VERSION
				or dtype not in (SEGMENTATION_DTYPE_UINT8, SEGMENTATION_DTYPE_FLOAT32)
				or layout != SEGMENTATION_LAYOUT_HWC
				or channels not in (1, 4)
				or width <= 0
				or height <= 0
			):
				debug('Received unsupported MediaPipe segmentation packet')
				return

			bytesPerValue = 4 if dtype == SEGMENTATION_DTYPE_FLOAT32 else 1
			expectedBytes = width * height * channels * bytesPerValue
			payload = memoryview(data)[SEGMENTATION_HEADER_BYTES:]
			if len(payload) != expectedBytes:
				debug('MediaPipe segmentation payload length does not match its header')
				return

			segData = op('seg_data')
			if segData is None:
				debug("MediaPipe segmentation receiver could not find op('seg_data')")
				return

			numpyDtype = '<f4' if dtype == SEGMENTATION_DTYPE_FLOAT32 else np.uint8
			array = np.frombuffer(payload, dtype=numpyDtype, count=width * height * channels)
			array = array.reshape((height, width, channels))
			segData.copyNumpyArray(array)
			segmentationReceiveCount += 1

			latestSegmentationMeta = {
				'sourceFrame': sourceFrame,
				'packetSequence': packetSequence,
				'receiveCount': segmentationReceiveCount,
				'sourceMediaTimeMs': sourceMediaTimeMs,
				'mediaPipeTimestampMs': mediaPipeTimestampMs,
				'segmentationStartedMs': segmentationStartedMs,
				'completedMs': completedMs,
				'inferenceTimeMs': completedMs - segmentationStartedMs,
				'pipelineTimeMs': completedMs - mediaPipeTimestampMs,
				'receiveFrame': int(absTime.frame),
				'width': width,
				'height': height,
				'channels': channels,
				'dtype': dtype,
				'maskCount': maskCount,
				'mode': mode,
			}
			webServerDAT.webSocketSendText(
				client,
				json.dumps({'segAck': packetSequence}),
			)
		except Exception as error:
			debug('Failed to receive MediaPipe segmentation: {}'.format(error))
			return

		# This packet originated in the browser and has already been consumed by
		# seg_data. Do not echo the full mask back to the sending browser.
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
	print("MP server stopped")
	return
