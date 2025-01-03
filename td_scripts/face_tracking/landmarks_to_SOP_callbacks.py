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
	irisTable = op('irises'+str(scriptOp.digits))

	if(op('in1').text != "" and parent().parent().parent().par.Sops == True):
		rawdata = json.loads(op('in1').text)
		if not len(rawdata):
			return
		digits = scriptOp.parent().digits -1
		resScale = op('resolution')['ratio']
		# Check to see if we have a face
		if(len(rawdata['faceLandmarkResults']) > 0 and len(rawdata['faceLandmarkResults']['faceLandmarks']) > digits and rawdata['faceLandmarkResults']['faceLandmarks'][digits]):
			scriptOp.copy(scriptOp.inputs[0])
			# Load the relevant JSON array
			landmarks = rawdata['faceLandmarkResults']['faceLandmarks'][digits]

			# For every point we have, edit the position of the existing face points
			# Stop when we reach the irises (point 468)
			i=0
			while i<478:
				scriptOp.points[i].P = (landmarks[i]['x'], -1*(landmarks[i]['y'] * resScale)+.78, -1*landmarks[i]['z'])
				i += 1
		# 	# Right iris
			op(irisTable)[1,0] = "Right iris center"
			op(irisTable)[1,1] = landmarks[468]['x']
			op(irisTable)[1,2] = -1*(landmarks[468]['y'] * resScale)+.78
			op(irisTable)[1,3] = -1*landmarks[468]['z']
		
			op(irisTable)[2,0] = "Right iris radius"
			op(irisTable)[2,1] = abs(landmarks[469]['x'] - landmarks[471]['x']) / 2
			op(irisTable)[2,2] = abs(landmarks[470]['y'] - landmarks[472]['y']) / 2 * resScale

			op(irisTable)[3,0] = "Left iris center"
			op(irisTable)[3,1] = landmarks[473]['x']
			op(irisTable)[3,2] = -1*(landmarks[473]['y'] * resScale)+.78
			op(irisTable)[3,3] = landmarks[473]['z']

			op(irisTable)[4,0] = "Left iris radius"
			op(irisTable)[4,1] = abs(landmarks[474]['x'] - landmarks[476]['x']) / 2
			op(irisTable)[4,2] = abs(landmarks[475]['y'] - landmarks[477]['y']) / 2 * resScale

			op('replace_irises').allowCooking = True
			op('switch1').par.input = 0
		return

	# print("no face")
	i=0
	while i<478:
		scriptOp.points[i].P = (0, 0, 0)
		i += 1

	op(irisTable).clear()
	# op(irisTable).setSize(5, 4)
	op(irisTable).insertRow(["Description","x","y","z"])
	op(irisTable).appendRow(["Right iris center",0,0,0])
	op(irisTable).appendRow(["Right iris radius",0,0,0])
	op(irisTable).appendRow(["Left iris center",0,0,0])
	op(irisTable).appendRow(["Left iris radius",0,0,0])
	op('replace_irises').allowCooking = False
	op('switch1').par.input = 1
	return