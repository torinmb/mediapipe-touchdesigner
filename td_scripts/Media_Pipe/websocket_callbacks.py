# me - this DAT
# dat - the WebSocket DAT

createModelData = mod('par_change_handler').createModelData

def find_matching_camera(old_cameras, new_cameras, key):
    old_camera_name = None

    # Find the name of the camera in the old cameras list
    for camera in old_cameras:
        if camera['deviceId'] == key:
            old_camera_name = camera['label']
            break

    # If the key is not found in the old cameras list
    if old_camera_name is None:
        return None

    # Search for the camera name in the new cameras list
    for camera in new_cameras:
        if camera['label'] == old_camera_name:
            # Return the deviceId of the matching camera
            return camera['deviceId']

    # If no matching camera is found in the new cameras list
    return None

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
			newData = json.dumps(data['devices'])
			prevData = json.loads(op('prev_camera_options').text)
			oldCamData = prevData
			newCamData = data['devices']
			match = find_matching_camera(oldCamData, newCamData, parent().par.Webcam)
			print('oldCamData', oldCamData, 'newCam', newCamData)
			if match:
				print('MATCH', match)
				camData = {
					'type': 'selectWebcam',
					'deviceId': match
				}
				dat.sendText(json.dumps(camData))
			modelData = createModelData(parent().par.Model.menuNames[parent().par.Model])
			dat.sendText(json.dumps(modelData))
			op('prev_camera_options').text = op('camera_options').text
			op('camera_options').text = json.dumps(data['devices'])
		
		# elif 'detectTime' in data:
		# 	# print(json.dumps(data['detectTime']))
		# 	op('detectTime').clear()
		# 	t = op('detectTime').appendChan('detectTime')
		# 	t[0] = json.dumps(data['detectTime'])
			
		# Not extracting the data here, as the WS client in TD 2022.33910 is too slow (5-6ms)
		# It's much to extract this at WS server than WS client, so check there for it
		# elif 'faceResults' in data:
		#	op('face_results').text = message
		# elif 'poseResults' in data:
		#	op('pose_results').text = message
		# elif 'handResults' in data:
		#	op('hand_results').text = message
		# op('pose_data').text = message

	except Exception as e:
		return
		#print("Error processing JSON: ", e)
		
	# keypoints = data[0]['keypoints']
	# xPoses = ['x']
	# yPoses = ['y']
	# names = ['name']
	# alpha = ['alpha']
	# scores = ['score']
	# for point in keypoints:
	# 	xPoses.append(point['x'])
	# 	yPoses.append(point['y'])
	# 	names.append(point['name'])
	# 	scores.append(point['score'])
	# 	if point['score'] > op('pose_threshold')['threshold']:
	# 		alpha.append(1)
	# 	else:
	# 		alpha.append(0)
	# table = op('pose_table')
	# table.replaceRow('x', xPoses, entireRow=True)
	# table.replaceRow('y', yPoses, entireRow=True)
	# table.replaceRow('alpha', alpha, entireRow=True)
	# table.replaceRow('name', names, entireRow=True)
	# table.replaceRow('score', scores, entireRow=True)
	
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

	