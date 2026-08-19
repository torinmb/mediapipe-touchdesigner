import json

import numpy as np


OPENPOSE_POINTS = (
	0, 2, 4, 5, 6, 13, 14, 17, 33, 37, 39, 58, 59, 61, 63, 66, 70,
	78, 82, 84, 87, 93, 99, 105, 107, 127, 132, 133, 136, 144, 148,
	149, 150, 152, 153, 158, 160, 168, 172, 176, 181, 195, 197, 234,
	263, 267, 269, 288, 289, 291, 293, 296, 300, 308, 312, 314, 317,
	323, 328, 334, 336, 356, 361, 362, 365, 373, 377, 378, 379, 380,
	385, 387, 397, 400, 405, 454, 468, 473,
)

FULL_FACE_SAMPLES = 478
OPENPOSE_FACE_SAMPLES = len(OPENPOSE_POINTS)

# Buffers are cached by their exact output width. Exact-sized arrays stay
# contiguous for copyNumpyArray while still avoiding per-frame allocation when
# the detected face count remains stable.
_fullBuffers = {
	FULL_FACE_SAMPLES: np.empty((3, FULL_FACE_SAMPLES), dtype=np.float32),
}
_openPoseBuffers = {
	OPENPOSE_FACE_SAMPLES: np.empty(
		(3, OPENPOSE_FACE_SAMPLES),
		dtype=np.float32,
	),
}
_emptyFull = np.zeros((3, FULL_FACE_SAMPLES), dtype=np.float32)
_emptyOpenPose = np.zeros((3, OPENPOSE_FACE_SAMPLES), dtype=np.float32)


def _getBuffer(bufferCache, sampleCount):
	buffer = bufferCache.get(sampleCount)
	if buffer is None:
		buffer = np.empty((3, sampleCount), dtype=np.float32)
		bufferCache[sampleCount] = buffer
	return buffer


def _copyOutput(landmarksChop, output):
	# copyNumpyArray does not resize a locked Script CHOP's sample allocation.
	# Set it explicitly so every column in the (channels, samples) array is used.
	landmarksChop.numSamples = output.shape[1]
	landmarksChop.copyNumpyArray(output)


def _copyEmptyOutput(landmarksChop, useOpenPose):
	_copyOutput(
		landmarksChop,
		_emptyOpenPose if useOpenPose else _emptyFull,
	)


def _copyFullLandmarks(landmarksChop, faces):
	sampleCount = sum(len(face) for face in faces)
	if sampleCount == 0:
		_copyEmptyOutput(landmarksChop, False)
		return

	output = _getBuffer(_fullBuffers, sampleCount)
	sample = 0
	for face in faces:
		for landmark in face:
			output[0, sample] = landmark['x']
			output[1, sample] = 1.0 - landmark['y']
			output[2, sample] = landmark['z']
			sample += 1

	_copyOutput(landmarksChop, output)


def _copyOpenPoseLandmarks(landmarksChop, faces):
	validFaceCount = 0
	for face in faces:
		if len(face) > OPENPOSE_POINTS[-1]:
			validFaceCount += 1

	if validFaceCount == 0:
		_copyEmptyOutput(landmarksChop, True)
		return

	sampleCount = validFaceCount * OPENPOSE_FACE_SAMPLES
	output = _getBuffer(_openPoseBuffers, sampleCount)
	sample = 0
	for face in faces:
		if len(face) <= OPENPOSE_POINTS[-1]:
			continue
		for point in OPENPOSE_POINTS:
			landmark = face[point]
			output[0, sample] = landmark['x']
			output[1, sample] = 1.0 - landmark['y']
			output[2, sample] = landmark['z']
			sample += 1

	_copyOutput(landmarksChop, output)


def onTableChange(dat):
	landmarksChop = op('landmarks')
	if landmarksChop is None:
		return

	useOpenPose = parent().par.Pointtype.eval() == 'openpose'
	if not parent().parent().par.Chops.eval() or not dat.text:
		_copyEmptyOutput(landmarksChop, useOpenPose)
		return

	try:
		rawData = json.loads(dat.text)
		faceResults = rawData.get('faceLandmarkResults') or {}
		faces = faceResults.get('faceLandmarks') or ()
		if useOpenPose:
			_copyOpenPoseLandmarks(landmarksChop, faces)
		else:
			_copyFullLandmarks(landmarksChop, faces)
	except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
		debug('Failed to convert face landmarks to CHOP: {}'.format(error))
		_copyEmptyOutput(landmarksChop, useOpenPose)
