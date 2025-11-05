# me - this DAT
# 
# frame - the current frame
# state - True if the timeline is paused
# 
# Make sure the corresponding toggle is enabled in the Execute DAT.

def get_free_port():
    import socket
    sock = socket.socket()
    sock.bind(('', 0))
    free_port = sock.getsockname()[1]
    sock.close()
    return free_port

def onStart():

	if parent().par.Autoport:
		start()
	return

def onCreate():
	start()
	return
	
def start():
	webServerDAT = op('webserver1')
	webServerDAT.par.active = 0
	thisPort = get_free_port()
	print('Using port ' + str(thisPort))
	webServerDAT.par.port = thisPort
	webServerDAT.par.active = 1
	try:
		op('webBrowser1/webrender1').par.dpiscale = 1
	except:
		pass	
	# webServerDAT.par.restart.pulse()
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

	