# me - this DAT
# scriptOp - the OP which is cooking

from collections import deque


FRAME_MARKER_MASK = 0x00ffffff
FRAME_MARKER_HALF_RANGE = 0x00800000
MAX_CACHE_HISTORY = 4096

# One marker is appended per absolute TouchDesigner frame in which this Script
# CHOP cooks. With a Cache TOP using Active, Step Size 1, and Always Cook, these
# entries have the same ordering as its cached images: the newest marker is
# index 0, the previous marker is -1, etc.
_markerHistory = deque(maxlen=MAX_CACHE_HISTORY)
_lastMarkerFrame = None
_lastSegReceived = None
_lastCookAbsFrame = None


def onSetupParameters(scriptOp):
	return


def onPulse(par):
	return


def _channelValue(chop, name, default=0):
	channel = chop[name]
	return channel[0] if channel is not None else default


def _normalizedToByte(value):
	return max(0, min(255, int(float(value) * 255.0 + 0.5)))


def _decodeFrameMarker(rgbChop):
	red = _normalizedToByte(_channelValue(rgbChop, 'r'))
	green = _normalizedToByte(_channelValue(rgbChop, 'g'))
	blue = _normalizedToByte(_channelValue(rgbChop, 'b'))
	return red | (green << 8) | (blue << 16)


def _appendMarker(markerFrame):
	global _lastMarkerFrame

	if _lastMarkerFrame is not None:
		forwardDelta = (markerFrame - _lastMarkerFrame) & FRAME_MARKER_MASK
		# A delta in the upper half of the 24-bit range is a backward jump,
		# normally caused by reloading the browser. Do not match new packets
		# against cache history from the previous browser session.
		if forwardDelta >= FRAME_MARKER_HALF_RANGE:
			_markerHistory.clear()

	_markerHistory.append(markerFrame)
	_lastMarkerFrame = markerFrame


def _findCacheOffset(targetFrame):
	for age, markerFrame in enumerate(reversed(_markerHistory)):
		if markerFrame == targetFrame:
			return -age
	return None


def _writeChannel(scriptOp, name, value):
	channel = scriptOp.appendChan(name)
	channel[0] = value


def onCook(scriptOp):
	global _lastMarkerFrame, _lastSegReceived, _lastCookAbsFrame

	scriptOp.clear()
	if len(scriptOp.inputs) < 2:
		_writeChannel(scriptOp, 'segCacheOffset', 0)
		_writeChannel(scriptOp, 'segCacheMatched', 0)
		_writeChannel(scriptOp, 'segMarkerFrame', 0)
		_writeChannel(scriptOp, 'segPendingFrame', 0)
		_writeChannel(scriptOp, 'segPendingCacheOffset', 0)
		_writeChannel(scriptOp, 'segPendingMatched', 0)
		return

	rgbChop = scriptOp.inputs[0]
	timers = scriptOp.inputs[1]
	markerFrame = _decodeFrameMarker(rgbChop)

	segReceived = int(_channelValue(timers, 'segReceived', 0))
	if _lastSegReceived is not None and segReceived < _lastSegReceived:
		_markerHistory.clear()
		_lastMarkerFrame = None
	_lastSegReceived = segReceived

	currentCookAbsFrame = int(absTime.frame)
	if currentCookAbsFrame != _lastCookAbsFrame:
		_appendMarker(markerFrame)
		_lastCookAbsFrame = currentCookAbsFrame

	pendingAvailable = int(_channelValue(timers, 'segPending', 0)) > 0
	pendingFrame = (
		int(_channelValue(timers, 'segPendingFrame', 0))
		& FRAME_MARKER_MASK
	)
	pendingCacheOffset = (
		_findCacheOffset(pendingFrame) if pendingAvailable else None
	)
	pendingMatched = pendingCacheOffset is not None

	targetFrame = int(_channelValue(timers, 'segFrame', 0)) & FRAME_MARKER_MASK
	cacheOffset = _findCacheOffset(targetFrame) if segReceived > 0 else None
	matched = cacheOffset is not None

	if not matched:
		# Never pair a newly published mask with a guessed webcam frame. The Web
		# Server keeps new masks pending until pendingMatched becomes true.
		cacheOffset = 0

	_writeChannel(scriptOp, 'segCacheOffset', cacheOffset)
	_writeChannel(scriptOp, 'segCacheMatched', int(matched))
	_writeChannel(scriptOp, 'segMarkerFrame', markerFrame)
	_writeChannel(scriptOp, 'segPendingFrame', pendingFrame)
	_writeChannel(
		scriptOp,
		'segPendingCacheOffset',
		pendingCacheOffset if pendingMatched else 0,
	)
	_writeChannel(scriptOp, 'segPendingMatched', int(pendingMatched))
	return
