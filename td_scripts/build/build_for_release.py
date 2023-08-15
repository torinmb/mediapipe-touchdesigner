import os
from pathlib import Path
import shutil

# me - this DAT
# 
# frame - the current frame
# state - True if the timeline is paused
# 
# Make sure the corresponding toggle is enabled in the Execute DAT.

def purgeVFS(op):
	vfiles = []
	print("Found " + str(len(op.vfs)) + " virtual files")

	# Get all the virtual files
	for f in op.vfs:
		print(f.name)
		vfiles.append(f.name)

	# Delete all the virtual files
	# # (don't do this as you iterate above, it doesn't work in TD 2022.33910 )
	for v in vfiles:
		op.vfs[v].destroy()
	return

def onStart():
	return

def onCreate():
	distFolder = '_mpdist'
	vfsOp = op('/project1/MediaPipe/virtualFile')

	importRoot = os.path.join(os.getcwd(), distFolder)
	purgeVFS(vfsOp.vfs)
	print("Checking for new files at: " + importRoot)

	if(os.path.exists(importRoot)):
		print("Importing files from: " + importRoot)
		

		for filename in Path(importRoot).rglob('*'):
			if (filename.is_file()):
				file_path = filename.relative_to(importRoot)
				vfsFilename = "#".join(file_path.parts)
				print("Importing: "+ vfsFilename)
				vfsOp.vfs.addFile(filename, overrideName="#"+vfsFilename)
		if(parent().saveExternalTox(recurse=False)):
			print("Saved tox")
			purgeVFS(vfsOp.vfs)
			try:
				shutil.rmtree(importRoot)
				print(importRoot + " removed successfully")
			except OSError as o:
				print(f"Error, {o.strerror}: {importRoot}")
		else:
			print("Failed to save tox")
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