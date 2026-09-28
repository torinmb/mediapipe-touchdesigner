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
#
# Lock mode (HandArrays.setLock): MediaPipe's Left hand always goes to h1 and
# its Right hand to h2; further hands fill h3+ in message order. See
# HandLocker.

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


LEFT, RIGHT = 0, 1  # lock-mode slots: h1 = Left, h2 = Right


class _Track:
	"""One hand followed across messages by its wrist position."""

	def __init__(self, trackId, wrist):
		self.id = trackId
		self.wrist = wrist
		self.age = 0            # messages seen
		self.missing = 0        # consecutive messages not seen
		self.labels = []        # recent (side, score), newest last
		self.side = None        # locked slot (LEFT / RIGHT) or None
		self.contrary = 0       # consecutive messages labelled the other side
		self.conflicted = False  # released because its side was taken


class HandLocker:
	"""Keeps MediaPipe's Left hand in h1 and its Right hand in h2.

	MediaPipe's handedness label is unreliable for the first and last one or
	two messages of a hand (sometimes at 0.95+ confidence), and the order of
	hands in a message is not stable. So hands are followed across messages by
	wrist position and each keeps a locked side:

	- A new hand is not output until it has been seen for settleFrames
	  messages. It then locks to the side its last settleFrames labels agree
	  on; if the other side is already locked (the person's other hand), it
	  takes the free side. Two hands settling together are split by their
	  combined handedness scores.
	- A locked hand keeps its side until it is labelled the other side for
	  switchFrames consecutive messages. If that side is taken (e.g. two
	  people's right hands) it is released and output as an extra hand.
	- A hand missing for up to holdFrames messages keeps its lock and resumes
	  without settling again; its slot is zeros while it is missing.
	"""

	def __init__(self, settleFrames=4, holdFrames=3, switchFrames=15, matchDistance=0.2):
		self.settleFrames = max(1, int(settleFrames))
		self.holdFrames = holdFrames
		self.switchFrames = switchFrames
		self.matchDistance = matchDistance
		self.tracks = []
		self._nextId = 0

	def assign(self, hands, numSlots):
		"""hands: (x, y, side, score) per detected hand in message order, with
		side LEFT, RIGHT or None. Returns, for each output slot, the index of
		the detected hand written there, or None."""
		matched = self._match(hands)
		for index, track in matched.items():
			x, y, side, score = hands[index]
			track.wrist = (x, y)
			track.age += 1
			track.missing = 0
			track.labels.append((side, score))
			del track.labels[:-max(self.switchFrames, 3 * self.settleFrames)]
		seen = {track.id for track in matched.values()}
		for track in self.tracks:
			if track.id not in seen:
				track.missing += 1
		self.tracks = [track for track in self.tracks if track.missing <= self.holdFrames]
		self._decide()

		slots = [None] * numSlots
		extras = []
		for index in sorted(matched):
			track = matched[index]
			if track.side is not None:
				if track.side < numSlots:
					slots[track.side] = index
			elif track.conflicted or (track.age >= self.settleFrames and not self._freeSides()):
				# Settled, but both lock slots are taken: an extra hand (h3+).
				extras.append(index)
		for slot, index in zip(range(2, numSlots), extras):
			slots[slot] = index
		return slots

	def _match(self, hands):
		"""Nearest-wrist matching of detections to tracks; the rest start new
		tracks."""
		pairs = sorted(
			(((x - t.wrist[0]) ** 2 + (y - t.wrist[1]) ** 2) ** 0.5, index, t.id)
			for index, (x, y, _, _) in enumerate(hands) for t in self.tracks
		)
		byId = {track.id: track for track in self.tracks}
		matched, usedTracks = {}, set()
		for distance, index, trackId in pairs:
			if distance > self.matchDistance:
				break
			if index in matched or trackId in usedTracks:
				continue
			matched[index] = byId[trackId]
			usedTracks.add(trackId)
		for index, (x, y, _, _) in enumerate(hands):
			if index not in matched:
				track = _Track(self._nextId, (x, y))
				self._nextId += 1
				self.tracks.append(track)
				matched[index] = track
		return matched

	def _locked(self):
		return {track.side: track for track in self.tracks if track.side is not None}

	def _freeSides(self):
		locked = self._locked()
		return [side for side in (LEFT, RIGHT) if side not in locked]

	def _settled(self, track):
		"""The side the last settleFrames labels agree on, else None."""
		recent = [side for side, _ in track.labels[-self.settleFrames:]]
		if len(recent) == self.settleFrames and recent[0] is not None and recent.count(recent[0]) == len(recent):
			return recent[0]
		return None

	@staticmethod
	def _vote(track):
		"""Positive for Right, negative for Left, weighted by score."""
		return sum(score if side == RIGHT else -score for side, score in track.labels if side is not None)

	def _lock(self, track, side):
		track.side = side
		track.contrary = 0
		track.conflicted = False

	def _decide(self):
		# Locked hands switch only on sustained contrary labels.
		for track in list(self._locked().values()):
			if track.missing:
				continue
			side = track.labels[-1][0] if track.labels else None
			track.contrary = track.contrary + 1 if side is not None and side != track.side else 0
			if track.contrary >= self.switchFrames:
				target = 1 - track.side
				track.side = None
				if target in self._locked():
					track.conflicted = True
					track.contrary = 0
				else:
					self._lock(track, target)

		# New hands (and released ones) that are present and settled.
		waiting = [track for track in self.tracks
			if track.side is None and not track.missing and track.age >= self.settleFrames]
		waiting.sort(key=lambda track: -track.age)
		free = self._freeSides()
		if len(waiting) >= 2 and len(free) == 2 and not any(t.conflicted for t in waiting[:2]):
			first, second = waiting[0], waiting[1]
			if self._vote(first) >= self._vote(second):
				self._lock(first, RIGHT)
				self._lock(second, LEFT)
			else:
				self._lock(first, LEFT)
				self._lock(second, RIGHT)
			waiting = waiting[2:]
		for track in waiting:
			free = self._freeSides()
			if not free:
				continue
			claim = self._settled(track)
			if track.conflicted:
				# Released for claiming a taken side: only lock to what it claims.
				if claim in free:
					self._lock(track, claim)
			elif len(free) == 1:
				# The other hand is locked: this is the person's other hand.
				self._lock(track, free[0])
			elif claim is not None:
				self._lock(track, claim)
			elif track.age >= 3 * self.settleFrames:
				# Labels keep flipping: decide by the weighted vote.
				self._lock(track, RIGHT if self._vote(track) >= 0 else LEFT)


class HandArrays:
	"""Preallocated output arrays for a fixed maximum number of hands."""

	def __init__(self, maxHands):
		self.maxHands = max(1, int(maxHands))
		self.joints = np.zeros((JOINT_CHANNELS_PER_HAND * self.maxHands, 1), dtype=np.float32)
		self.gestures = np.zeros((len(GESTURES) * self.maxHands, 1), dtype=np.float32)
		self.instances = np.zeros((len(INSTANCE_CHANNELS), NUM_JOINTS * self.maxHands), dtype=np.float32)
		self.helpers = np.zeros((len(helperChannelNames(self.maxHands)), 1), dtype=np.float32)
		self.numHands = 0
		self.present = [False] * self.maxHands
		self.width = 0.0
		self.height = 0.0
		self.locker = None

	def setLock(self, enabled, settleFrames=4):
		"""Turn lock mode on or off (see HandLocker)."""
		if not enabled:
			self.locker = None
		elif self.locker is None or self.locker.settleFrames != max(1, int(settleFrames)):
			self.locker = HandLocker(settleFrames)

	def clear(self):
		self.joints.fill(0)
		self.gestures.fill(0)
		self.instances.fill(0)
		self.helpers.fill(0)
		self.numHands = 0
		self.present = [False] * self.maxHands

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

		# Which detected hand goes to each output slot.
		if self.locker is not None:
			hands = []
			for index in range(len(landmarks)):
				wrist = landmarks[index][0] if landmarks[index] else {}
				label = handedness[index][0] if index < len(handedness) and handedness[index] else {}
				hands.append((wrist.get('x', 0.0), wrist.get('y', 0.0),
					HANDEDNESS_INDEX.get(label.get('categoryName')), label.get('score', 0.0)))
			order = self.locker.assign(hands, self.maxHands)
		else:
			order = list(range(min(len(landmarks), self.maxHands)))

		for hand, source in enumerate(order):
			if source is None:
				continue
			points = np.array(
				[(point['x'], point['y'], point['z']) for point in landmarks[source]],
				dtype=np.float32,
			)
			if points.shape != (NUM_JOINTS, 3):
				continue
			self.present[hand] = True

			# Joints: x, then 1 - y, then z, one channel per joint.
			base = hand * JOINT_CHANNELS_PER_HAND
			self.joints[base:base + NUM_JOINTS, 0] = points[:, 0]
			self.joints[base + NUM_JOINTS:base + 2 * NUM_JOINTS, 0] = 1.0 - points[:, 1]
			self.joints[base + 2 * NUM_JOINTS:base + 3 * NUM_JOINTS, 0] = points[:, 2]
			if source < len(handedness) and handedness[source]:
				label = handedness[source][0]
				side = HANDEDNESS_INDEX.get(label.get('categoryName'))
				if side is not None:
					self.joints[base + 3 * NUM_JOINTS + side, 0] = label.get('score', 0.0)

			# Gestures: the score of every listed gesture on its channel.
			if source < len(gestures):
				gestureBase = hand * len(GESTURES)
				for category in gestures[source]:
					index = GESTURE_INDEX.get(category.get('categoryName'))
					if index is not None:
						self.gestures[gestureBase + index, 0] = category.get('score', 0.0)

			# Instances: one sample per joint.
			start = hand * NUM_JOINTS
			self.instances[0, start:start + NUM_JOINTS] = points[:, 0]
			self.instances[1, start:start + NUM_JOINTS] = (1.0 - points[:, 1]) * aspect
			self.instances[2, start:start + NUM_JOINTS] = points[:, 2]
			self.instances[3, start:start + NUM_JOINTS] = 1.0

		self.numHands = sum(self.present)
		self._fillHelpers()
		return self.numHands

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
