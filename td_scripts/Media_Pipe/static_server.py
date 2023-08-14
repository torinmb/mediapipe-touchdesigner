import asyncio
import os
import http.server
import socketserver

class CustomRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        self.directory = directory or os.path.join(os.getcwd(), 'dist/')
        print('directory', self.directory)
        super().__init__(*args, directory=self.directory, **kwargs)
	
# class CustomRequestHandler(http.server.SimpleHTTPRequestHandler):
#     def __init__(self, *args, **kwargs):
#         self.directory = os.path.join(os.getcwd(), 'dist/')
#         print('directory', self.directory)
#         super().__init__(*args, **kwargs)
#     def translate_path(self, path):
#         path = super().translate_path(path)
#         return os.path.join(self.directory, os.path.relpath(path, os.path.curdir))

# Define the port and handler
PORT = int(parent().par.Mediapipeport)
Handler = CustomRequestHandler



def start_server():
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print(f"Serving on port {PORT}")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"Port {PORT} is already in use.")
        else:
            print(f"Error starting server: {e}")
            
async def startServer():
	loop = asyncio.get_event_loop()
	# Arrange for func to be called in the specified executor. 
	r = await loop.run_in_executor(None, start_server)

started = False

def startup():
	global started
	if not started:
		op('webBrowser1').par.Address = op('current_url').text
		coroutines = [startServer()]
		op.TDAsyncIO.Run(coroutines)
		op('setup_menu_names').run()
		run('parent().par.Reset.pulse()', delayFrames=5)
		
	started = True
	return

def onStart():
	startup()
	return

def onCreate():
	startup()
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
