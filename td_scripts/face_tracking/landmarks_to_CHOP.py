# me - this DAT
# scriptOp - the OP which is cooking

import json

# press 'Setup Parameters' in the OP to call this function to re-create the parameters.
def onSetupParameters(scriptOp):
	return

# called whenever custom pulse parameter is pushed
def onPulse(par):
	return

def onCook(scriptOp):
	scriptOp.clear()
	rawdata = json.loads(op('in1').text)
	digits = scriptOp.digits -1
	# print("digits: " +str(digits))
	# print(str(len(rawdata['faceResults']['faceLandmarks'])))

	# Check to see if we have a face
	if(len(rawdata['faceResults']) > 0 and len(rawdata['faceResults']['faceLandmarks']) > digits and rawdata['faceResults']['faceLandmarks'][digits]):

		# print(rawdata['faceResults']['faceLandmarks'])
		landmarks = rawdata['faceResults']['faceLandmarks'][digits]

		scriptOp.appendChan('x')
		scriptOp.appendChan('y')
		scriptOp.appendChan('z')
		scriptOp.numSamples = len(landmarks)

		for i in range (len(landmarks)):
			scriptOp['x'][i] = landmarks[i]['x']
			scriptOp['y'][i] = 1- landmarks[i]['y']
			scriptOp['z'][i] = landmarks[i]['z']

	else:
		# print("no face")
		return
