"""Minimal stand-ins for the TouchDesigner objects the MediaPipe callbacks use.

The real callback files in td_scripts/ are executed unchanged against these
stubs, so the harness exercises the exact code TouchDesigner runs.
"""

import hashlib
import time
import types
from pathlib import Path


class Sink:
	"""Accepts any attribute access, assignment or call (webBrowser1, etc.)."""

	def __getattr__(self, name):
		return Sink()

	def __call__(self, *args, **kwargs):
		return Sink()


class Channel:
	def __init__(self, name):
		self.name = name
		self.vals = [0.0]

	def __getitem__(self, index):
		return self.vals[index]

	def __setitem__(self, index, value):
		self.vals[index] = float(value)


class FakeCHOP:
	def __init__(self, name):
		self.name = name
		self._chans = {}

	def clear(self):
		self._chans = {}

	def appendChan(self, name):
		channel = self._chans.get(name)
		if channel is None:
			channel = self._chans[name] = Channel(name)
		return channel

	def chans(self):
		return list(self._chans.values())

	def __getitem__(self, name):
		return self._chans.get(name)

	def values(self):
		return {name: channel[0] for name, channel in self._chans.items()}


class FakeScriptCHOP(FakeCHOP):
	"""A Script CHOP: its callbacks' onCook(scriptOp) fills it from inputs."""

	def __init__(self, name, inputs):
		super().__init__(name)
		self.inputs = inputs


class FakeTextDAT:
	def __init__(self, name, onWrite=None):
		self.name = name
		self._text = ''
		self._onWrite = onWrite

	@property
	def text(self):
		return self._text

	@text.setter
	def text(self, value):
		self._text = value
		if self._onWrite:
			self._onWrite(self.name, value)


class FakeScriptTOP:
	def __init__(self, name, onCopy=None):
		self.name = name
		self.array = None
		self._onCopy = onCopy

	def copyNumpyArray(self, array):
		self.array = array
		if self._onCopy:
			self._onCopy(self.name, array)


class FakeVFS:
	def __getitem__(self, key):
		return None


class FakeParent:
	def __init__(self, log):
		self.errors = []
		self._log = log

	def addScriptError(self, message):
		self.errors.append(message)
		self._log('[scriptError] ' + message)

	def clearScriptErrors(self, recurse=False, error='*'):
		self.errors = []

	def __getattr__(self, name):
		return Sink()


class FakeMe:
	def __init__(self, rate, log):
		self.time = types.SimpleNamespace(play=True, rate=rate)
		self._parent = FakeParent(log)

	def parent(self, *args):
		return self._parent


class AbsTime:
	def __init__(self):
		self.frame = 1
		self.seconds = 0.0


class TDEnvironment:
	"""One TD component's worth of operators, shared by its callback DATs."""

	def __init__(self, rate=60, log=print, onDatWrite=None, onTopCopy=None):
		self.log = log
		self.absTime = AbsTime()
		self.me = FakeMe(rate, log)
		self.ops = {}
		for name in (
			'hand_results',
			'face_landmark_results',
			'face_detector_results',
			'pose_results',
			'object_results',
			'image_results',
			'image_embedder_results',
			'webcam_list',
			'current_url',
		):
			self.ops[name] = FakeTextDAT(name, onDatWrite)
		self.ops['timers'] = FakeCHOP('timers')
		self.ops['seg_data'] = FakeScriptTOP('seg_data', onTopCopy)
		self.ops['virtualFile'] = types.SimpleNamespace(vfs=FakeVFS())
		self.ops['webBrowser1'] = Sink()
		# op('seg_offset') intentionally resolves to None: without a Web Render
		# TOP there is no frame marker to match, so masks commit immediately
		# (the callbacks' documented fallback path).

	def op(self, name):
		return self.ops.get(name)

	def debug(self, *args):
		self.log('[debug] ' + ' '.join(str(arg) for arg in args))

	def loadCallbacks(self, path, extraGlobals=None):
		path = Path(path)
		module = types.ModuleType(path.stem)
		module.__file__ = str(path)
		module.__dict__.update(
			op=self.op,
			me=self.me,
			absTime=self.absTime,
			debug=self.debug,
			parent=self.me.parent,
			run=lambda *args, **kwargs: None,
			mod=lambda name: Sink(),
			print=lambda *args, **kwargs: self.log(' '.join(str(a) for a in args)),
		)
		if extraGlobals:
			module.__dict__.update(extraGlobals)
		exec(compile(path.read_text(), str(path), 'exec'), module.__dict__)
		return module


def arrayDigest(array):
	return hashlib.sha1(array.tobytes()).hexdigest()[:12]


def now_ms():
	return time.time() * 1000.0
