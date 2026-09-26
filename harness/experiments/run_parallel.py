#!/usr/bin/env python3
"""Does running MediaPipe models in parallel workers raise the frame rate?

Runs the app's eight default models on the same video frames with N workers
(0 = all on the page's main thread) and reports the time until every model
has finished a frame. Close TouchDesigner first: it shares the GPU.

  harness/.venv/bin/python harness/experiments/run_parallel.py [--workers 0,1,2,4,8] [--rounds 2]
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from run import MEDIA, startViteDev  # noqa: E402


async def main(args):
	from playwright.async_api import async_playwright

	vite, base = startViteDev()
	video = (MEDIA / 'vidtest.mjpeg').resolve()
	results = {}
	try:
		async with async_playwright() as playwright:
			browser = await playwright.chromium.launch(channel='chrome', headless=True, args=[
				'--use-fake-ui-for-media-stream',
				'--use-fake-device-for-media-stream',
				'--use-file-for-fake-video-capture={}'.format(video),
				'--ignore-gpu-blocklist',
				'--enable-gpu',
			])
			for round_ in range(args.rounds):
				for workers in args.workers:
					page = await browser.new_page()
					errors = []
					page.on('pageerror', lambda error: errors.append(str(error)))
					url = '{}/harness/experiments/parallel.html?workers={}&seconds={}&models={}'.format(
						base, workers, args.seconds, args.models)
					await page.goto(url)
					try:
						await page.wait_for_function('window.__result', timeout=180000)
						result = await page.evaluate('window.__result')
					except Exception as error:
						result = {'error': str(error), 'pageErrors': errors}
					await page.close()
					results.setdefault(workers, []).append(result)
					print('round {} workers {}: {}'.format(round_ + 1, workers, result), flush=True)
			await browser.close()
	finally:
		vite.terminate()

	print()
	print('{:>8} {:>22} {:>22}'.format('workers', 'avg ms per frame', 'fps'))
	for workers, runs in results.items():
		ok = [run for run in runs if 'avgMs' in run]
		print('{:>8} {:>22} {:>22}'.format(
			workers,
			' / '.join('{:.1f}'.format(run['avgMs']) for run in ok),
			' / '.join('{:.1f}'.format(run['fps']) for run in ok)))


if __name__ == '__main__':
	parser = argparse.ArgumentParser()
	parser.add_argument('--workers', default='0,1,2,4,8', type=lambda s: [int(x) for x in s.split(',')])
	parser.add_argument('--rounds', type=int, default=2)
	parser.add_argument('--seconds', type=int, default=8)
	parser.add_argument('--models', default='objects,gestures,hands,face,pose,image,embed,facedet')
	asyncio.run(main(parser.parse_args()))
