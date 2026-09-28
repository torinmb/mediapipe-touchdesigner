# me - this DAT (Parameter Execute watching the component's Maxhands)
#
# Re-lays out every output as soon as Maxhands changes, so the channel count
# follows it even while no hand data is arriving.


def onValueChange(par, prev):
	op('hand_execute').module.refresh()
	return
