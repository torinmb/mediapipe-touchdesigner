#!/usr/bin/env python3
"""Exactness test for segmentation packets through webserver_callbacks.py.

Builds packets in the browser's wire format (raw and zlib-compressed), feeds
them to the real callbacks, and checks that seg_data receives bit-identical
arrays. Pass directories of .npy masks (from `run.py run --save-seg DIR`) to
test real masks in addition to the synthetic ones.

  harness/.venv/bin/python harness/test_seg_packets.py [MASK_DIR ...]
"""

import glob
import struct
import sys
import time
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake_td import SCRIPTS  # noqa: E402
from td_stubs import TDEnvironment  # noqa: E402

HEADER = '<4sBBBBHHBBHII6d'
HEADER_BYTES = 72
FLAG_ZLIB = 0x0001


class WebServerDAT:
	def __init__(self):
		self.sent = []

	def webSocketSendText(self, client, data):
		self.sent.append((client, data))

	def webSocketSendBinary(self, client, data):
		self.sent.append((client, bytes(data)))


def packet(array, sequence, flags=0, compress=False):
	height, width, channels = array.shape
	dtype = 2 if array.dtype == np.float32 else 1
	mode = 2 if channels == 4 else 1
	payload = np.ascontiguousarray(array).astype(array.dtype.newbyteorder('<')).tobytes()
	if compress:
		payload = zlib.compress(payload)
		flags |= FLAG_ZLIB
	origin = time.time() * 1000.0 - 100.0
	header = struct.pack(
		HEADER, b'MPSG', 2, dtype, 3, mode, height, width, channels,
		6 if mode == 2 else 1, flags, sequence, sequence,
		0.0, 50.0, 55.0, 60.0, 61.0, origin,
	)
	assert len(header) == HEADER_BYTES
	return header + payload


def main():
	env = TDEnvironment(log=lambda message: None)
	callbacks = env.loadCallbacks(SCRIPTS / 'webserver_callbacks.py')
	dat = WebServerDAT()
	client = '127.0.0.1:1'
	callbacks.onWebSocketOpen(dat, client, '/segmentation')
	assert (client, '{"segCapabilities":{"zlib":1}}') in dat.sent, dat.sent

	rng = np.random.default_rng(1)
	arrays = [
		rng.integers(0, 256, (256, 256, 4), dtype=np.uint8),
		rng.random((256, 256, 1), dtype=np.float32),
		rng.random((144, 256, 1), dtype=np.float32),
	]
	for directory in sys.argv[1:]:
		arrays += [np.load(path) for path in sorted(glob.glob(str(Path(directory) / '*.npy')))]

	sequence = 0
	for array in arrays:
		for compress in (False, True):
			sequence += 1
			env.ops['seg_data'].array = None
			callbacks.onWebSocketReceiveBinary(dat, client, packet(array, sequence, compress=compress))
			received = env.ops['seg_data'].array
			assert received is not None, 'no commit for {} compress={}'.format(array.shape, compress)
			assert received.dtype == array.dtype and received.shape == array.shape
			assert np.array_equal(received, array), 'mismatch {} compress={}'.format(array.shape, compress)

	# Unknown flag bits must be rejected, not misread.
	env.ops['seg_data'].array = None
	callbacks.onWebSocketReceiveBinary(dat, client, packet(arrays[0], sequence + 1, flags=0x0002))
	assert env.ops['seg_data'].array is None, 'unknown flag was accepted'

	print('OK: {} arrays, raw and zlib, bit-identical in seg_data; unknown flags rejected'.format(len(arrays)))


if __name__ == '__main__':
	main()
