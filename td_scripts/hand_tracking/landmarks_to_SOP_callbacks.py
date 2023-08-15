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
		digits = scriptOp.digits -1

		# Check to see if we have a face
		if('gestureResults' in rawdata and len(rawdata['gestureResults']['landmarks']) > digits and rawdata['gestureResults']['landmarks'][digits]):
			scriptOp.copy(scriptOp.inputs[0])
			# Load the relevant JSON array
			landmarks = rawdata['gestureResults']['landmarks'][digits]

			# For every point we have, edit the position of the existing face points
			i=0
			for eachPoint in scriptOp.points:
				eachPoint.P = (landmarks[i]['x'], 1- landmarks[i]['y'], landmarks[i]['z'])
				i += 1
		else:
			# print("no hands")
			return