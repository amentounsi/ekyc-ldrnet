# CIN Card Scan — Integration Guide

**Context:** React Native (Expo + bare workflow) app using `@react-navigation/native-stack`. The repo is at `https://github.com/amentounsi/ekyc-ettijeri.git` inside the `ekyc-attijeri/` folder. This guide covers integrating **only** the "Scan your CIN card" feature into an existing app without touching any other screens, navigation, or business logic.

---

## What the feature does

When the user presses the "Scan your card" button, they are navigated to a screen called `CINScreen`. This screen is a **self-contained orchestrator** that manages its own internal sub-flow:

```
intro → guide_front → scanning_front → guide_back → scanning_back → processing → result
```

- **intro**: Welcome/instructions screen
- **guide_front**: Animated guide showing how to hold the front of the card
- **scanning_front**: Camera opens, OpenCV C++ native module detects and auto-captures the front face of the CIN card
- **guide_back**: Guide for the back
- **scanning_back**: Camera captures the back of the card
- **processing**: Animated progress screen that also runs barcode scan (ZXing PDF417) asynchronously
- **result**: Shows captured images + parsed barcode data + face photo

When the user confirms the result, `CINScreen` calls `navigation.navigate('Liveness', { cinData: { frontImage, backImage, facePhoto, barcodeData } })`. If your next step is not named `Liveness`, adapt just that one line.

---

## Step 1 — Copy source files

From the repo `ekyc-attijeri/` folder, copy these files/folders **exactly** into your project (same relative paths from your `src/`):

**Screens (all required):**
- `src/screens/CINScreen.tsx`
- `src/screens/CINIntroScreen.tsx`
- `src/screens/CINGuideFrontScreen.tsx`
- `src/screens/CINGuideBackScreen.tsx`
- `src/screens/CINScanScreen.tsx`
- `src/screens/CINProcessingScreen.tsx`
- `src/screens/CINResultScreen.tsx`

**Components (all required):**
- `src/components/CINScanFrame.tsx`
- `src/components/CaptureTransition.tsx`
- `src/components/AttijariLogo.tsx`
- `src/components/CompletionRing.tsx`
- `src/components/RippleRing.tsx`
- `src/components/StepCard.tsx`
- `src/components/Toast.tsx`
- `src/components/TimeoutReminder.tsx`

**Native bridges (TypeScript wrappers only):**
- `src/native/CardDetectorModule.ts`
- `src/native/BarcodeService.ts`

**Frame processor:**
- `src/frameProcessor/detectCard.ts`

**Hooks:**
- `src/hooks/useCardDetection.ts`
- `src/hooks/useDetectionTimeout.ts`

**Services:**
- `src/services/validationService.ts`

**Types:**
- `src/types/barcode.ts`
- `src/types/cardDetection.ts`

**Constants:**
- `src/constants/cinTheme.ts`
- `src/constants/colors.ts`
- `src/constants/translations.ts`

**Context** (only if you don't have `AppContext` already):
- `src/context/AppContext.tsx`

> If you already have an `AppContext`, note that the CIN screens (`CINScreen` and its sub-screens) use `cinTheme.ts` constants directly and do **not** depend on `AppContext`. Only `HomeScreen` uses `AppContext`. The CIN screens are safe regardless.

---

## Step 2 — Copy the entire Android native module

The card detection runs via C++ + JNI + Java. Copy the entire Android native layer:

```
android/app/src/main/cpp/CardDetector.h
android/app/src/main/cpp/CardDetector.cpp
android/app/src/main/cpp/CardDetectorJNI.cpp
android/app/src/main/cpp/CMakeLists.txt
android/app/src/main/cpp/warp/           ← entire folder
android/app/src/main/cpp/validation/     ← entire folder

android/app/src/main/java/com/attijari/ekyc/carddetector/CardDetectorJNI.java
android/app/src/main/java/com/attijari/ekyc/carddetector/CardDetectorModule.java
android/app/src/main/java/com/attijari/ekyc/carddetector/CardDetectorPackage.java

android/app/src/main/java/com/attijari/ekyc/barcode/BarcodeModule.java
android/app/src/main/java/com/attijari/ekyc/barcode/BarcodePackage.java
```

> **Important:** `CardDetector.cpp` and `CardDetectorJNI.cpp` depend on OpenCV. The OpenCV Android SDK (776 MB) is **not** in git (excluded by `.gitignore`). You must download it separately:
> - Download OpenCV Android SDK 4.10.0 from: https://github.com/opencv/opencv/releases/tag/4.10.0
> - Extract it so the path is exactly: `android/app/src/main/cpp/OpenCV-android-sdk/`

---

## Step 3 — Register the native modules in MainApplication

Open your `android/app/src/main/java/com/[yourpackage]/MainApplication.kt` (or `.java`). In the `getPackages()` list, add:

```kotlin
import com.attijari.ekyc.carddetector.CardDetectorPackage
import com.attijari.ekyc.barcode.BarcodePackage

// inside getPackages():
packages.add(CardDetectorPackage())
packages.add(BarcodePackage())
```

> If your package name is different from `com.attijari.ekyc`, update the package declarations at the top of each Java/Kotlin file to match yours, **and** update the JNI function names in `CardDetectorJNI.cpp`. The JNI function names follow the pattern:
> `Java_<package_with_underscores>_carddetector_CardDetectorJNI_<methodName>`
>
> For example, if your package is `com.myapp.ekyc`, all JNI functions must start with:
> `Java_com_myapp_ekyc_carddetector_CardDetectorJNI_`

---

## Step 4 — Update `android/app/build.gradle`

Check `android/app/build.gradle` from the repo and ensure your own `build.gradle` has the following additions:

**1. CMake configuration inside `android { defaultConfig { } }`:**
```gradle
externalNativeBuild {
    cmake {
        cppFlags "-std=c++17 -frtti -fexceptions"
        abiFilters "arm64-v8a"
    }
}
```

**2. CMakeLists link inside `android { }`:**
```gradle
externalNativeBuild {
    cmake {
        path "src/main/cpp/CMakeLists.txt"
        version "3.22.1"
    }
}
```

**3. ZXing dependency in `dependencies { }`:**
```gradle
implementation 'com.google.zxing:core:3.5.2'
```

---

## Step 5 — Camera permissions in AndroidManifest.xml

Make sure `android/app/src/main/AndroidManifest.xml` contains:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

---

## Step 6 — Install JS/TS dependencies

Check your `package.json` against `ekyc-attijeri/package.json`. The CIN scan feature requires these packages — add any that are missing:

```
react-native-vision-camera        (v4.7.x)
react-native-worklets-core
react-native-reanimated            (compatible with RN 0.81+)
react-native-svg
expo-haptics
react-native-safe-area-context
@react-navigation/native-stack
```

After adding them run:
```bash
npm install
npx expo prebuild   # only if using Expo managed workflow
```

Also ensure `react-native-reanimated` plugin is listed in `babel.config.js`:
```js
plugins: ['react-native-reanimated/plugin']
```

---

## Step 7 — Add `CINScreen` to your navigator

In your `App.tsx` (or wherever your `Stack.Navigator` is defined):

```tsx
import { CINScreen } from './src/screens/CINScreen';

// Inside <Stack.Navigator>:
<Stack.Screen name="CIN" component={CINScreen} />
```

Add `CIN` to your `RootStackParamList` type:
```typescript
type RootStackParamList = {
  // ... your existing screens ...
  CIN: undefined;
};
```

---

## Step 8 — Trigger it from your button

Wherever your "Scan your card" button is, navigate to it:
```tsx
navigation.navigate('CIN');
```

---

## Step 9 — Handle the output

When the scan is complete and the user confirms, `CINScreen` internally calls:
```typescript
navigation.navigate('Liveness', {
  cinData: {
    frontImage:  { base64: string; width: number; height: number },
    backImage:   { base64: string; width: number; height: number },
    facePhoto:   { base64: string; width: number; height: number } | null,
    barcodeData: CINBarcodeData | null,  // see src/types/barcode.ts
  }
});
```

If your next screen after CIN is **not** named `Liveness`, open `src/screens/CINScreen.tsx`, find the `handleConfirm` callback (around line 120), and change `'Liveness'` to your next screen's route name.

---

## What NOT to touch

- Do not modify your existing `App.tsx` beyond adding the `CIN` screen to the navigator
- Do not modify your existing screens (Home, Login, Register, OTP, etc.)
- Do not modify your existing `AppContext` if you have one — the CIN screens don't depend on it
- Do not touch existing `android/app/build.gradle` blocks — only **add** the cmake/ZXing parts
- The `screenss/` folder (HTML mockups) and `.md` files at root are documentation only — ignore them

---

## Build & test

```powershell
# Build APK
cd android
.\gradlew app:assembleDebug -x lint

# Install on connected device
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb reverse tcp:8081 tcp:8081

# Start Metro bundler
cd ..
npx expo start --dev-client --port 8081
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `nativePrepareBackScan` not found at runtime | Check JNI function names match your package name in `CardDetectorJNI.cpp` |
| Build error: OpenCV not found | Ensure OpenCV SDK is extracted to `android/app/src/main/cpp/OpenCV-android-sdk/` |
| Camera shows black screen | Check `CAMERA` permission in manifest and that VisionCamera is installed correctly |
| Reanimated worklet crash | Ensure `react-native-reanimated/plugin` is in `babel.config.js` |
| Back card not detected (no green frame) | Handled automatically by `prepareBackScan()` on mount — ensure the native module is registered in `MainApplication` |
| Metro bundler not connecting | Run `adb reverse tcp:8081 tcp:8081` after installing the APK |
