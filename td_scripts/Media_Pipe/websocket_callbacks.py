# me - this DAT
# dat - the WebSocket DAT

createModelData = mod('par_change_handler').createModelData

import json
import os

# The page sends its fitted calibration once, when calibration finishes. Keep it
# in a file next to the project (survives component swaps, easy to copy to
# another machine) and in component storage as a fallback.
GAZE_FILE = 'gaze_calibration.json'

def _saveGazeCalibration(model):
	me.parent().store('gazeCalibration', model)
	try:
		with open(os.path.join(project.folder, GAZE_FILE), 'w') as f:
			json.dump(model, f)
	except Exception as e:
		print('Could not write {}: {}'.format(GAZE_FILE, e))
	print('Eye tracking calibration saved ({} samples, error {:.1%} of the screen)'.format(
		model.get('samples', 0), model.get('cvError', 0)))

def _loadGazeCalibration():
	try:
		with open(os.path.join(project.folder, GAZE_FILE)) as f:
			return json.load(f)
	except Exception:
		return me.parent().fetch('gazeCalibration', None)

def onConnect(dat):
	print('connected')
	return

# me - this DAT
# dat - the WebSocket DAT

def onDisconnect(dat):
	print('disconnected')
	return

# me - this DAT
# dat - the DAT that received a message
# rowIndex - the row number the message was placed into
# message - a unicode representation of the text
# 
# Only text frame messages will be handled in this function.

def onReceiveText(dat, rowIndex, message):
	if(message == 'ping'):
		dat.sendText('pong')
		return
	if not message:
		return

	try:
		data = json.loads(message)
		if 'gazeCalibration' in data:
			_saveGazeCalibration(data['gazeCalibration'])
			return
		if 'gazeRequestCalibration' in data:
			# The page asks on every load; reply with the saved calibration.
			saved = _loadGazeCalibration()
			if saved is not None:
				dat.sendText(json.dumps({'Gazecalibration': saved}))
			return
		if 'type' in data:
			op('webcam_list').text = json.dumps(data['devices'])
		
		if 'error' in data:
			if (data['error'] == 'webcamStartFail'):
				print('Webcam failed to start. Is it being used somewhere else? Input must also be capable of 720p, 8 bit. Component reloading')
				op('webBrowser1').allowCooking = False
				op('webBrowser1').par.Address = op('current_url').text
				run("me.parent().op('webBrowser1').allowCooking = True", delayMilliSeconds = 3000)
				me.parent().addScriptError('Webcam failed to start. Is it being used somewhere else? Input must also be capable of 720p, 8 bit. Component reloading')
		if 'success' in data:
			me.parent().clearScriptErrors(recurse=False, error='Webcam failed*')
			if 'frameRate' in data:
				requested = data.get('requestedFrameRate', 0)
				actual = data['frameRate']
				print('Webcam started at {}x{} {:g} FPS (requested {:g} FPS)'.format(
					data.get('width', 0), data.get('height', 0), actual, requested))
				# Same 2% slack as the browser: 59.94 counts as 60.
				if actual and requested and actual < requested * 0.98:
					print('Webcam cannot run at {:g} FPS; using {:g} FPS instead'.format(requested, actual))

	except Exception as e:
		return
		#print("Error processing JSON: ", e)
	
	return


# me - this DAT
# dat - the DAT that received a message
# contents - a byte array of the message contents
# 
# Only binary frame messages will be handled in this function.

def onReceiveBinary(dat, contents):
	return

# me - this DAT
# dat - the DAT that received a message
# contents - a byte array of the message contents
# 
# Only ping messages will be handled in this function.

def onReceivePing(dat, contents):
	dat.sendPong(contents) # send a reply with same message
	print('ping', contents)
	return

# me - this DAT
# dat - the DAT that received a message
# contents - a byte array of the message content
# 
# Only pong messages will be handled in this function.

def onReceivePong(dat, contents):
	return


# me - this DAT
# dat - the DAT that received a message
# message - a unicode representation of the message
#
# Use this method to monitor the websocket status messages

def onMonitorMessage(dat, message):
	return

	