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
	if par.name == 'Load':
		scriptOp.clear()
		scriptOp.copy(scriptOp.inputs[0])
	return

def onCook(scriptOp):
	rawdata = json.loads(op('in1').text)
	digits = scriptOp.digits -1

	# Check to see if we have a face
	if(len(rawdata['faceResults']) > 0 and len(rawdata['faceResults']['faceLandmarks']) > digits and rawdata['faceResults']['faceLandmarks'][digits]):

		# Load the relevant JSON array
		landmarks = rawdata['faceResults']['faceLandmarks'][digits]

		# For every point we have, edit the position of the existing face points
		i=0
		for eachPoint in scriptOp.points:
			eachPoint.P = (landmarks[i]['x'], 1- landmarks[i]['y'], landmarks[i]['z'])
			i += 1
	else:
		# print("no face")
		return