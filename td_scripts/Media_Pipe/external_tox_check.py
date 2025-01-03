# me - this DAT
# 
# frame - the current frame
# state - True if the timeline is paused
# 
# Make sure the corresponding toggle is enabled in the Execute DAT.

def onStart():
	return

def dialogChoice(non):
	return

def onCreate():
	currentState = parent().par.enableexternaltox
	if currentState==False:
		op.TDResources.PopDialog.OpenDefault(
			text='Check "Enable External tox" toggle to keep save times fast',
			title='Externalise MediaPipe tox',
			buttons=['OK'],
			callback=dialogChoice,
			details='',
			textEntry=False,
			escButton=1,
			enterButton=1,
			escOnClickAway=True
		)
		# The MediaPipe tox is very large (500MB+) to keep toe file saves fast and small, it is strongly suggested that you externalise the MediaPipe tox. Would you like to do that now?
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

	