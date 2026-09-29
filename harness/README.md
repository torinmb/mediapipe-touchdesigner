# MediaPipe TD harness

Runs the whole pipeline (web app → WebSocket → TD callbacks → DAT/TOP outputs)
without TouchDesigner, so you can iterate on data delivery quickly.

```
headless Chrome ──(fake webcam: --video clip)──> web app from the Vite dev server (src/)
      │ HTTP + ws://localhost:PORT/  and  /segmentation
      ▼
fake_td.py   network thread (aiohttp)  ──queue──>  "TD main thread" @ 60fps
                                                   ├─ td_scripts/Media_Pipe/webserver_callbacks.py  (unmodified)
                                                   ├─ td_scripts/Media_Pipe/websocket_callbacks.py  (websocket1, unmodified)
                                                   └─ fake op('face_landmark_results').text, op('timers'), op('seg_data') ...
```

The callback files are `exec`'d against stubs in `td_stubs.py` (`op`, `me`,
`absTime`, `debug`, DAT/CHOP/Script TOP fakes), so edits to them are tested
directly. Callbacks run one frame at a time on a single thread. That matches
how TD delivers Web Server DAT callbacks during cook.

## Setup (once)

```bash
python3 -m venv harness/.venv
harness/.venv/bin/pip install aiohttp numpy pillow playwright
brew install ffmpeg   # converts --video clips for Chrome's fake webcam
```

No test video ships with the repo. Pass any clip with `--video` (a person in
frame gives the models something to find). Chrome's fake webcam only plays MJPEG
or Y4M, so other formats (.mov, .mp4, ...) are converted once with ffmpeg to
1280x720 30fps and cached in `harness/out/videos/`. Later runs reuse the cached
copy until the source file changes. `.mjpeg`/`.y4m` files are used as they are.

Playwright uses your installed Google Chrome (`channel='chrome'`), so no browser
download is needed. On Apple Silicon, headless Chrome gets the real Metal GPU.

## Commands

```bash
# automated run: page served live from src/ by the Vite dev server (no build),
# socket pointed at the fake TD via ?Wsport=, same as the dev TD setup
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,seg --seconds 10

# other models / params
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,hands,pose,seg --param Smodeltype=selfieSquare

# emulate TD choking on ingestion
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,seg --max-msgs-per-frame 1
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,seg --max-kb-per-frame 256

# soak: print a timeline row every 15s (rate per model, latency, TD backlog,
# page heap, flow control in-flight/dropped) and save it in the report
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,facedet,hands,pose,objects,image,embed --headed --seconds 300 --interval 15

# TD failure modes: main-thread hitches, callbacks recompiled mid-run (module
# globals reset), the Web Server DAT skipping a timers callback
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face --interval 5 --hitch-every 15 --hitch-ms 1500
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face --interval 5 --reload-callbacks-at 20
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face --interval 10 --drop-timers-every 250

# prove output is unchanged after a transport change (use the same clip both times)
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,seg --record harness/out/before.jsonl
#   ...change the encoding in src/ + decoding in webserver_callbacks.py...
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,seg --record harness/out/after.jsonl
harness/.venv/bin/python harness/run.py compare harness/out/before.jsonl harness/out/after.jsonl

# version skew: new web bundle against callbacks from an older release
git show v0.5.2:td_scripts/Media_Pipe/webserver_callbacks.py > /tmp/old/webserver_callbacks.py  # etc.
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features face,seg --td-scripts /tmp/old

# save real masks, then prove raw + zlib packets land bit-identical in seg_data
harness/.venv/bin/python harness/run.py run --video ~/clips/person.mov --features seg --save-seg harness/out/masks
harness/.venv/bin/python harness/test_seg_packets.py harness/out/masks

# server only: open the printed URL in a real browser with your real webcam
harness/.venv/bin/python harness/run.py serve --port 9980
```

`--source dist --build` instead tests the packaged path: `vite build` into
`_mpdist`, then the page is served by `onHTTPRequest` itself. `--headed` shows the Chrome window. `--json` prints the full report. Every run
writes `harness/out/report-<label>.json`, `console.log` (the browser console)
and `textport.log` (everything the callbacks `print`/`debug`).

## Reading the report

| column | meaning |
| --- | --- |
| `cb` | time the callback holds the TD main thread |
| `q` | network receive → callback dispatch (frame wait + backlog) |
| `e2e` | browser `ws.send()` → callback. Joined per message by wrapping `WebSocket.send` in the page; payloads are untouched |
| frames `work` | total callback + downstream time per cooked frame (budget is 16.7 ms at 60fps) |
| DAT `parse` | one `json.loads` of each results DAT that changed that frame. This is what `landmarks_to_CHOP_exec` and similar consumers pay |
| seg `end-to-end` | `cacheLatencyMs` computed by the callbacks from the packet timestamps |

`compare` checks that every results DAT has an identical JSON schema (keys,
types, list lengths) in both recordings, that `seg_data` shape/dtype match,
and that the per-value means over the run agree within `--tolerance`. Values
with a standard deviation over 1, such as the transformation matrix in cm, are
compared relative to that spread. Two
unchanged runs of the same clip differ by about 0.001. Consumers `json.loads` the
DAT text, so text formatting doesn't need to match byte for byte.

## Frame sync (Web Render emulation)

By default `run` emulates the Web Render TOP: a lossless CDP screencast
delivers every frame the page paints, the harness reads the bottom-left frame
marker pixel from it, and the real `seg_offset.py` Script CHOP cooks on it
every TD frame. Masks then commit only once their exact frame has been
displayed, exactly as in TD. The report shows marker samples/s, the share of
frames with a cache match and the average sync wait; `textport.log` gets a
`[sync]` line whenever the marker or pending frame changes.
`--no-frame-sync` restores commit-on-arrival.

## Limits

- The emulated Web Render has no Cache TOP images; only the marker history
  that `seg_offset.py` keeps is modelled.
- TD's own WebSocket server internals aren't emulated; this server ingests
  everything. `--max-msgs-per-frame` / `--max-kb-per-frame` are knobs to model
  a limit. Calibrate them against what you see in real TD.
