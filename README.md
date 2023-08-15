# MediaPipe TouchDesigner Plugin
A GPU Accelerated, self-contained, [MediaPipe](https://developers.google.com/mediapipe) Plugin for TouchDesigner that runs on Mac and PC with no installation. This project currently supports all major MediaPipe models except interactive segmentation.

<img width="1053" alt="Screenshot 2023-08-14 at 2 16 44 PM" src="https://github.com/torinmb/mediapipe-touchdesigner/assets/6014011/8f7a9eb9-fa7a-4d9b-b541-bb9c6c4e0e88">


# Setup
Download the latest release.zip from the [Release Section](https://github.com/torinmb/mediapipe-touchdesigner/tags). Open up the MediaPipe TouchDesigner.toe file. If you move the project to another folder make sure that the associated folders are in the same directory as your MediaPipe TouchDesigner.toe. If there are any network problems you can it the Reset button on the MediaPipe component.

On the MediaPipe component once it's loaded you can select your webcam from the drop-down. You can turn on and off the different MediaPipe models as well as preview overlays. There're also sub-menus available for each model to customize them further.


![image-1](https://github.com/torinmb/mediapipe-touchdesigner/assets/6014011/ffb65b9b-e916-45ee-87fc-af7480cc2ac6)


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

The media should appear with no frames of delay!

### Syphon on Mac
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

Enabling/disabling HyperThreading is done in your system BIOS, so look up the instructions on how to do that for your computer. You can re-enable HyperThreading at any point if you want to go back and it is not a risky change to make to yous system.

# Building from source
This package uses yarn with vite inside node

## Installation
``` yarn install ```

## Development
``` yarn dev ```

## Build
``` yarn build ```


## Version Update / Release
```yarn version --patch --message "Bump to version %s"```

--patch will bump the version by 0.0.1

--minor will bump the version by 0.1.0

--major will bump the version by 1.0.0

There's a Github Action that will bundle the entire project and create a release on Github. Your commit message will become the description of the release.
