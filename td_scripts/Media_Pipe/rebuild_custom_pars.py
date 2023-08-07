op = me.parent()

# Faces
customPageList = op.customPages
for i in range(len(customPageList)):
	if(customPageList[i] == "Faces"):
		op.customPages[i].destroy()

facePage = op.appendCustomPage('Faces')

## numFaces
p = facePage.appendInt("Fnumfaces", label="Num Faces", size=1, order=None, replace=True)
p.normMin  = 1
p.min  = 1
p.clampMin = True

p.normMax = 3

p.default = 1
p.val = 1

## BlendShapes
p = facePage.appendToggle("Fblendshapes", label="Output Blend Shapes", order=None, replace=True)
p.default = 1
p.val = 1

## TransMatrix
p = facePage.appendToggle("Ftransmtrx", label="Output Transformation Matricies", order=None, replace=True)
p.default = 1
p.val = 1

## Minimum Detection Confidence
p = facePage.appendFloat("Fdetectconf", label="Min Detection Confidence", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

## Minimum Presence Confidence
p = facePage.appendFloat("Fpresconf", label="Min Presence Confidence", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

## Minimum Tracking Confidence
p = facePage.appendFloat("Ftrackconf", label="Min Tracking Confidence", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

p.default = 0.5
p.val = 0.5

## Sort
facePage.sort("Fnumfaces", "Fblendshapes", "Ftransmtrx", "Fdetectconf", "Fpresconf", "Ftrackconf" )

# Hands
customPageList = op.customPages
for i in range(len(customPageList)):
	if(customPageList[i] == "Hands"):
		op.customPages[i].destroy()
handPage = op.appendCustomPage('Hands')
## numFaces
p = handPage.appendInt("Hnumhands", label="Num Hands", size=1, order=None, replace=True)
p.normMin  = 1
p.min  = 1
p.clampMin = True

p.normMax = 2

p.default = 2
p.val = 2

## Minimum Detection Confidence
p = handPage.appendFloat("Hdetectconf", label="Min Detection Confidence", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

## Minimum Presence Confidence
p = handPage.appendFloat("Hpresconf", label="Min Presence Confidence", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

## Minimum Tracking Confidence
p = handPage.appendFloat("Htrackconf", label="Min Tracking Confidence", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

p.default = 0.5
p.val = 0.5

## Gestures
p = handPage.appendHeader("Gestures", label=None, order=None, replace=True)
p.startSection = True

### Number of gestures
p = handPage.appendInt("Gnumgestures", label="Num Gestures", size=1, order=None, replace=True)
p.normMin  = 0
p.min  = 0
p.clampMin = True

p.normMax = 2

p.default = 2
p.val = 2

## Minimum Gesture score
p = handPage.appendFloat("Gscore", label="Min Gesture Score", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

## Allowed / Denied Gestures
# gesturNames =(["None", "Closed_Fist", "Open_Palm", "Pointing_Up", "Thumb_Down", "Thumb_Up", "Victory", "ILoveYou"],)
# gestureLabels =(["None", "Closed fist", "Open palm", "Pointing up", "Thumb down", "Thumb up", "Victory", "I <3 You"],)

# p = handPage.appendStrMenu("Gallowlist", label="Allowed Gestures", order=None, replace=True)
# p.menuNames = gesturNames
# p.menuLabels = gestureLabels

# p = handPage.appendStrMenu("Gdenylist", label="Denied Gestures", order=None, replace=True)
# p.menuNames = gesturNames
# p.menuLabels = gestureLabels

## Sort
handPage.sort('Hnumhands', 'Hdetectconf','Hpresconf', 'Htrackconf', 'Gestures', 'Gnumgestures', 'Gscore')

# Objects
customPageList = op.customPages
for i in range(len(customPageList)):
	if(customPageList[i] == "Objects"):
		op.customPages[i].destroy()
objectsPage = op.appendCustomPage('Objects')

### Number of objects
p = objectsPage.appendInt("Onumobjects", label="Max num objects (-1 is all)", size=1, order=None, replace=True)
p.normMin  = -1
p.min  = -1
p.clampMin = True

p.normMax = 5

p.default = -1
p.val = -1

## Minimum Gesture score
p = objectsPage.appendFloat("Oscore", label="Min Object Score", size=1, order=None, replace=True)
p.min  = 0
p.clampMin = True

p.max = 1
p.clampMax = True

p.default = 0.5
p.val = 0.5

## Allowed / Denied Objects
# objectNames =(["None", "Closed_Fist", "Open_Palm", "Pointing_Up", "Thumb_Down", "Thumb_Up", "Victory", "ILoveYou"],)
# objectLabels =(["None", "Closed fist", "Open palm", "Pointing up", "Thumb down", "Thumb up", "Victory", "I <3 You"],)

# p = handPage.appendStrMenu("Oallowlist", label="Allowed Gestures", order=None, replace=True)
# p.menuNames = objectNames
# p.menuLabels = objectLabels

# p = handPage.appendStrMenu("Odenylist", label="Denied Gestures", order=None, replace=True)
# p.menuNames = objectNames
# p.menuLabels = objectLabels

## Sort
objectsPage.sort('Onumobjects', 'Oscore' )

# Objects
objectsPage = op.appendCustomPage('Objects')


# Sort
op.sortCustomPages('Faces', 'Hands', 'Pose', 'Objects')



# Sort
op.sortCustomPages('Faces', 'Hands', 'Pose', 'Objects')