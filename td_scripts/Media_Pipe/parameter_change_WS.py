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
	if cell.row == 1:
		data = {
			'type': 'selectWebcam',
			'deviceId': str(cell)
		}
	elif cell.row == 2:
		data = createModelData(str(cell))
		#data = modelLookup[str(cell)]
		#data['type'] = 'selectModel'
    
		# data = {
		# 	'type': 'selectModel',
		# 	'modelType': str(cell)
		# }
	else:
		data = {
			str(dat[cell.row,0]) : str(cell)
		}
		# data = "{ "+dat[cell.row,0]+": "+dat[cell.row,1]+"}"
		# print(data)
	op('websocket1').sendText(json.dumps(data))
	print('data change send ws', data)
	return

def createModelData(name):
	data = modelLookup[name]
	data['type'] = 'selectModel'
	return data
	

def onSizeChange(dat):
	return
	