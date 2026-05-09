# eKYC Attijari — React Native Mobile Application

A production-ready **Expo bare-workflow** React Native application implementing a full eKYC (electronic Know Your Customer) pipeline for Attijari Bank Tunisia. Features a native Tunisian CIN card scanner with OpenCV-powered C++ detection, ZXing barcode reader, and a Python/FastAPI LDRNet server for AI-based card corner detection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 React Native (Expo Bare Workflow)            │
│                                                             │
│  VisionCamera v4 ──► C++ CardDetector (JNI / OpenCV NDK)   │
│        │                  │                                 │
│        │            CardSideClassifier                      │
│        │            OfficialCINValidator                    │
│        │            LivePresenceValidator                   │
│        │            ScreenDetector                          │
│        │                                                    │
│        ▼                                                    │
│  FastAPI (LDRNet) ──► detect_and_warp ──► 1000×630 JPEG    │
│        │                                                    │
│        ▼                                                    │
│  BarcodeScannerModule (ZXing, Java, multi-strategy)         │
│        │                                                    │
│        ▼                                                    │
│  CINResultScreen ──► { CIN number, release date, face }    │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18.x | https://nodejs.org/ |
| npm | ≥ 9.x | bundled with Node |
| Java JDK | ≥ 17 | bundled with Android Studio |
| Android Studio | ≥ Hedgehog (2023.1.1) | https://developer.android.com/studio |
| Android SDK compileSdk | 36 | via SDK Manager |
| Android SDK minSdk | 24 | (Android 7.0+) |
| NDK (Side by side) | **27.1.12297006** | via SDK Manager → SDK Tools → NDK |
| CMake | ≥ 3.22 | via SDK Manager → SDK Tools → CMake |
| Python | 3.9 – 3.11 | for LDRNet server |
| OpenCV Android SDK | **4.10.0** | downloaded separately — see Step 5 |

> ⚠️ **Expo Go is NOT supported.** This project uses custom native modules (C++ NDK, Java JNI). You **must** build the APK.

---

## Step-by-Step Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/amentounsi/ekyc-ettijeri.git
cd ekyc-ettijeri
```

---

### Step 2 — Install JavaScript dependencies

```bash
npm install
```

---

### Step 3 — Configure Android environment variables

**Windows (PowerShell / System Environment):**
```
ANDROID_HOME = C:\Users\<your-username>\AppData\Local\Android\Sdk
```

Add to PATH:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\tools
```

**Linux / macOS (`~/.bashrc` or `~/.zshrc`):**
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Verify:
```bash
adb --version
```

---

### Step 4 — Install NDK and CMake via Android Studio

1. Open **Android Studio**
2. Go to **SDK Manager** → **SDK Tools** tab
3. Check:
   - ✅ **NDK (Side by side)** → select version `27.1.12297006`
   - ✅ **CMake** → select version `3.22.x`
4. Click **Apply**

---

### Step 5 — Download and place OpenCV Android SDK

> OpenCV is **~776 MB** and is excluded from git via `.gitignore`.

1. Go to: https://github.com/opencv/opencv/releases/tag/4.10.0
2. Download: `opencv-4.10.0-android-sdk.zip`
3. Extract it so the folder structure is:

```
ekyc-ettijeri/
└── android/
    └── app/
        └── src/
            └── main/
                └── cpp/
                    └── OpenCV-android-sdk/     ← place here
                        └── sdk/
                            ├── native/
                            │   ├── jni/        (contains OpenCVConfig.cmake)
                            │   └── libs/       (contains .so files per ABI)
                            └── java/
```

**Verify** the path is correct:
```
android/app/src/main/cpp/OpenCV-android-sdk/sdk/native/jni/OpenCVConfig.cmake
```
This file **must exist** or the CMake build will fail.

---

### Step 6 — Build the Android APK

```bash
cd android
./gradlew assembleDebug -x lint
```

On Windows:
```powershell
cd android
.\gradlew assembleDebug -x lint
```

First build takes **5–15 minutes** (compiling C++ with NDK). Subsequent builds are incremental.

Output APK:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

### Step 7 — Install on device

Connect your Android phone via USB with **USB debugging enabled**, then:

```bash
adb devices               # confirm device is listed
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or run directly (builds + installs + starts Metro):
```bash
# From project root (ekyc-ettijeri/)
npm run android
```

---

### Step 8 — Start the Metro bundler

```bash
# From project root
npx expo start --dev-client --port 8081
```

In another terminal, reverse the ADB port so the device can reach Metro:
```bash
adb reverse tcp:8081 tcp:8081
```

---

### Step 9 — Start the LDRNet Python server

The CIN scan screen sends each captured frame to a FastAPI server running LDRNet for precise corner detection.

**Clone the server repo:**
```bash
git clone https://github.com/amentounsi/ekyc-ldrnet.git
cd ekyc-ldrnet
```

**Install Python deps:**
```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS
pip install -r requirements.txt
```

**Place the model** (download from your team's shared link):
```
ekyc-ldrnet/
└── model_file/
    └── model-icdar-1.4/
        ├── saved_model.pb
        └── variables/
```

**Run:**
```bash
python main.py
```

---

### Step 10 — Configure the server IP in the app

Edit `src/services/validationService.ts`:

```typescript
// For Android emulator connecting to host machine:
const SERVER_URL = 'http://10.0.2.2:8000';

// For a physical device on the same Wi-Fi:
const SERVER_URL = 'http://192.168.X.X:8000';   // ← replace with your PC's LAN IP
```

**Find your PC's LAN IP:**
```bash
# Windows
ipconfig           # look for IPv4 Address under Wi-Fi

# Linux / macOS
ifconfig | grep "inet "
```

Make sure the phone and PC are on **the same Wi-Fi network**.

Also reverse the server port:
```bash
adb reverse tcp:8000 tcp:8000    # if using USB ADB (emulator or physical via USB)
```

---

## Project Structure

```
ekyc-attijeri/
├── App.tsx                          ← Navigation root
├── index.ts                         ← Entry point
├── package.json
├── babel.config.js
├── tsconfig.json
│
├── src/
│   ├── screens/
│   │   ├── CINScanScreen.tsx        ← Main CIN scanning UI (VisionCamera + state machine)
│   │   ├── CINResultScreen.tsx      ← Result display (photo, CIN number, date)
│   │   ├── CINGuideBackScreen.tsx   ← Back-side capture guide
│   │   ├── CINGuideFrontScreen.tsx  ← Front-side capture guide
│   │   ├── CINIntroScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── LivenessScreen.tsx       ← Phase 2 liveness check
│   │   └── ...
│   ├── components/
│   │   ├── CINScanFrame.tsx         ← Camera frame overlay
│   │   ├── CINFrameRecto.tsx        ← Front card guide overlay
│   │   ├── CINFrameVerso.tsx        ← Back card guide overlay
│   │   └── ...
│   ├── native/
│   │   ├── CardDetectorModule.ts    ← JS bridge to Java CardDetectorModule
│   │   └── BarcodeService.ts        ← JS bridge to Java BarcodeScannerModule
│   ├── frameProcessor/
│   │   └── detectCard.ts            ← VisionCamera frame processor plugin
│   ├── services/
│   │   └── validationService.ts     ← FastAPI client (LDRNet server calls)
│   ├── context/
│   │   └── AppContext.tsx
│   └── types/
│
└── android/
    └── app/
        └── src/main/
            ├── AndroidManifest.xml
            ├── java/com/attijari/ekyc/
            │   ├── MainActivity.kt
            │   ├── MainApplication.kt      ← Registers CardDetectorPackage + BarcodeScannerPackage
            │   ├── carddetector/
            │   │   ├── CardDetectorModule.java         ← React Native module (capture + warp)
            │   │   ├── CardDetectorJNI.java            ← JNI bridge to C++
            │   │   ├── CardDetectorFrameProcessor.java ← VisionCamera frame plugin
            │   │   ├── CardDetectorPackage.java
            │   │   └── CardDetectorPluginProvider.java
            │   └── barcode/
            │       ├── BarcodeScannerModule.java       ← Multi-strategy ZXing decoder
            │       └── BarcodeScannerPackage.java
            └── cpp/
                ├── CMakeLists.txt
                ├── CardDetector.cpp / .h               ← Core detection logic
                ├── CardDetectorJNI.cpp                 ← JNI entry points
                ├── warp/
                │   └── CardWarper.cpp / .h             ← Perspective warp + unsharp mask
                └── validation/
                    ├── CardSideClassifier.cpp / .h     ← Front/back classification
                    ├── OfficialCINValidator.cpp / .h   ← CIN format validation
                    ├── LivePresenceValidator.cpp / .h  ← Anti-spoof checks
                    └── ScreenDetector.cpp / .h         ← Screen/digital display rejection
```

---

## Scanning Pipeline — How It Works

```
VisionCamera Frame
      │
      ▼
CardDetectorFrameProcessor (Java)
      │  — blur score check (threshold: 14)
      │  — calls native C++ CardDetector via JNI
      ▼
CardDetector.cpp (C++ / OpenCV NDK)
      │  — edge detection, contour finding, corner extraction
      │  — LivePresenceValidator (glare, moiré check)
      │  — ScreenDetector (reject phone/monitor screens)
      │  — CardSideClassifier (front vs back)
      │  — OfficialCINValidator (layout checks)
      ▼  isValid=true → auto-capture trigger
CardDetectorModule.java
      │
      ▼
validationService.ts → POST /detect_and_warp → FastAPI LDRNet Server
      │  — LDRNet model: detect precise corners
      │  — Bounding-box crop + 5% padding
      │  — Deskew (minAreaRect affine warp)
      │  — Resize → 1000×630 px
      │  — CLAHE + adaptive gamma + unsharp mask
      │  — Side classify + CIN validate
      ▼  returns: { base64, side, is_cin }
CINScanScreen.tsx
      │  — capturedFrontImage / capturedBackImage stored in refs
      │
      ▼  (after back captured)
BarcodeScannerModule.java
      │  — Multi-strategy ZXing scan:
      │    S0: horizontal strip crop (bottom 20%)
      │    S1: full image, all orientations
      │    S2: enhanced contrast + threshold
      │    S3: grayscale normalized
      │    S4: full rotations fallback
      ▼
CINResultScreen.tsx
      — CIN number, release date, extracted face photo
```

---

## Common Build Errors & Fixes

### `CMake Error: OpenCV not found`
→ OpenCV SDK is missing. Re-do **Step 5**.

### `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
```bash
adb uninstall com.attijari.ekyc
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### `SDK location not found`
Create `android/local.properties`:
```
sdk.dir=C\:\\Users\\<your-username>\\AppData\\Local\\Android\\Sdk
```

### `Error: JAVA_HOME is not set`
Set JAVA_HOME to the JDK bundled with Android Studio:
```
JAVA_HOME = C:\Program Files\Android\Android Studio\jbr
```

### `Execution failed for task ':app:externalNativeBuildDebug'`
NDK version mismatch. Ensure NDK `27.1.12297006` is installed in Android Studio SDK Manager.

### `Metro: Unable to resolve module`
```bash
npm install
npx expo start --clear
```

### `Connection refused` (LDRNet server)
- Start `python main.py` in the server folder
- Check `SERVER_URL` in `validationService.ts` matches your PC's LAN IP
- Run `adb reverse tcp:8000 tcp:8000`

---

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react-native-vision-camera` | ^4.7.3 | Camera + frame processors |
| `react-native-worklets-core` | ^1.6.3 | JS worklet runtime |
| `react-native-reanimated` | ^3.19.5 | Animations |
| `expo` | ~54.0.33 | SDK |
| `react-native` | 0.81.5 | Framework |
| `com.google.zxing:core` | 3.5.2 | Barcode decoding |
| OpenCV Android SDK | 4.10.0 | Native image processing |

---

## Related Repositories

| Repo | Description |
|---|---|
| **This repo** — [ekyc-ettijeri](https://github.com/amentounsi/ekyc-ettijeri) | React Native mobile app |
| [ekyc-ldrnet](https://github.com/amentounsi/ekyc-ldrnet) | FastAPI Python server (LDRNet model) |

---

## License

Academic project — PFE (Projet de Fin d'Études), 2025–2026.
