import os
from pathlib import Path
import shutil

clear()

importRoot = os.path.join(os.getcwd(), 'dist')
if(os.path.exists(importRoot)):
	print("Importing files from: " + importRoot)
	vfsOp = op('virtualFile')
	vfiles = []

	print("Found " + str(len(vfsOp.vfs)) + " virtual files")

	# Get all the virtual files
	for f in vfsOp.vfs:
		print(f.name)
		vfiles.append(f.name)

	# Delete all the virtual files
	# # (don't do this as you iterate above, it doesn't work in TD 2022.33910 )
	for v in vfiles:
		vfsOp.vfs[v].destroy()

	for filename in Path(importRoot).rglob('*'):
		if (filename.is_file()):
			file_path = filename.relative_to(importRoot)
			vfsFilename = "#".join(file_path.parts)
			print("Found: "+ vfsFilename)
			vfsOp.vfs.addFile(filename, overrideName="#"+vfsFilename)
	try:
		shutil.rmtree(importRoot)
		print(importRoot + " removed successfully")
	except OSError as o:
		print(f"Error, {o.strerror}: {importRoot}")