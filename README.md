# mediapipe-touchdesigner
A GPU Accelerated, self-contained, cross-platform [MediaPipe Vision](https://developers.google.com/mediapipe/solutions/guide) Plugin for TouchDesigner.

# Overview
This plugin runs most* of the MediaPipe Vision tasks from within TouchDesigner without the need to install any external libraries or files. Simply download the package, unzip the folder and open the toe file to get started.

* We're still working on the segmentation tasks!

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

# Sending TOPs from TouchDesigner
## SpoutCam on Windows
If you are on Windows, you can use Spout to send any TOP from TouchDesigner to MediaPipe by using a Syphon Spout Out TOP and SpoutCam.

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

The media should appear with around a 1 frame delay!

### Syphon on Mac
There is no SpoutCam equivalent on Mac, but you can use Syphon to send video to OBS, and then use the OBS Virtual Webcam output to the MediaPipe task. It's not the most elegant solution, but it works.

# Performance tips
If you are on a PC, you can greatly improve all CPU-based render times within TouchDesigner, including the MediaPipe tasks by disabling HyperThreading (Intel CPUs) or Simultaneous Multi-Threading (SMT - AMD CPUs). _On my laptop it was a 60-80% improvement._

Enabling/disabling HyperThreading is done in your system BIOS, so look up the instructions on how to do that for your computer. You can re-enable HyperThreading at any point if you want to go back and it is not a risky change to make to yous system.

# Building from source
This package uses yarn with vite inside node

## Installation
``` yarn install ```

## Development
``` yarn dev ```

## Build
``` yarn build ```
