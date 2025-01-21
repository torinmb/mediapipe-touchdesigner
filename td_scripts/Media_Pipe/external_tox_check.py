# me - this DAT
# 
# frame - the current frame
# state - True if the timeline is paused
# 
# Make sure the corresponding toggle is enabled in the Execute DAT.
import os

def onStart():
	return

def dialogChoice(choice):
	if(choice['button'] == "Help"):
		a = ui.viewFile('https://github.com/torinmb/mediapipe-touchdesigner/blob/canonical-face-mapping/external_tox.md')
	return

def onCreate():
	current_dir_path = os.path.join(os.getcwd(), "MediaPipe.tox")
	toxes_dir_path = os.path.join(os.getcwd(), "toxes", "MediaPipe.tox")

	currentState = parent().par.enableexternaltox
	if currentState==False:
		# Check if the file exists at either location
		if os.path.exists(current_dir_path):
			run("parent().par.enableexternaltox = True", delayFrames=1)
		elif os.path.exists(toxes_dir_path):
			run("parent().par.enableexternaltox = True", delayFrames=1)
		else:
			op.TDResources.PopDialog.OpenDefault(
				text='Check "Enable External tox" toggle to keep save times fast',
				title='Externalise MediaPipe tox',
				buttons=['Close', 'Help'],
				callback=dialogChoice,
				details='',
				textEntry=False,
				escButton=1,
				enterButton=1,
				escOnClickAway=False
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

	