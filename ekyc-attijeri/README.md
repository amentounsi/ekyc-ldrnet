# Attijari eKYC — React Native App

Mobile eKYC (electronic Know Your Customer) application for Attijari Bank Tunisia.  
Built with React Native (Expo bare workflow) + custom native Android modules (OpenCV NDK C++, ZXing).

---

## Project Status

| Phase | Feature | Status |
|-------|---------|--------|
| **Phase 1** | Tunisian CIN card scanning (Recto + Verso) | ✅ Complete |
| **Phase 1** | Native card detection (OpenCV C++ NDK) | ✅ Complete |
| **Phase 1** | Perspective warp to 1000×630 | ✅ Complete |
| **Phase 1** | Barcode scan from Verso (ZXing) | ✅ Complete |
| **Phase 1** | Face photo extraction from Recto | ✅ Complete |
| **Phase 1** | Blur gate (rejects blurry captures) | ✅ Complete |
| **Phase 2** | Liveness detection (MiniFASNet via FastAPI) | 🔄 Started |
| **Phase 3** | OCR on Recto text fields | ⬜ Planned |
| **Phase 4** | Backend integration & data submission | ⬜ Planned |

---

## Architecture

```
ekyc-attijeri/
├── App.tsx                          # Navigation root (React Navigation)
├── src/
│   ├── screens/
│   │   ├── CINScreen.tsx            # CIN scan orchestrator (scan → result)
│   │   ├── CINScanScreen.tsx        # Camera screen with frame processor
│   │   ├── CINResultScreen.tsx      # Displays captured front/back/face + barcode
│   │   ├── LivenessScreen.tsx       # Liveness detection (Phase 2)
│   │   ├── HomeScreen.tsx           # Dashboard
│   │   └── ...                      # Other app screens (Login, Form, Map, etc.)
│   ├── components/
│   │   ├── CINScanFrame.tsx         # Card overlay frame (guide user)
│   │   ├── CaptureTransition.tsx    # Flip/processing animations
│   │   └── ...
│   ├── hooks/
│   │   ├── useCardDetection.ts      # VisionCamera frame processor hook
│   │   └── useDetectionTimeout.ts
│   ├── native/
│   │   ├── CardDetectorModule.ts    # JS bridge to native card detector
│   │   └── BarcodeService.ts        # JS bridge to ZXing barcode scanner
│   ├── services/
│   │   └── validationService.ts
│   ├── constants/
│   │   ├── cinTheme.ts
│   │   ├── colors.ts
│   │   └── translations.ts          # Arabic/French/English strings
│   └── types/
│       ├── cardDetection.ts
│       └── barcode.ts
└── android/
    └── app/src/main/
        ├── java/com/attijari/ekyc/
        │   ├── carddetector/
        │   │   ├── CardDetectorModule.java       # RN native module (exposes detection to JS)
        │   │   ├── CardDetectorJNI.java          # JNI bridge
        │   │   └── CardDetectorFrameProcessor.java # VisionCamera frame processor plugin
        │   └── barcode/
        │       └── BarcodeScannerModule.java     # ZXing barcode scanner (18+ strategies)
        └── cpp/
            ├── CardDetectorJNI.cpp               # JNI bridge + capture state machine
            ├── CardDetector.cpp/.h               # 7-stage card detection pipeline (OpenCV)
            └── warp/
                └── CardWarper.cpp/.h             # Perspective warp + unsharp masking
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81.5 + Expo ~54 (bare workflow) |
| Camera | react-native-vision-camera v4.7.3 |
| Frame processor | react-native-worklets-core v1.6.3 |
| Native detection | OpenCV 4 (NDK C++17) |
| Barcode scanning | ZXing (Java, 18+ decode strategies) |
| Liveness | MiniFASNet via FastAPI Python server |
| Navigation | React Navigation v7 |
| Build | Gradle 8, NDK 27.1.12297006, CMake |

---

## Prerequisites

### System tools
- **Node.js** >= 18.x — https://nodejs.org/
- **npm** >= 9.x (included with Node)
- **Git** >= 2.30

### Android build (required for native modules)
- **Android Studio** >= Hedgehog (2023.1.1) — https://developer.android.com/studio
- **Android SDK** — `compileSdk 36`, `minSdk 24`, `targetSdk 35`
- **NDK version** `27.1.12297006` — install via SDK Manager → SDK Tools → NDK (Side by side)
- **CMake** >= 3.22 — install via SDK Manager → SDK Tools → CMake
- **JDK** 17+ (bundled with Android Studio)
- **ADB** (Android Debug Bridge) — included with Android SDK

### Environment variables
```bash
ANDROID_HOME=C:\Users\<you>\AppData\Local\Android\Sdk   # Windows
ANDROID_HOME=$HOME/Library/Android/sdk                  # macOS
```

### Liveness (Phase 2 — optional)
- **Python** >= 3.9
- FastAPI server running locally (see `LivenessScreen.tsx` for `API_URL`)

---

## Setup & Run

### 1. Install JS dependencies
```bash
cd ekyc-attijeri
npm install
```

### 2. Download OpenCV Android SDK (required — not in git, 776 MB)
The OpenCV SDK is excluded from the repository due to its size.  
Download it manually and place it in the correct location:

```bash
# Download OpenCV 4.10.0 Android SDK
# https://github.com/opencv/opencv/releases/tag/4.10.0
# File: opencv-4.10.0-android-sdk.zip

# Extract and rename:
# android/app/src/main/cpp/OpenCV-android-sdk/
```

The folder structure should be:
```
android/app/src/main/cpp/OpenCV-android-sdk/
    sdk/
        native/
            libs/
                arm64-v8a/
                    libopencv_java4.so
                    ...
            jni/
                include/
                    opencv2/
                        ...
        java/
            ...
```

### 3. Build the Android app (first time / after native changes)
```bash
cd android
./gradlew assembleDebug -x lint
```
Build output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 3. Install on physical device
```bash
adb devices                          # confirm device is connected
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### 4. Start Metro bundler
```bash
cd ..                                # back to ekyc-attijeri/
adb reverse tcp:8081 tcp:8081        # route Metro traffic to device
npx expo start --dev-client --port 8081
```

### 5. Launch on device
The app will auto-connect to Metro. If not, shake the device → "Reload".

---

## Native Module Overview (Phase 1)

### Card Detection Pipeline (`CardDetector.cpp`)

7-stage OpenCV pipeline running at ~15 FPS on every camera frame (throttled via `kMinProcessIntervalMs`).  
Source: `android/app/src/main/cpp/CardDetector.cpp`

#### Stage 0 — Overlay-Guided ROI Extraction
- If `config_.overlay.enabled && config_.useROICropping`, the full frame is cropped to the overlay rectangle before detection.
- Reduces false positives from background clutter; the ROI offset is added back to all output corners.

#### Stage 1 — Preprocessing (`preprocessFrame`)
- Convert to grayscale (input arrives as YUV gray plane from VisionCamera).
- **Adaptive CLAHE**: skipped if `stddev < 35`; `clipLimit=1.2` if `35–55`; `clipLimit=1.5` if `>55`.
- **GaussianBlur** with kernel size from `config_.gaussianBlurSize`.
- **Adaptive Canny**: low/high thresholds derived from the median pixel value of the central 40% ROI (`cannyMedianLow`, `cannyMedianHigh` in config).
- **3×3 dilate** (single pass) to close small edge gaps.
- Raw Canny edges saved to `cannyEdges_` before dilation (used by Stage 3 edge density check).

#### Stage 2 — Contour Extraction (`extractContours`)
- `cv::findContours` with `RETR_LIST` (not `RETR_EXTERNAL` — needed so the card contour is visible even when the card is held in hand; EXTERNAL returns only the hand silhouette).
- Pre-filter by area: keep contours in `[minAreaRatio×0.5, maxAreaRatio]`.
- Quick-score each contour: `0.2×areaScore + 0.3×convexQuad + 0.4×aspectRatioScore + 0.1×centerProximity`.
- Return top-N by quick-score (configurable via `config_.topN`).

#### Stage 3 — Geometric Ranking (`rankContours`)
- For each contour, try `approxPolyDP` with `epsilon` from `0.01→0.06` (step 0.005), keep best 4-vertex convex result.
- Fallback: convex hull → `approxPolyDP`.
- Filters: area ratio in range, aspect ratio within `config_.aspectRatioTolerance` of target (`85.6/54 ≈ 1.585`), portrait orientation also accepted (`1/1.585`).
- **Edge density check**: sample 20 points per side; require Canny edge pixel within ±3px of each sample. Returns the **second-lowest** side density (tolerates one weak/occluded side, rejects desk/door blobs that have edges on only 1–2 sides).

#### Stage 4 — Best Candidate Selection (`selectBestCandidate`)
- Weighted score: `wArea×areaScore + wRatio×ratioScore + wRectangularity×rectScore + wEdgeDensity×edgeScore + wCenter×centerScore`
- Rectangularity = `1 − avg|cos(interior angle)| × 2` (perfect rectangle → all cos ≈ 0).

#### Stage 5 — Multi-Level Geometric Validation
- **5a** Geometry gate: `score ≥ minGeometryScore`, area in `[minAreaRatio, maxAreaRatio]`.
- **5b** Physical plausibility: without overlay, reject if `areaRatio > 0.20` (PC screen / desk fills frame).
- **5c** Border contrast: sample 30 points per side; measure `|grayInner − grayOuter|` at ±4px from each side; score = `meanContrast / borderContrastNorm`. Low contrast → not a white card.
- **5d** Overlay constraints (when overlay enabled): area closeness to overlay, center alignment, overlap ratio — with hysteresis (relaxed thresholds in `LOCKED` state for stability).
- **5e** Appearance validation: perspective-warp quad to `appearanceWarpWidth × appearanceWarpHeight`, compute mean/stddev of gray; reject if too dark (`mean < appearanceMeanMin`), too textured (`stddev > appearanceStddevMax`), or dark+textured combined.

#### Stage 6 — Red Corner Validation (`validateRedCorners`) — Recto only
- **Used for Recto (front) only.** Disabled for Verso (back) via `config_.redValidationEnabled = false`.
- Checks all 4 corners of the quad for the Tunisian flag (red block in one corner).
- Per-corner test (adaptive to scene luminance):
  - `redRatio ≥ adaptMinRed` (0.06→0.15 based on mean luminance)
  - `compactness ≥ 0.45` (red forms a solid block, not scattered pixels like a wallpaper)
  - `bboxFill ≥ 0.12` (bbox covers meaningful part of zone)
  - If bright scene (`t > 0.4`): also requires `whiteRatio ≥ 0.08`
- **Uniqueness check**: exactly 1–2 valid corners accepted. 3–4 → rejected (PC screen / wallpaper with red spread across image).
- Final confidence: `geo×0.5 + border×0.3 + red×0.2` (Recto) or `geo×0.625 + border×0.375` (Verso, red weight redistributed).

#### Stage 7 — Temporal Buffer
- Circular buffer of size `config_.temporalBufferSize` (default 5).
- Requires `config_.temporalMinValid` consecutive valid frames (default 4/5) before emitting a detection.
- **Detection state machine**: `SEARCHING → ALIGNING → LOCKED`
  - `LOCKED` state uses relaxed overlay thresholds (hysteresis).
  - After `config_.lockedFailFramesToReset` consecutive failures, resets to `SEARCHING`.
- Call `resetTemporalState()` when switching from Recto to Verso scan (already done in `CardDetectorJNI.cpp`).

#### Key Configuration Notes (for future changes)
| Parameter | Current value | Notes |
|-----------|--------------|-------|
| `BLUR_THRESHOLD` | `22.f` | Laplacian variance in `CardDetectorJNI.cpp`. Tuned for 1280×720. |
| `targetAspectRatio` | `1.585` | CIN card is 85.6mm × 54mm |
| `processWidth` | `640` | Frame downscaled to 640px wide before detection |
| Camera resolution | `1280×720` | Set via `useCameraFormat` in `CINScanScreen.tsx` |
| Warp output size | `1000×630` | Set in `CardWarper.cpp` |
| Barcode strip | bottom 10% | Strip `y = height * 0.90` in `BarcodeScannerModule.java` |

### Perspective Warp (`CardWarper.cpp`)
- Output: 1000×630 grayscale
- Post-warp: unsharp masking (`1.8 × warped − 0.8 × GaussianBlur(σ=1.5)`)
- Blur gate: Laplacian variance threshold = 22 (blocks blurry captures before accepting)

### Barcode Scanner (`BarcodeScannerModule.java`)
- 18+ ZXing decode strategies: different crop regions, scales (1×–8×), Otsu thresholding
- Barcode location: bottom ~10% of 1000×630 back image
- **Critical**: Laplacian sharpening is NOT applied — it corrupts bar-width ratios and breaks ZXing decoding. Only contrast enhancement + Otsu thresholding are used.

---

## Liveness Detection (Phase 2 — in progress)

`LivenessScreen.tsx` already has a working skeleton:
- Uses `expo-camera` (not VisionCamera) to capture frames
- Calls a FastAPI server running MiniFASNet
- Threshold: 0.60, 3 frames per attempt

**To configure:** update `API_URL` in `LivenessScreen.tsx` to your FastAPI server IP.

The FastAPI server code is separate and NOT included in this repo.  
It should expose: `POST /predict` accepting a base64 frame and returning `{ score: float }`.

---

## Useful Commands

```bash
# Full rebuild after native C++ changes (NDK)
cd android && ./gradlew assembleDebug -x lint

# Fresh install (required after changing package name or native modules)
adb uninstall com.attijari.ekyc
adb install android/app/build/outputs/apk/debug/app-debug.apk

# View native logs (card detector)
adb logcat -s CardDetectorJNI:I CardDetector:I

# View barcode scanner logs
adb logcat -s BarcodeScannerModule:*

# View blur scores in real time
adb logcat | grep BLUR
```

---

## App Navigation Flow

```
SplashScreen
    └── LoginScreen / RegisterScreen / OTPScreen
            └── HomeScreen (dashboard)
                    ├── CINScreen          ← Phase 1 ✅
                    │     ├── CINScanScreen (camera + detection)
                    │     └── CINResultScreen (review captured data)
                    ├── LivenessScreen     ← Phase 2 🔄
                    ├── FormScreen
                    ├── SignatureScreen
                    ├── RecapScreen
                    └── ...
```

---

## Package Name & Bundle ID

- Android: `com.attijari.ekyc`
- App name: `AttijariEKYC`

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/phase2-liveness`
3. Make your changes and test on a physical Android device (emulators don't support camera frame processors)
4. Commit: `git commit -m "feat: implement liveness detection"`
5. Push and open a Pull Request


- `src/screens`: ecrans de l'application
- `src/components`: composants reutilisables
- `src/context`: gestion d'etat globale
- `src/constants`: constantes (couleurs, traductions)
