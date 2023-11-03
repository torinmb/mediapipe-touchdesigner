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

# noReloadPars = ['Webcam', 'Showoverlays']
noReloadPars = ['Webcam', 'Wflip', 'Autoport', 'Showoverlays', 'Detectfacelandmarks', 'Detectfaces', 'Detectgestures', 'Detecthands', 'Detectposes', 'Detectobjects', 'Detectimages', 'Detectsegments']
parent().par.Reset.pulse()


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
	if(str(dat[cell.row,0]).startswith("Scolor")):
		reloadRequired = False
	elif(dat[cell.row,0] in noReloadPars):
		print("not reloading")
		reloadRequired = False
	else:
		reloadRequired = True

	if dat[cell.row,0] == "Autoport":
		if(dat[cell.row,1] == 1):
			parent().par.Mediapipeport.readOnly = 1
			op('init_port').par.startpulse.pulse()
		else:
			parent().par.Mediapipeport.readOnly = 0
	if dat[cell.row,0] == "Model":
		data = createModelData(str(cell))
	else:
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
	op('webBrowser1').allowCooking = 1
	return

def createModelData(name):
	data = modelLookup[name]
	data['type'] = 'selectModel'
	return data
	

def onSizeChange(dat):
	return
	