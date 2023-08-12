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
	realtimeRatio = ( scriptOp.inputs[0]['detectTime'] / 1000 ) / ( 1 / scriptOp.inputs[0]['sourceFrameRate'])
	if(realtimeRatio < 1):
		isRealtime = 1
	else:
		isRealtime = 0
	
	scriptOp.appendChan('detectTime')
	scriptOp.appendChan('sourceFrameRate')
	scriptOp.appendChan('realTimeRatio')
	scriptOp.appendChan('isRealtime')
	
	scriptOp['detectTime'][0] = scriptOp.inputs[0]['detectTime']
	scriptOp['sourceFrameRate'][0] = scriptOp.inputs[0]['sourceFrameRate']
	scriptOp['realTimeRatio'][0] = realtimeRatio
	scriptOp['isRealtime'][0] = isRealtime
	return
