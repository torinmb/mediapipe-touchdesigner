import mimetypes
import os
from pathlib import Path
import shutil

# me - this DAT.
# webServerDAT - the connected Web Server DAT
# request - A dictionary of the request fields. The dictionary will always contain the below entries, plus any additional entries dependent on the contents of the request
# 		'method' - The HTTP method of the request (ie. 'GET', 'PUT').
# 		'uri' - The client's requested URI path. If there are parameters in the URI then they will be located under the 'pars' key in the request dictionary.
#		'pars' - The query parameters.
# 		'clientAddress' - The client's address.
# 		'serverAddress' - The server's address.
# 		'data' - The data of the HTTP request.
# response - A dictionary defining the response, to be filled in during the request method. Additional fields not specified below can be added (eg. response['content-type'] = 'application/json').
# 		'statusCode' - A valid HTTP status code integer (ie. 200, 401, 404). Default is 404.
# 		'statusReason' - The reason for the above status code being returned (ie. 'Not Found.').
# 		'data' - The data to send back to the client. If displaying a web-page, any HTML would be put here.

# return the response dictionary
def onHTTPRequest(webServerDAT, request, response):
	fileName = ""
	fileContent = ""
	requestArray = request['uri']
	if(requestArray == "/"):
		requestArray = "index.html"
		# print(op('/project1/vfs_web_server/virtualFile').vfs)
	importRoot = os.path.join(os.getcwd(), '_mpdist/')
	# print("Path: " + importRoot + requestArray)
	filePath = Path(importRoot + requestArray)
	if(filePath.exists()):
		print("Serving from file: " + request['uri'])
		# f = filePath.open("r")
		fileName = filePath.name
		fileContent = filePath.read_bytes()
	else:
		print("Serving from VFS: " + request['uri'])
		if(requestArray == "index.html"):
			requestArray = "#index.html"
		requestArray = requestArray.replace("/", "#")
		# print(op('/project1/vfs_web_server/virtualFile').vfs)
		fileContent = op('virtualFile').vfs[requestArray].byteArray
		fileName = op('virtualFile').vfs[requestArray].name
	mimeType = mimetypes.guess_type(fileName, strict=True)
	# print("Think this file is "+str(mimeType))
	response['Content-Type'] = mimeType[0] # Might need content-type header
	response['statusCode'] = 200 # OK
	response['statusReason'] = 'OK'
	response['data'] = fileContent
	return response

def onWebSocketOpen(webServerDAT, client, uri):
	return

def onWebSocketClose(webServerDAT, client):
	return

def onWebSocketReceiveText(webServerDAT, client, data):
	webServerDAT.webSocketSendText(client, data)
	return

def onWebSocketReceiveBinary(webServerDAT, client, data):
	webServerDAT.webSocketSendBinary(client, data)
	return

def onWebSocketReceivePing(webServerDAT, client, data):
	webServerDAT.webSocketSendPong(client, data=data);
	return

def onWebSocketReceivePong(webServerDAT, client, data):
	return

def onServerStart(webServerDAT):
	# print("Loading MIME types")
	mimetypes.add_type('application/octet-stream', 'task')
	mimetypes.add_type('application/octet-stream', 'tflite')
	importRoot = os.path.join(os.getcwd(), '_mpdist')
	print("Checking for new files at: " + importRoot)

	if(os.path.exists(importRoot)):
		print("Importing files from: " + importRoot)
		vfsOp = op('virtualFile')
		vfiles = []

		print("Found " + str(len(vfsOp.vfs)) + " virtual files")

		# Get all the virtual files
		for f in vfsOp.vfs:
			print(f.name)
			vfiles.append(f.name)

		# Delete all the virtual files
		# # (don't do this as you iterate above, it doesn't work in TD 2022.33910 )
		for v in vfiles:
			vfsOp.vfs[v].destroy()

		for filename in Path(importRoot).rglob('*'):
			if (filename.is_file()):
				file_path = filename.relative_to(importRoot)
				vfsFilename = "#".join(file_path.parts)
				print("Importing: "+ vfsFilename)
				vfsOp.vfs.addFile(filename, overrideName="#"+vfsFilename)
		# if(parent().saveExternalTox(recurse=False)):
			# print("Saved tox")
		try:
			shutil.rmtree(importRoot)
			print(importRoot + " removed successfully")
		except OSError as o:
			print(f"Error, {o.strerror}: {importRoot}")
	print("MP server started")
	return

def onServerStop(webServerDAT):
	return
	