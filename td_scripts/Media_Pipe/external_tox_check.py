# me - this DAT
# 
# frame - the current frame
# state - True if the timeline is paused
# 
# Make sure the corresponding toggle is enabled in the Execute DAT.

def onStart():
	return

def dialogChoice(choice):
	if(choice['button'] == "Help"):
		a = ui.viewFile('https://github.com/torinmb/mediapipe-touchdesigner/blob/canonical-face-mapping/external_tox.md')
	return

def onCreate():
	currentState = parent().par.enableexternaltox
	if currentState==False:
		op.TDResources.PopDialog.OpenDefault(
			text='Check "Enable External tox" toggle to keep save times fast',
			title='Externalise MediaPipe tox',
			buttons=['Close', 'Help'],
			callback=dialogChoice,
			details='',
			textEntry=False,
			escButton=1,
			enterButton=1,
			escOnClickAway=True
		)
	return

def onExit():
	return

def onFrameStart(frame):
	return

def onFrameEnd(frame):
	return

def onPlayStateChange(state):
	return

def onDeviceChange():
	return

def onProjectPreSave():
	return

def onProjectPostSave():
	return

	