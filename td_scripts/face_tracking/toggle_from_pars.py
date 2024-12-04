# me - this DAT
# par - the Par object that has changed
# val - the current value
# prev - the previous value
# 
# Make sure the corresponding toggle is enabled in the Parameter Execute DAT.

def onValueChange(par, prev):
	# use par.eval() to get current value
	return

# Called at end of frame with complete list of individual parameter changes.
# The changes are a list of named tuples, where each tuple is (Par, previous value)
def onValuesChanged(changes):
	for c in changes:
		# use par.eval() to get current value
		par = c.par
		if(par.name == "Chops"):
			if(par == False):
				op('point_render1').allowCooking = False
				parent().par.Points = 0
			op('Extract_CHOPs').allowCooking = par
		elif (par.name == "Points"):
			if(par == True):
				op('Extract_CHOPs').allowCooking = True
				parent().par.Chops = 1
			op('point_render1').allowCooking = par
		elif(par.name == "Sops"):
			op('Build_SOPs').allowCooking = par
		elif(par.name == "Blendshapes"):
			op('Extract_BlendShapes').allowCooking = par
		elif(par.name == "Transformationmatricies"):
			op('Extract_Transformation_Matrix').allowCooking = par
	return

def onPulse(par):
	return

def onExpressionChange(par, val, prev):
	return

def onExportChange(par, val, prev):
	return

def onEnableChange(par, val, prev):
	return

def onModeChange(par, val, prev):
	return
	