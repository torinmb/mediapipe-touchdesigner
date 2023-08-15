import subprocess
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
	print("Found " + str(len(op.vfs)) + " virtual file(s) for deletion")

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
	clear()

	releaseFolder = 'release'
	distFolder = '_mpdist'
	mpOp = op('/project1/MediaPipe')
	vfsOp = op('/project1/MediaPipe/virtualFile')

	print("Removing and recreating existing release dir")
	try:
		shutil.rmtree(releaseFolder)
		print(str(releaseFolder) + " removed successfully")
	except OSError as o:
		print(f"Error, {o.strerror}: {releaseFolder}")

	Path(releaseFolder).mkdir()
	print("Initing yarn build")
	
	# Specify the path to the desired directory
	directory_path = Path.cwd()

	# Run the command in the specified directory
	subprocess.check_call(["yarn", "build"],shell=True, cwd=directory_path)
	
	importRoot = directory_path.joinpath(distFolder)
	purgeVFS(vfsOp)
	print("Checking for new files at: " + str(importRoot))

	if(os.path.exists(importRoot)):
		print("Importing files from: " + str(importRoot))
		for filename in Path(importRoot).rglob('*'):
			if (filename.is_file()):
				file_path = filename.relative_to(importRoot)
				vfsFilename = "#".join(file_path.parts)
				print("Importing: "+ vfsFilename)
				vfsOp.vfs.addFile(filename, overrideName="#"+vfsFilename)
		
		# Save the original MediaPipe tox path
		originalToxPath = mpOp.par.externaltox.eval()
		print("Current external tox path: "+originalToxPath)
		
		# Keep the filename, but move the location to our release folder
		e = Path(originalToxPath)
		existingName = e.name
		mpOp.par.externaltox = (str(directory_path.joinpath(releaseFolder, existingName)))
		if(mpOp.saveExternalTox(recurse=False)):
			print("***** Saved tox *****")
			purgeVFS(vfsOp)
			try:
				shutil.rmtree(importRoot)
				print(str(importRoot) + " removed successfully")
			except OSError as o:
				print(f"Error, {o.strerror}: {importRoot}")
		else:
			print("Failed to save tox, aborting")

		# Put our tox path back into the MediaPipe COMP
		mpOp.par.externaltox = originalToxPath
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