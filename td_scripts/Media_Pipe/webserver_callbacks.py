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
import json
clients = {}


# return the response dictionary
def onHTTPRequest(webServerDAT, request, response):
	# get the uri from the request header
	uri = request['uri']

	# if the root is requested send back the initial website
	if uri == '/':
		response['statusCode'] = 200 # OK
		response['statusReason'] = 'OK'
		#response['data'] = op('index').text
	# if this is looking for something in the libs folder
	# check if the dat exists and if so, send back the content
	elif uri.startswith('/models/'):
		response['statusCode'] = 200 # OK
		response['statusReason'] = 'OK'
		if op(uri[1:]):
			response['data'] = op(uri[1:]).text
	# else just respond with 200/OK
	else:
		response['statusCode'] = 200 # OK
		response['statusReason'] = 'OK'
	
	return response

def onWebSocketOpen(webServerDAT, client, uri):
	clients[client] = True
	print(client, uri)
	return

def onWebSocketClose(webServerDAT, client):
	if(clients[client]):
		del clients[client]
	return

def onWebSocketReceiveText(webServerDAT, client, data):
	# If we receive results data, dump it directly into the relevant DAT
	# Doing this here as TD 2022.33910 is much faster processing this at the WS server than WS client
	if(data.find('handResults', 2, 100) != -1):
		op('hand_results').text = data
		return
	elif(data.find('gestureResults', 2, 100) != -1):
		op('hand_results').text = data
		return
	elif(data.find('faceResults', 2, 100) != -1):
		op('face_results').text = data
		return
	elif(data.find('poseResults', 2, 100) != -1):
		op('pose_results').text = data
		return
	elif(data.find('objectResults', 2, 100) != -1):
		op('object_results').text = data
		return
	elif(data.find('detectTime', 2, 100) != -1):
		# print(json.dumps(data['detectTime']))
		op('detectTime').clear()
		t = op('detectTime').appendChan('detectTime')
		t[0] = json.loads(data)['detectTime']
	# If this is any other type of message, forward it to the other clients
	else:
		# print('received WS from client: ' +client)
		for key in clients.keys():
			if key != client:
				# print('forwaring WS message to client: ' +key)
				webServerDAT.webSocketSendText(key, data)
	return

def onWebSocketReceiveBinary(webServerDAT, client, data):
	webServerDAT.webSocketSendBinary(client, data)
	return

def onWebSocketReceivePing(webServerDAT, client, data):
	webServerDAT.webSocketSendPong(client, data=data)
	return

def onWebSocketReceivePong(webServerDAT, client, data):
	return

def onServerStart(webServerDAT):
	return

def onServerStop(webServerDAT):
	return
	