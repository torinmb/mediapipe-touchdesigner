# Parses one MediaPipe hand_results message into preallocated float32 arrays
# for hand_tracking2's locked Script CHOPs (shape: channels x samples).
#
# Pure Python + NumPy (no TouchDesigner imports) so it can be tested outside
# TouchDesigner against outputs captured from the original hand_tracking.tox.
#
# Output layouts, matching hand_tracking.tox for hands h1..hN (N = maxHands):
#   joints    (65 * N, 1): per hand 21 x, 21 y (1 - y), 21 z, Leftness, Rightness
#   gestures  (8 * N, 1):  per hand one channel per known gesture (its score)
#   instances (4, 21 * N): x, y ((1 - y) * height / width), z, active
#   helpers   (7 * N + N // 2, 1): per hand pinch_midpoint x, y, z,
#             rotation, distance; per pair of hands h1h2:distance,
#             h3h4:distance, ... (an odd last hand has none); per hand
#             Leftness, Rightness
#             (hand_tracking's hand_active and hand_velocity are computed
#             outside this parser)
#   width, height: the message's resolution (kept when a message has none)
# A hand that is not detected is all zeros.

import json
import math

import numpy as np

JOINTS = (
	'wrist',
	'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
	'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip',
	'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip',
	'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip',
	'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip',
)
GESTURES = ('None', 'Closed_Fist', 'Open_Palm', 'Pointing_Up', 'Thumb_Down', 'Thumb_Up', 'Victory', 'ILoveYou')
HANDEDNESS = ('Left', 'Right')
INSTANCE_CHANNELS = ('x', 'y', 'z', 'active')
PINCH_CHANNELS = ('x', 'y', 'z', 'rotation', 'distance')
# Hand SOP topology (point indices into JOINTS), as build_hand_SOP draws it:
# the closed palm outline, then the thumb and each finger as open polylines.
HAND_POLYS = (
	((0, 1, 2, 5, 9, 13, 17), True),
	((2, 3, 4), False),
	((5, 6, 7, 8), False),
	((9, 10, 11, 12), False),
	((13, 14, 15, 16), False),
	((17, 18, 19, 20), False),
)
INDEX_TIP = JOINTS.index('index_finger_tip')
THUMB_TIP = JOINTS.index('thumb_tip')
RING_MCP = JOINTS.index('ring_finger_mcp')

NUM_JOINTS = len(JOINTS)
JOINT_CHANNELS_PER_HAND = 3 * NUM_JOINTS + len(HANDEDNESS)
GESTURE_INDEX = {name: index for index, name in enumerate(GESTURES)}
HANDEDNESS_INDEX = {name: index for index, name in enumerate(HANDEDNESS)}


def jointChannelNames(maxHands):
	names = []
	for hand in range(1, maxHands + 1):
		for axis in ('x', 'y', 'z'):
			names.extend('h{}:{}:{}'.format(hand, joint, axis) for joint in JOINTS)
		names.extend('h{}:{}ness'.format(hand, side) for side in HANDEDNESS)
	return names


def gestureChannelNames(maxHands):
	return ['h{}:{}'.format(hand, gesture) for hand in range(1, maxHands + 1) for gesture in GESTURES]


def helperChannelNames(maxHands):
	hands = range(1, maxHands + 1)
	names = ['h{}:pinch_midpoint:{}'.format(hand, name) for hand in hands for name in PINCH_CHANNELS]
	names += ['h{}h{}:distance'.format(first + 1, first + 2) for first in _pairs(maxHands)]
	names += ['h{}:{}ness'.format(hand, side) for hand in hands for side in HANDEDNESS]
	return names


def _pairs(maxHands):
	"""First (0-based) hand of each pair: h1/h2, h3/h4, ..."""
	return range(0, maxHands - 1, 2)


def _distance(a, b):
	return math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2)


def _pinch(tip, other):
	"""Midpoint, rotation and distance of two joints, as hand_tracking's
	pinch_midpoint Script CHOPs compute them (index tip, then thumb tip)."""
	(x1, y1, z1), (x2, y2, z2) = tip, other
	distance = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
	rotation = math.degrees(math.atan2(y2 - y1, x2 - x1))
	if rotation < 0:
		rotation += 360
	return ((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, rotation, distance)


class HandArrays:
	"""Preallocated output arrays for a fixed maximum number of hands."""

	def __init__(self, maxHands):
		self.maxHands = max(1, int(maxHands))
		self.joints = np.zeros((JOINT_CHANNELS_PER_HAND * self.maxHands, 1), dtype=np.float32)
		self.gestures = np.zeros((len(GESTURES) * self.maxHands, 1), dtype=np.float32)
		self.instances = np.zeros((len(INSTANCE_CHANNELS), NUM_JOINTS * self.maxHands), dtype=np.float32)
		self.helpers = np.zeros((len(helperChannelNames(self.maxHands)), 1), dtype=np.float32)
		self.numHands = 0
		self.width = 0.0
		self.height = 0.0

	def clear(self):
		self.joints.fill(0)
		self.gestures.fill(0)
		self.instances.fill(0)
		self.helpers.fill(0)
		self.numHands = 0

	def update(self, text):
		"""Fill every array from one hand_results message. Returns the number of
		hands written. Invalid or empty messages clear the outputs."""
		self.clear()
		try:
			message = json.loads(text)
			results = message['gestureResults']
			landmarks = results['landmarks']
		except (ValueError, KeyError, TypeError):
			return 0

		resolution = message.get('resolution') or {}
		width = resolution.get('width') or 0
		aspect = (resolution.get('height') or 0) / width if width else 1.0
		if 'width' in resolution and 'height' in resolution:
			self.width = float(resolution['width'])
			self.height = float(resolution['height'])
		handedness = results.get('handedness') or ()
		gestures = results.get('gestures') or ()

		numHands = min(len(landmarks), self.maxHands)
		for hand in range(numHands):
			points = np.array(
				[(point['x'], point['y'], point['z']) for point in landmarks[hand]],
				dtype=np.float32,
			)
			if points.shape != (NUM_JOINTS, 3):
				continue

			# Joints: x, then 1 - y, then z, one channel per joint.
			base = hand * JOINT_CHANNELS_PER_HAND
			self.joints[base:base + NUM_JOINTS, 0] = points[:, 0]
			self.joints[base + NUM_JOINTS:base + 2 * NUM_JOINTS, 0] = 1.0 - points[:, 1]
			self.joints[base + 2 * NUM_JOINTS:base + 3 * NUM_JOINTS, 0] = points[:, 2]
			if hand < len(handedness) and handedness[hand]:
				label = handedness[hand][0]
				side = HANDEDNESS_INDEX.get(label.get('categoryName'))
				if side is not None:
					self.joints[base + 3 * NUM_JOINTS + side, 0] = label.get('score', 0.0)

			# Gestures: the score of every listed gesture on its channel.
			if hand < len(gestures):
				gestureBase = hand * len(GESTURES)
				for category in gestures[hand]:
					index = GESTURE_INDEX.get(category.get('categoryName'))
					if index is not None:
						self.gestures[gestureBase + index, 0] = category.get('score', 0.0)

			# Instances: one sample per joint.
			start = hand * NUM_JOINTS
			self.instances[0, start:start + NUM_JOINTS] = points[:, 0]
			self.instances[1, start:start + NUM_JOINTS] = (1.0 - points[:, 1]) * aspect
			self.instances[2, start:start + NUM_JOINTS] = points[:, 2]
			self.instances[3, start:start + NUM_JOINTS] = 1.0

		self.numHands = numHands
		self._fillHelpers()
		return numHands

	def _joint(self, hand, joint):
		"""(x, y, z) of a joint as written to the joints output (y flipped)."""
		base = hand * JOINT_CHANNELS_PER_HAND + joint
		return tuple(float(self.joints[base + axis * NUM_JOINTS, 0]) for axis in range(3))

	def _fillHelpers(self):
		n = self.maxHands
		for hand in range(n):
			# Absent hands are zeros here too, as in hand_tracking.
			values = _pinch(self._joint(hand, INDEX_TIP), self._joint(hand, THUMB_TIP))
			start = hand * len(PINCH_CHANNELS)
			self.helpers[start:start + len(PINCH_CHANNELS), 0] = values
		# Pair distances between ring finger MCPs, as hand_tracking's
		# hand_distance measures h1 to h2 (absent hands count as zeros).
		distanceIndex = len(PINCH_CHANNELS) * n
		pairs = _pairs(n)
		for offset, first in enumerate(pairs):
			self.helpers[distanceIndex + offset, 0] = _distance(
				self._joint(first, RING_MCP), self._joint(first + 1, RING_MCP))
		handednessIndex = distanceIndex + len(pairs)
		for hand in range(n):
			base = hand * JOINT_CHANNELS_PER_HAND + 3 * NUM_JOINTS
			start = handednessIndex + hand * len(HANDEDNESS)
			self.helpers[start:start + len(HANDEDNESS), 0] = self.joints[base:base + len(HANDEDNESS), 0]
