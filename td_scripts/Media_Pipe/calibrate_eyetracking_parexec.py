# me - this DAT
# Parameter Execute DAT on the Media_Pipe component, watching Calibrateeyetracking.
#
# Pulsing the parameter tells the page to start its calibration. The page
# draws the calibration targets over everything, so it should already be open
# full screen on the surface being calibrated. Open that window first; the
# short delay below gives it time to appear.

import json

START_DELAY_MS = 1000

def onPulse(par):
	if par.name == 'Calibrateeyetracking':
		run(
			"op('websocket1').sendText(args[0])",
			json.dumps({'Calibrateeyetracking': 1}),
			delayMilliSeconds=START_DELAY_MS,
		)
	return

def onValueChange(par, prev):
	return
