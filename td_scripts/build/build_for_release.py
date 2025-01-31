import subprocess
import os
from pathlib import Path
import shutil
import zipfile
import platform

from datetime import datetime

# me - this DAT
# 
# frame - the current frame
# state - True if the timeline is paused
# 
# Make sure the corresponding toggle is enabled in the Execute DAT.

def purgeVFS(op, logfile):
	vfiles = []
	print("Found " + str(len(op.vfs)), " virtual file(s) for deletion")
	logfile.write("Found " + str(len(op.vfs)) + " virtual file(s) for deletion\n")

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

def dialogChoice(popupInfo):
	# print("current File: " + popupInfo["details"])
	project.load(popupInfo["details"])	

def onStart():
	return

def onCreate():
	now = datetime.now() # current date and time
	date_time = now.strftime("%Y-%m-%d %H-%M-%S")
	logfilename = "buildlog " + date_time + ".txt"
	logfile = open(logfilename, "a")
	clear()

	releaseFolder = 'release'
	fullReleasePath = Path(os.getcwd() + "/" + releaseFolder)
	toxReleaseFolder = releaseFolder+'/toxes'
	distFolder = '_mpdist'
	vfsOp = op('/project1/MediaPipe/virtualFile')
	currentFileDAT = op('dats_with_files')
	previousFileDAT = op('previous_dats_with_files')
	currentToxesDAT = op('external_toxes')
	previousToxesDAT = op('previous_tox_paths')
	gotErrors = 0

	if(Path(releaseFolder).exists()):
		print("Removing existing release dir")
		logfile.write("Removing existing release dir\n")
		try:
			shutil.rmtree(releaseFolder)
			print(str(releaseFolder) + " removed successfully")
			logfile.write(str(releaseFolder) + " removed successfully\n")
		except OSError as o:
			print(f"Error, {o.strerror}: {releaseFolder}")
			logfile.write(f"Error, {o.strerror}: {releaseFolder}\n")
			gotErrors = gotErrors + 1
	print("Creating new release folder")
	logfile.write("Creating new release folder\n")
	
	os.mkdir(os.path.join(os.getcwd(), releaseFolder))
	os.mkdir(os.path.join(os.getcwd(), toxReleaseFolder))

	print("Unlinking Text DATs")
	logfile.write("Unlinking Text DATs\n")

	previousFileDAT.copy(currentFileDAT)
	previousFileDAT.appendCol()
	previousFileDAT[0,-1] = "filePath"

	for r in range (currentFileDAT.numRows):
		if (r != 0 and currentFileDAT[r,'name'] != "shortcuts"):
			print("Removing file path for " + currentFileDAT[r,'path'])
			logfile.write("Removing file path for " + currentFileDAT[r,'path'] + "\n")
			previousFileDAT[r,'filePath'] = op(currentFileDAT[r,'path']).par.file.eval()
			op(currentFileDAT[r,'path']).par.file = ""

	print("Initing yarn build")
	logfile.write("Initing yarn build\n")
	
	# Specify the path to the desired directory
	directory_path = Path.cwd()

	my_env = os.environ.copy()

	if platform.system() == 'Darwin':  # Check if it's a Mac
		# Prepend the directory to the PATH variable
		my_env["PATH"] = "/usr/local/bin:" + my_env["PATH"]  # Replace '/usr/local/bin' with your directory

	# Run the command in the specified directory (check_call waits for it to complete before proceeding)
	try:
		subprocess.check_call("yarn install",shell=True, env=my_env, cwd=directory_path)
		subprocess.check_call("yarn build",shell=True, env=my_env, cwd=directory_path)
	except:
		print("***** Yarn build failed, moving on... *****")
		logfile.write("***** Yarn build failed, moving on... *****\n")
		gotErrors = gotErrors + 1

	importRoot = directory_path.joinpath(distFolder)
	purgeVFS(vfsOp, logfile)
	print("Checking for new files at: " + str(importRoot))
	logfile.write("Checking for new files at: " + str(importRoot) + "\n")

	if(Path(importRoot).exists):
		print("Importing files from: " + str(importRoot))
		logfile.write("Importing files from: " + str(importRoot) + "\n")
		for filename in Path(importRoot).rglob('*'):
			if (filename.is_file()):
				file_path = filename.relative_to(importRoot)
				vfsFilename = "#".join(file_path.parts)
				print("Importing: " + vfsFilename)
				logfile.write("Importing: " + vfsFilename + "\n")
				vfsOp.vfs.addFile(filename, overrideName="#"+vfsFilename)

	print("Saving external tox files")
	logfile.write("Saving external tox files\n")

	previousToxesDAT.copy(currentToxesDAT)
	previousToxesDAT.appendCol()
	previousToxesDAT[0,-1] = "filePath"

	for r in range (currentToxesDAT.numRows):
		if (r != 0):
			currentOp = op(currentToxesDAT[r,'path'])
			originalToxPath = currentOp.par.externaltox.eval()
			previousToxesDAT[r,'filePath'] = originalToxPath
			e = Path(originalToxPath)
			existingName = e.name
			# If we're the build script, don't export, and remove our external tox path
			if(currentOp.name == parent().name):
				# print("skipping build tox")
				currentOp.par.externaltox = ""
			else:
				currentOp.par.externaltox = (str(directory_path.joinpath(toxReleaseFolder, existingName)))
				if(currentOp.saveExternalTox(recurse=False)):
					print("Saved " + str(currentOp))
					logfile.write("Saved " + str(currentOp) + "\n")
				else:
					print("***** Failed to save tox for ", str(currentOp), " *****")
					logfile.write("***** Failed to save tox for " + str(currentOp) + " *****\n")
					gotErrors = gotErrors + 1
				# If the external tox is not the MediaPipe tox, remove it's path
				if(currentOp.name != "MediaPipe"):
					currentOp.par.externaltox = ""
				# currentOp.par.externaltox = originalToxPath
				# print("Restoring tox path for " + str(currentOp))

	print("Restoring file path for MediaPipe tox")
	logfile.write("Restoring file path for MediaPipe tox\n")
	op(previousToxesDAT['MediaPipe','path']).par.externaltox = previousToxesDAT['MediaPipe','filePath']

	print("Purging VFS")
	logfile.write("Purging VFS\n")
	purgeVFS(vfsOp, logfile)

	# Save our toe file and copy it to the release folder
	currentFolder = project.folder
	currentFilename = project.name

	project.save(releaseFolder + "/MediaPipe TouchDesigner.toe")
	
	# Zip everything up
	create_zip_from_paths(fullReleasePath, "../release.zip")

	# Restore the file paths to Text DATs
	for r in range (previousFileDAT.numRows):
		if (r != 0):
			print("Restoring file path for " + previousFileDAT[r,'path'])
			logfile.write("Restoring file path for " + previousFileDAT[r,'path'] + "\n")
			op(previousFileDAT[r,'path']).par.file = previousFileDAT[r,'filePath']
		
	# Restore the file paths to external Toxes
	for r in range (previousToxesDAT.numRows):
		if (r != 0):
			print("Restoring file path for " + previousToxesDAT[r,'path'])
			logfile.write("Restoring file path for " + previousToxesDAT[r,'path'] + "\n")
			op(previousToxesDAT[r,'path']).par.externaltox = previousToxesDAT[r,'filePath']

	op.TDResources.PopDialog.OpenDefault(
							text="Finished release build with "+ str(gotErrors) + " errors. Please check the logs, then click OK to reload.",
							title="Build complete",
							buttons=['OK'],
							callback=dialogChoice,
							details=currentFolder + "/" + currentFilename,
							textEntry=False,
							escButton=1,
							enterButton=1)

	# # Save the original MediaPipe tox path
	# # originalToxPath = mpOp.par.externaltox.eval()
	# # print("Current external tox path: "+originalToxPath)
	
	# # Keep the filename, but move the location to our release folder
	# e = Path(originalToxPath)
	# existingName = e.name
	# mpOp.par.externaltox = (str(directory_path.joinpath(toxReleaseFolder, existingName)))
	# if(mpOp.saveExternalTox(recurse=False)):
	# 	print("***** Saved tox *****")
	# 	purgeVFS(vfsOp)
	# else:
	# 	print("Failed to save tox")

	# # Put our tox path back into the MediaPipe COMP
	# mpOp.par.externaltox = originalToxPath
	logfile.close()
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