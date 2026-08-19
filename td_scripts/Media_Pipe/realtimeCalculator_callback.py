# me - this DAT
# scriptOp - the OP which is cooking

# press 'Setup Parameters' in the OP to call this function to re-create the parameters.
def onSetupParameters(scriptOp):
	return

# called whenever custom pulse parameter is pushed
def onPulse(par):
	return

def onCook(scriptOp):
	scriptOp.clear()
	inputChop = scriptOp.inputs[0]
	detectTime = inputChop['detectTime']
	drawTime = inputChop['drawTime']
	sourceFrameRate = inputChop['sourceFrameRate']
	realtimeRatio = ( ( detectTime + drawTime ) / 1000 ) / ( 1 / sourceFrameRate )
	totalInToOutDelay = -3 - (((detectTime + drawTime) / 1000) * project.cookRate)

	if(realtimeRatio < 1):
		isRealtime = 1
	else:
		isRealtime = 0
	
	scriptOp.appendChan('detectTime')
	scriptOp.appendChan('drawTime')
	scriptOp.appendChan('sourceFrameRate')
	scriptOp.appendChan('realTimeRatio')
	scriptOp.appendChan('totalInToOutDelay')
	scriptOp.appendChan('isRealtime')
	
	scriptOp['detectTime'][0] = detectTime
	scriptOp['drawTime'][0] = drawTime
	scriptOp['sourceFrameRate'][0] = sourceFrameRate
	scriptOp['realTimeRatio'][0] = realtimeRatio
	scriptOp['totalInToOutDelay'][0] = totalInToOutDelay
	scriptOp['isRealtime'][0] = isRealtime

	# Pass through segmentation packet metadata when it is available.
	availableChannels = {channel.name for channel in inputChop.chans()}
	segmentationChannels = (
		'segFrame',
		'segPacketSequence',
		'segReceived',
		'segMediaTimeMs',
		'segTimestampMs',
		'segInferenceMs',
		'segPipelineMs',
		'segCacheLatencyMs',
		'segCacheOffset',
		'segReceiveFrame',
		'segWidth',
		'segHeight',
		'segChannels',
		'segDtype',
		'segMode',
		'segIsMulticlass',
		'segAttempted',
		'segSent',
		'segSendErrors',
		'segBufferedBytes',
		'segPackMs',
	)
	for channelName in segmentationChannels:
		if channelName in availableChannels:
			scriptOp.appendChan(channelName)
			scriptOp[channelName][0] = inputChop[channelName][0]
	return
