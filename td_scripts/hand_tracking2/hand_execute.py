# me - this DAT (DAT Execute watching in1, the hand_results message)
#
# Runs whenever the hand tracking message updates. Parses it once into
# preallocated float32 arrays (hand_parser) and writes each output to its
# locked Script CHOP with a single copyNumpyArray. copyNumpyArray names the
# channels chan1, chan2, ..., so a Rename CHOP after each Script CHOP applies
# the real names; those name lists are only rebuilt when Maxhands changes.
# Writing into a locked CHOP does not mark the operators after it as changed,
# so each Rename CHOP is cooked once per update to pass the new data on.
#
# Hand SOPs: hand N's points are written into the locked Script SOP
# hand_sopN/landmarks_to_SOP1 (N = 1..Maxhands; missing containers are
# skipped). The hand's topology is built once; each update only moves its 21
# points, from the joints array (x, 1 - y, z). A SOP whose hand is not
# detected is cleared, as hand_tracking's landmarks_to_SOP did.
#
# resolution: the message's width and height, written to the Constant CHOP
# 'resolution' (const0value = width, const1value = height).

_state = {'arrays': None, 'parser': None}
_RENAMES = ('rename_joints', 'rename_gestures', 'rename_instances', 'rename_helpers')


def _layout(parser, maxHands):
	arrays = parser.HandArrays(maxHands)
	op('rename_joints').par.renameto = ' '.join(parser.jointChannelNames(maxHands))
	op('rename_gestures').par.renameto = ' '.join(parser.gestureChannelNames(maxHands))
	op('rename_helpers').par.renameto = ' '.join(parser.helperChannelNames(maxHands))
	_state['arrays'] = arrays
	_state['parser'] = parser
	return arrays


def refresh():
	# Looked up on every update: when hand_parser's text changes (e.g. synced
	# from its file) TouchDesigner reloads it as a new module, and the outputs
	# are laid out again for the new version.
	parser = op('hand_parser').module
	maxHands = max(1, int(parent().par.Maxhands.eval()))
	arrays = _state['arrays']
	if arrays is None or arrays.maxHands != maxHands or _state['parser'] is not parser:
		arrays = _layout(parser, maxHands)
	# Lock mode: Left hand always in h1, Right hand in h2 (see HandLocker).
	lock = parent().par.Lockhandedness
	settle = parent().par.Settleframes
	arrays.setLock(lock is not None and bool(lock.eval()), int(settle.eval()) if settle is not None else 4)
	arrays.update(op('in1').text)
	op('joints_data').copyNumpyArray(arrays.joints)
	op('gestures_data').copyNumpyArray(arrays.gestures)
	op('instances_data').copyNumpyArray(arrays.instances)
	op('helpers_data').copyNumpyArray(arrays.helpers)
	for rename in _RENAMES:
		op(rename).cook(force=True)
	_writeHandSops(parser, arrays)
	_writeResolution(arrays)
	return


def _writeResolution(arrays):
	resolution = op('resolution')
	resolution.par.const0value = arrays.width
	resolution.par.const1value = arrays.height


def _handSop(hand):
	container = op('hand_sop{}'.format(hand))
	if container is None:
		return None
	return container.op('landmarks_to_SOP1')


def _buildHand(parser, sop):
	sop.clear()
	for _ in range(parser.NUM_JOINTS):
		sop.appendPoint()
	for indices, closed in parser.HAND_POLYS:
		poly = sop.appendPoly(len(indices), closed=closed, addPoints=False)
		for vertex, index in enumerate(indices):
			poly[vertex].point = sop.points[index]


def _writeHandSops(parser, arrays):
	joints = parser.NUM_JOINTS
	for hand in range(arrays.maxHands):
		sop = _handSop(hand + 1)
		if sop is None:
			continue
		if not sop.lock:
			sop.lock = True
		if not arrays.present[hand]:
			if sop.numPoints:
				sop.clear()
			continue
		if sop.numPoints != joints or sop.numPrims != len(parser.HAND_POLYS):
			_buildHand(parser, sop)
		base = hand * parser.JOINT_CHANNELS_PER_HAND
		xs = arrays.joints[base:base + joints, 0].tolist()
		ys = arrays.joints[base + joints:base + 2 * joints, 0].tolist()
		zs = arrays.joints[base + 2 * joints:base + 3 * joints, 0].tolist()
		for point, x, y, z in zip(sop.points, xs, ys, zs):
			point.P = (x, y, z)


def onTableChange(dat):
	refresh()
	return


def onRowChange(dat, rows):
	return


def onColChange(dat, cols):
	return


def onCellChange(dat, cells, prev):
	return


def onSizeChange(dat):
	return
