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
	return

def onCreate():
	webServerDAT = op('webserver1')
	webServerDAT.par.active = 0
	thisPort = get_free_port()
	print('Using port ' + str(thisPort))
	webServerDAT.par.port = thisPort
	webServerDAT.par.active = 1
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

	