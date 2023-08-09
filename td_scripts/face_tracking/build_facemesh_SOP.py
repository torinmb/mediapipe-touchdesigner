# me - this DAT
# scriptOp - the OP which is cooking

import json

triangles = []

# press 'Setup Parameters' in the OP to call this function to re-create the parameters
def onSetupParameters(scriptOp):
	page = scriptOp.appendCustomPage('Custom')
	page.appendOP('Mesh', label='Face Mesh Triangle list')
	page.appendPulse('Rebuild', label=None, order=None, replace=True)
	return

# called whenever custom pulse parameter is pushed
def onPulse(par):
	print(par)
	if(par.name == 'Rebuild'):
		# Load a set of landmark data points
		rawdata = json.loads(op('in1').text)

		# Clear the existing SOP and fill out the points
		par.owner.clear()
		landmarks = rawdata['faceLandmarkResults']['faceLandmarks'][0]

		for i in range (len(landmarks)):
			p = par.owner.appendPoint()
			p.x = landmarks[i]['x']
			p.y = 1- landmarks[i]['y']
			p.z = landmarks[i]['z']

		# Load the face mesh triangles DAT
		mesh = par.owner.par.Mesh.eval()

		for i in range(mesh.numRows):
			data = [int(mesh[i, 0]), int(mesh[i, 1]), int(mesh[i, 2])]
			triangles.append(data)

		for poly in triangles:
			pp = par.owner.appendPoly(3, closed=True, addPoints=False)
			pp[0].point = par.owner.points[poly[0]]
			pp[1].point = par.owner.points[poly[1]]
			pp[2].point = par.owner.points[poly[2]]
	return

def onCook(scriptOp):
	return