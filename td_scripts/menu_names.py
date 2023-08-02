class MyDATMenu:

	def __init__(self, path):
		self.myPath = path
		print("init")

	@property		
	def menuNames(self):
		print("getNames")
		return [x.val for x in op(self.myPath).col('deviceId')][1:]

	@property
	def menuLabels(self):
		return [x.val for x in op(self.myPath).col('label')][1:]