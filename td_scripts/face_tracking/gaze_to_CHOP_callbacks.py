# me - this DAT
# scriptOp - the OP which is cooking
#
# Gaze channels from the face landmark results. Same wiring as
# blendshapes_to_CHOP_callbacks.py: in1 is the face_landmark_results DAT.
# u, v are viewport UV (origin bottom-left, 0..1 across the calibrated surface).
# setupChanged is 1 when the camera or page aspect differs from calibration time.
# valid is 0 during blinks / no face, calibrated is 0 until a calibration exists.

import json

CHANNELS = ['u', 'v', 'rawU', 'rawV', 'valid', 'onScreen', 'calibrated', 'setupChanged']

def onCook(scriptOp):
	scriptOp.clear()
	scriptOp.numSamples = 1
	gaze = {}
	if op('in1').text != "":
		try:
			gaze = json.loads(op('in1').text)['faceLandmarkResults'].get('gaze', {})
		except Exception:
			gaze = {}
	for name in CHANNELS:
		scriptOp.appendChan(name)[0] = gaze.get(name, 0)
	return
