# me - this DAT
# scriptOp - the OP which is cooking

import json

# press 'Setup Parameters' in the OP to call this function to re-create the parameters
def onSetupParameters(scriptOp):
	scriptOp.clear()
	scriptOp.copy(scriptOp.inputs[0])
	return

# called whenever custom pulse parameter is pushed
def onPulse(par):
	# Load the SOP from the first input (this is hopefully our 478 point face mesh!)
	if par.name == 'Load':
		scriptOp.clear()
		scriptOp.copy(scriptOp.inputs[0])
	return

def onCook(scriptOp):
	scriptOp.clear()
	if(op('in1').text != ""):
		rawdata = json.loads(op('in1').text)
		if not len(rawdata):
			return
		digits = scriptOp.digits -1
		resScale = op('resolution')['height']/op('resolution')['width']
		# Check to see if we have a face
		if(len(rawdata['faceLandmarkResults']) > 0 and len(rawdata['faceLandmarkResults']['faceLandmarks']) > digits and rawdata['faceLandmarkResults']['faceLandmarks'][digits]):
			scriptOp.copy(scriptOp.inputs[0])
			# Load the relevant JSON array
			landmarks = rawdata['faceLandmarkResults']['faceLandmarks'][digits]

			# For every point we have, edit the position of the existing face points
			i=0
			for eachPoint in scriptOp.points:
				eachPoint.P = (landmarks[i]['x'], -1*(landmarks[i]['y'] * resScale)+.78, landmarks[i]['z'])
				i += 1
		else:
			# print("no face")
			return