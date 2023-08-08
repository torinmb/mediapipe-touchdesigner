# me - this DAT.
# 
# dat - the changed DAT
# rows - a list of row indices
# cols - a list of column indices
# cells - the list of cells that have changed content
# prev - the list of previous string contents of the changed cells
# 
# Make sure the corresponding toggle is enabled in the DAT Execute DAT.
# 
# If rows or columns are deleted, sizeChange will be called instead of row/col/cellChange.

import json
import urllib.parse

modelLookup = {
  "lightning": {
    "modelType": "MoveNet",
    "modelVersion": "lightning"
  },
  "thunder": {
    "modelType": "MoveNet",
    "modelVersion": "thunder"
  },
  "multipose": {
    "modelType": "MoveNet",
    "modelVersion": "multipose"
  },
  "lite": {
    "modelType": "BlazePose",
    "modelVersion": "lite"
  },
  "full": {
    "modelType": "BlazePose",
    "modelVersion": "full"
  },
  "heavy": {
    "modelType": "BlazePose",
    "modelVersion": "heavy"
  }
}

noReloadPars = ['Detectfaces', 'Detectgestures', 'Detecthands', 'Detectposes', 'Detectobjects', 'Showoverlays']

def onTableChange(dat):
	return

def onRowChange(dat, rows):
	return

def onColChange(dat, cols):
	print(cols, 'cols')
	return

def onCellChange(dat, cells, prev):
	cell = cells[0]
	data = {}
	url="http://localhost:" + dat['Mediapipeport',1] + "?"
	reloadRequired = True

	if (dat[cell.row,1] == "Webcam"):
		data = {
			'type': 'selectWebcam',
			'deviceId': str(cell)
		}
	elif dat[cell.row,1] == "Model":
		data = createModelData(str(cell))
		#data = modelLookup[str(cell)]
		#data['type'] = 'selectModel'
    
		# data = {
		# 	'type': 'selectModel',
		# 	'modelType': str(cell)
		# }
	else:
		if(dat[cell.row,0] in noReloadPars):
			print("not reloading")
			reloadRequired = False
		data = {
			str(dat[cell.row,0]) : str(cell)
		}
		# data = "{ "+dat[cell.row,0]+": "+dat[cell.row,1]+"}"
		# print(data)
	op('websocket1').sendText(json.dumps(data))
	print('data change send ws', data)
	
	datParams= {}
	for i in range(dat.numRows):
		if(dat[i,0] != "name" and dat[i,0] != "Mediapipeport"):
			datParams[str(dat[i,0])] = dat[i,1]
	finalUrl = url + urllib.parse.urlencode(datParams)
	op('current_url').text = finalUrl
	if(reloadRequired):
		op('webBrowser1').par.Address = finalUrl
	return

def createModelData(name):
	data = modelLookup[name]
	data['type'] = 'selectModel'
	return data
	

def onSizeChange(dat):
	return
	