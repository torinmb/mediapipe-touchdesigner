import subprocess
import os
from pathlib import Path
import shutil
import zipfile
import platform

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

def create_zip_from_paths(directory, output_zip_name="release.zip"):
	with zipfile.ZipFile(output_zip_name, "w", zipfile.ZIP_DEFLATED) as zip_file:
		for entry in directory.rglob("*"):
			zip_file.write(entry, entry.relative_to(directory))
	return

def onStart():
	return

def onCreate():
	clear()

	releaseFolder = 'release'
	toxReleaseFolder = releaseFolder+'/toxes'
	toxFolder = 'toxes'
	distFolder = '_mpdist'
	mpOp = op('/project1/MediaPipe')
	vfsOp = op('/project1/MediaPipe/virtualFile')
	currentFileDAT = op('dats_with_files')
	previousFileDATs = op('previous_dats_with_files')

	if(Path(releaseFolder).exists()):
		print("Removing existing release dir")
		try:
			shutil.rmtree(releaseFolder)
			print(str(releaseFolder) + " removed successfully")
		except OSError as o:
			print(f"Error, {o.strerror}: {releaseFolder}")
	print("Copying existing tox files in")
	shutil.copytree(toxFolder, toxReleaseFolder)

	print("Unlinking Text DATs")

	previousFileDATs.copy(currentFileDAT)
	previousFileDATs.appendCol()
	previousFileDATs[0,-1] = "filePath"

	for r in range (currentFileDAT.numRows):
		if (r == 0):
			print("Removing file path for "+me.path)
			previousFileDATs.appendRow()
			previousFileDATs[-1,'name'] = me.name
			previousFileDATs[-1,'path'] = me.path
			previousFileDATs[-1,'filePath'] = me.par.file.eval()
			me.par.file = ""
		else:
			print("Removing file path for "+currentFileDAT[r,'path'])
			previousFileDATs[r,'filePath'] = op(currentFileDAT[r,'path']).par.file.eval()
			op(currentFileDAT[r,'path']).par.file = ""

	print("Initing yarn build")
	
	# Specify the path to the desired directory
	directory_path = Path.cwd()

	my_env = os.environ.copy()

	if platform.system() == 'Darwin':  # Check if it's a Mac
		# Prepend the directory to the PATH variable
		my_env["PATH"] = "/usr/local/bin:" + my_env["PATH"]  # Replace '/usr/local/bin' with your directory

	# Run the command in the specified directory (check_call waits for it to complete before proceeding)
	subprocess.check_call("yarn build",shell=True, env=my_env, cwd=directory_path)
	
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
		mpOp.par.externaltox = (str(directory_path.joinpath(toxReleaseFolder, existingName)))
		if(mpOp.saveExternalTox(recurse=False)):
			print("***** Saved tox *****")
			purgeVFS(vfsOp)
		else:
			print("Failed to save tox, aborting")

		# Put our tox path back into the MediaPipe COMP
		mpOp.par.externaltox = originalToxPath

	# Restore the file paths to Text DATs
	for r in range (previousFileDATs.numRows):
		if (r != 0):
			print("Restoring file path for "+previousFileDATs[r,'path'])
			op(previousFileDATs[r,'path']).par.file = previousFileDATs[r,'filePath']

	# Save our toe file and copy it to the release folder
	project.save()	
	shutil.copy(Path(project.name), releaseFolder)

	# Zip everything up
	create_zip_from_paths(Path(releaseFolder), "release.zip")
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