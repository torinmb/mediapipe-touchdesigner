# me - this DAT
# dat - the WebSocket DAT

createModelData = mod('par_change_handler').createModelData

import json

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
		if 'type' in data:
			op('webcam_list').text = json.dumps(data['devices'])

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

	