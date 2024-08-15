# MediaPipe TouchDesigner Plugin

[![Total Downloads](https://img.shields.io/github/downloads/torinmb/mediapipe-touchdesigner/total?style=for-the-badge&label=Total%20Downloads)](https://github.com/torinmb/mediapipe-touchdesigner/releases/latest/download/release.zip)

[![Download Latest Release](https://img.shields.io/badge/Download_Latest_Release_%E2%86%93-blank?style=for-the-badge)](https://github.com/torinmb/mediapipe-touchdesigner/releases/latest/download/release.zip)


⚠️Ensure you select "Enable External .tox" when dragging the MediaPipe component into a new project, else your toe file size will be massive!
[A word about external files in 2023.10k builds](https://derivative.ca/community-post/word-about-external-files-202310k-builds/68166)


A GPU Accelerated, self-contained, [MediaPipe](https://developers.google.com/mediapipe) Plugin for TouchDesigner that runs on Mac and PC with no installation. This project currently supports all MediaPipe vision models except Interactive Segmentation and Image Embedding.

<img width="1053" alt="Screenshot 2023-08-14 at 2 16 44 PM" src="https://github.com/torinmb/mediapipe-touchdesigner/assets/6014011/8f7a9eb9-fa7a-4d9b-b541-bb9c6c4e0e88">

# Overview
To get an idea of what's possibe with the plugin, and a quick tutorial on how to get up and running, check out our [introduction video on YouTube](https://www.youtube.com/watch?v=Cx4Ellaj6kk "Face, Hand, Pose Tracking & More in TouchDesigner with @MediaPipe GPU Plugin")

# Setup
Download the latest **release.zip** from the [Release Section](https://github.com/torinmb/mediapipe-touchdesigner/releases). Open up the MediaPipe TouchDesigner.toe file. All of the components are stored inside the /toxes folder. The main component is MediaPipe.tox. All of the other components are examples of how to load and display the associated model data in TouchDesigner.

On the MediaPipe component once it's loaded you can select your webcam from the drop-down. You can turn on and off the different MediaPipe models as well as preview overlays. There're also sub-menus available for each model to customize them further.


![image-1](https://github.com/torinmb/mediapipe-touchdesigner/assets/6014011/ffb65b9b-e916-45ee-87fc-af7480cc2ac6)

# A note on resolution
Currently the model is limited to 720p input resolution - as long as that's a resolution your webcam supports, you're good to go.

## Components
The plugin consists of a number of components:

### Media Pipe tox
This component launches a Chromium web browser to host and run all of the MediaPipe vision tasks.
It has a DAT output for each vision task, as well as a TOP output showing the video feed and any overlays.

### Face detector tox
Use this to process the face detection results

[Face detection guide](https://developers.google.com/mediapipe/solutions/vision/face_detector)

### Face tracking tox
Use this to process the facial landmark detection results

[Face landmark detection guide](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)

### Hand tracking tox
Use this to process the hand landmark and gesture detection results

[Gesture recognition task guide](https://developers.google.com/mediapipe/solutions/vision/gesture_recognizer)

### Object tracking tox
Use this to process the object detection results

[Object detection task guide](https://developers.google.com/mediapipe/solutions/vision/object_detector)

### Pose tracking tox
Use this to process the pose landmark detection results

[Pose landmark detection guide](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker)

### Image segmentation tox
Use this to key out segmentation results
[Image segmentation guide](https://developers.google.com/mediapipe/solutions/vision/image_segmenter)

Note: If you're hoping to get the most accurate web-cam cutout use the MultiCam model in the MediaPipe.tox. There's also a toggle to display only the background cutout which you can enable while on the multiclass model.

### Image classification tox
Use this to identify what the image might contain
[Image classification guide](https://developers.google.com/mediapipe/solutions/vision/image_classifier)

# Sending TOPs from TouchDesigner
## SpoutCam on Windows
If you are on Windows, you can use Spout to send any TOP from TouchDesigner to MediaPipe by using a Syphon Spout Out TOP and SpoutCam. Take a look at our [introduction video on YouTube](https://www.youtube.com/watch?v=Cx4Ellaj6kk "Face, Hand, Pose Tracking & More in TouchDesigner with @MediaPipe GPU Plugin") for how to set it up.

### Download SpoutCam
[SpoutCam](https://github.com/leadedge/SpoutCam/releases)

### Unzip the folder
### Run SpoutCam Settings.exe
![Screenshot of the SpoutCam Settings page](https://github.com/torinmb/mediapipe-touchdesigner/assets/36455793/e8f5f422-4dbf-4ff6-a542-e2b4ed00733b)

Note there is no installer, it will run from wherever the folder is
- Enter the frame rate and resolution to match your source material in TouchDesigner
- Enter the default TouchDesigner Spout output name of `TDSyphonSpoutOut` into the Starting Sender box
- Click register to create the virtual webcam

### Drop a Syphon Spout Out TOP into your project
Feed your desired TOP into it
![SyphonSpoutOut parameters](https://github.com/torinmb/mediapipe-touchdesigner/assets/36455793/67afd7ba-aab2-4d7c-a15b-7aaa963ddb82)

### In MediaPipe, select `SpoutCam` as your webcam source
![SpoutCam banana detection](https://github.com/torinmb/mediapipe-touchdesigner/assets/36455793/59428492-aa99-4772-9baf-b5eac0075f93)

The media should appear with no frames of delay!

### Diagnosing SpoutCam showing only noise, and other Spout problems
For diagnosing this issue, I recommend downloading the Spout2 files from the same GitHub profile as the SpoutCam Plugin. This adds some settings and diagnostics options when working with Spout. In my case, **my laptop graphics proved to be the problem!** When running diagnostics, checking for compatibility and looking at the running spout cam process (all possible through the SpoutPanel and SpoutSettings) it told me that the texture sharing was failing, thus resulting in the noise. After reading through the SpoutSettings and their explanations (not the SpoutCamSettings!), I made sure to put all processes involving spout (so sender & receiver) on the same graphics pipeline (by changing the .exe graphic settings in Windows, this is explained in SpoutSettings), since my laptop has both integrated CPU graphics, as well as a GPU.

This actually fixed my issue!

So for anyone that has a laptop, multiple GPUs or any other Spout issues in combination with this TouchDesigner plugin, I recommend downloading the rest of the Spout software and tinkering a bit.

Thanks to @vVattghern for finding this answer

## Syphon on Mac
There is no SpoutCam equivalent on Mac, but you can use Syphon to send video to OBS, and then use the OBS Virtual Webcam output to the MediaPipe task. It's not the most elegant solution, but it works.

# Performance tips
## Realtime CHOP
There are lots of interesting bits of data in the CHOP output of the MediaPipe tox:
![image](https://github.com/torinmb/mediapipe-touchdesigner/assets/36455793/8396fe23-7e72-41ba-8237-3fb067c37b9c)

### `detectTime`
How long the MP detector took to run in ms.

### `drawTime`
How long the overlays and segmentation colors took to draw in ms.

### `sourceFrameRate`
The frame rate of the webcam video source MediaPipe is using.

### `realTimeRatio`
What ratio of a frame it took to process the video. So 0.1 means 0.1 of a frame was needed for MediaPipe to process. This uses the project's cookRate as a reference

### `totalInToOutDelay`
The number of project frames delay MediaPipe introduces. In TouchDesigner 2022.33910 this is at least 3 frames for the web browser component. If you are using Spout or Syphon to send video to a virtual webcam, you can use this as a parameter in a cache TOP to sync your input video source back up with the MediaPipe output TOP.

### `isRealTime`
Tells you if the whole process is able to keep up with the input frame rate.

## Turn off what you're not using
The MediaPipe detection tasks are very CPU and GPU intensive, so turn off any that you aren't using

## Hyperthreading
If you are on a PC, you can greatly improve all CPU-based render times within TouchDesigner, including the MediaPipe tasks by disabling HyperThreading (Intel CPUs) or Simultaneous Multi-Threading (SMT - AMD CPUs). _On my laptop it was a 60-80% improvement._

Enabling/disabling HyperThreading is done in your system BIOS, so look up the instructions on how to do that for your computer. You can re-enable HyperThreading at any point if you want to go back and it is not a risky change to make to your system.

# How do the plugins work?
This project loads the different MediaPipe models through a web browser. All of the ML models are downloaded locally and stored inside TouchDesigner's virtual file system including the website so the component can run without an internet connection. The models run using web assembly and the data coming back from the models are piped into TouchDesigner through a local WebSocket server running inside TD. This allows the components to run as standalone .tox files with GPU acceleration on any device with no setup.

## Architecture
As MediaPipe currently only supports GPU acceleration via the Javascript implementation, and this is the only version that does not require installing local libraries, we have implemented this version, by using the following three main components:
1. Web (and websocket) server
2. Web browser
3. JSON decoders

### Web server
The web server component has an embedded set of web pages that are served to the web browser just like any website would do. It also acts as a websocket server that allows two-way-communication between the web browser and TouchDesigner.

### Web browser
The embedded Chromium support in TouchDesigner allows us to run a full web browser within TouchDesigner. This web browser opens the web pages served by the web server, which allow it to run all of the MediaPipe detection components and render the final video stream. The web browser also sends coordinate data and other detection data back to TouchDesigner via a websocket connection.

### JSON decoders
We send the data from the MediaPipe instance back to TouchDesigner in JSON format. We then use the additional detection tox files to process this JSON data into useful things that can be used elsewhere in TouchDesigner.

# Building from source
This package uses yarn with vite inside node, which gives you a few options. Firstly, you need to download and install node.js

## Installation
Install Node.js

Install yarn package manager globally
``` npm install --global yarn ```

``` yarn install ```

This installs vite and all the other dependencies required. Should only be needed the first time.

## Debugging of the web page
There are 2 options for debugging the web page
1. Debug the page as-is within TouchDesigner
2. Live debug a development page

### Debug the existing web page
Once the MediaPipe project has loaded withing TouchDesigner, you can open a regular Chrome browser on your desktop and go to http://localhost:9222 which will open the developer tools console for the Chromium instance embedded within the MediaPipe component. 
Note that this will have a performance impact as the page is being rendered twice (once in TouchDesigner, once in Chrome), but it gives you access to the console log to see what's going on and maybe debug some issues.

### Live debug a development page
``` yarn dev ```

This launches a tiny web server on port 5173 that fires a reload to the browser every time you save a file change. Super useful for debugging the web page.

Suggested use for this:
1. Run `yarn dev` via the command line, or the console window of VSCode
2. Load the TouchDesigner project and toggle all the settings you'll want to test with.
2. Enter the `MediaPipe` COMP
3. Disable the `webbrowser` component by clicking the X
4. Copy the `current_url` DAT string
5. Paste the url into a new Chrome tab
8. Edit the url and replace the port number with 5173, so for example replace `localhost:3001` with `localhost:5173`

Chrome will now load the page from yarn dev, while still communicating with TouchDesigner via websockets. Note that parameter changes you make in TouchDesigner will not be reflected in the web page unless you repeat the steps to copy the url.

If you press F12 to open the Chrome Developer Tools you can start digging into the console to see error messages.

## Build
``` yarn build ```

This builds all the web page files and puts them into the `_mpdist` folder. If this folder exists, the web pages used within the `MediaPipe` COMP will be served from here.

## Version Update / Release
There is a `build_release` COMP in the top level at the top of the toe file that handles an automated build process.

To create a release zip file:
1. Open the `MediaPipe TouchDesigner.toe` file
2. Navigate to the layout you want to be loaded when someone opens the project for the first time.
3. Press `Ctrl Alt B` to trigger a build. The project will lock up for a while during the build process.
4. The build script will:
- Remove and recreate a `release` folder.
- Perform a `yarn install`
- Perform a `yarn build`
- Load all files from `_mpdist` into the `MediaPipe` COMP Virtual File System
- Remove all external script references on DATs
- Export all tox files to `release/toxes`
- Save the toe file to `release`
- Zip the contents of the `release` folder to `release.zip`
- Give you a popup showing the number of errors.
- Clicking ok (or anywhere!) causes the toe file to reload from the main folder so you're back where you started.
- If there were any errors in the build, you can turn on the TouchDesigner text console and run the build again to see what the errors are.

## Package Version Update

`yarn version --patch`  for backward-compatible bug fixes.

`yarn version --minor`  for backward-compatible new features.

`yarn version --major`  for changes that break backward compatibility.
