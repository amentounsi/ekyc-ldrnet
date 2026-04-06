package com.pfeprojet.carddetector;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.module.annotations.ReactModule;

/**
 * React Native Module for Card Detection
 * Exposes card detection functionality to JavaScript
 */
@ReactModule(name = CardDetectorModule.NAME)
public class CardDetectorModule extends ReactContextBaseJavaModule {
    
    public static final String NAME = "CardDetectorModule";
    private boolean isInitialized = false;
    
    public CardDetectorModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Override
    @NonNull
    public String getName() {
        return NAME;
    }
    
    /**
     * Initialize the card detector
     * Must be called before using detection
     */
    @ReactMethod
    public void initialize(Promise promise) {
        try {
            if (!isInitialized) {
                CardDetectorJNI.nativeInit();
                isInitialized = true;
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", "Failed to initialize CardDetector: " + e.getMessage());
        }
    }
    
    /**
     * Release native resources
     */
    @ReactMethod
    public void release(Promise promise) {
        try {
            if (isInitialized) {
                CardDetectorJNI.nativeRelease();
                isInitialized = false;
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("RELEASE_ERROR", "Failed to release CardDetector: " + e.getMessage());
        }
    }
    
    /**
     * Update detection configuration
     */
    @ReactMethod
    public void setConfig(
        int cannyLow,
        int cannyHigh,
        int blurSize,
        double minArea,
        double maxArea,
        double targetRatio,
        double ratioTolerance,
        Promise promise
    ) {
        try {
            if (!isInitialized) {
                promise.reject("NOT_INITIALIZED", "CardDetector not initialized");
                return;
            }
            
            CardDetectorJNI.nativeSetConfig(
                cannyLow,
                cannyHigh,
                blurSize,
                (float) minArea,
                (float) maxArea,
                (float) targetRatio,
                (float) ratioTolerance
            );
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("CONFIG_ERROR", "Failed to set config: " + e.getMessage());
        }
    }
    
    /**
     * Set overlay-guided detection bounds
     */
    @ReactMethod
    public void setOverlay(
        boolean enabled,
        double x,
        double y,
        double width,
        double height,
        boolean useROICropping,
        Promise promise
    ) {
        try {
            if (!isInitialized) {
                promise.reject("NOT_INITIALIZED", "CardDetector not initialized");
                return;
            }
            
            CardDetectorJNI.nativeSetOverlay(
                enabled,
                (float) x,
                (float) y,
                (float) width,
                (float) height,
                useROICropping
            );
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OVERLAY_ERROR", "Failed to set overlay: " + e.getMessage());
        }
    }
    
    /**
     * Set scan mode for card detection
     * @param mode "FRONT" (requires red flag) or "BACK" (no red flag needed)
     */
    @ReactMethod
    public void setScanMode(String mode, Promise promise) {
        try {
            if (!isInitialized) {
                promise.reject("NOT_INITIALIZED", "CardDetector not initialized");
                return;
            }
            
            int modeInt = "BACK".equalsIgnoreCase(mode) ? 1 : 0;
            CardDetectorJNI.nativeSetScanMode(modeInt);
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SCAN_MODE_ERROR", "Failed to set scan mode: " + e.getMessage());
        }
    }
    
    /**
     * Check if detector is initialized
     */
    @ReactMethod
    public void isInitialized(Promise promise) {
        promise.resolve(isInitialized);
    }
    
    /**
     * Get the last warped image as Base64 PNG
     * Available after successful detection when state is LOCKED
     */
    @ReactMethod
    public void getWarpedImage(Promise promise) {
        try {
            int[] dimensions = CardDetectorJNI.nativeGetWarpedImageDimensions();
            int width = dimensions[0];
            int height = dimensions[1];
            
            if (width == 0 || height == 0) {
                promise.resolve(null);
                return;
            }
            
            byte[] imageData = CardDetectorJNI.nativeGetWarpedImage();
            if (imageData == null) {
                promise.resolve(null);
                return;
            }
            
            // Create bitmap from RGBA data
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(
                width, height, android.graphics.Bitmap.Config.ARGB_8888
            );
            java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(imageData);
            bitmap.copyPixelsFromBuffer(buffer);
            
            // Convert to Base64 PNG
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos);
            String base64Image = android.util.Base64.encodeToString(
                baos.toByteArray(), android.util.Base64.NO_WRAP
            );
            
            WritableMap result = Arguments.createMap();
            result.putString("base64", base64Image);
            result.putInt("width", width);
            result.putInt("height", height);
            
            promise.resolve(result);
            
            // Clean up
            bitmap.recycle();
            baos.close();
            
        } catch (Exception e) {
            promise.reject("WARP_ERROR", "Failed to get warped image: " + e.getMessage());
        }
    }
    
    /**
     * Classify the warped card image as FRONT, BACK, or UNKNOWN
     * Phase 2 - Recto/Verso Classification
     */
    @ReactMethod
    public void classifyCardSide(Promise promise) {
        try {
            float[] result = CardDetectorJNI.nativeClassifyCardSide();
            
            if (result == null || result.length < 14) {
                promise.resolve(null);
                return;
            }
            
            WritableMap map = Arguments.createMap();
            
            // Convert side enum to string (0=FRONT, 1=BACK, 2=UNKNOWN)
            int sideInt = (int) result[0];
            String side;
            switch (sideInt) {
                case 0:  side = "FRONT"; break;
                case 1:  side = "BACK"; break;
                default: side = "UNKNOWN"; break;
            }
            
            map.putString("side", side);
            map.putDouble("confidence", result[1]);
            
            // Flag detection
            map.putBoolean("flagDetected", result[2] > 0.5);
            map.putDouble("flagRedRatio", result[3]);
            
            // Photo texture
            map.putBoolean("photoTextureDetected", result[4] > 0.5);
            map.putDouble("photoStddev", result[5]);
            
            // Barcode detection
            map.putBoolean("barcodeDetected", result[6] > 0.5);
            map.putDouble("barcodeEdgeDensity", result[7]);
            
            // Fingerprint detection
            map.putBoolean("fingerprintDetected", result[8] > 0.5);
            map.putDouble("fingerprintStddev", result[9]);
            
            // Overall
            map.putDouble("meanBrightness", result[10]);
            map.putBoolean("brightEnough", result[11] > 0.5);
            
            // MRZ detection
            map.putBoolean("mrzDetected", result[12] > 0.5);
            map.putDouble("mrzEdgeDensity", result[13]);
            
            promise.resolve(map);
            
        } catch (Exception e) {
            promise.reject("CLASSIFY_ERROR", "Failed to classify card side: " + e.getMessage());
        }
    }
    
    /**
     * Validate the warped card image layout against official CIN structure
     * Phase 3 - Structural Layout Validation
     * @param side "FRONT" or "BACK"
     */
    @ReactMethod
    public void validateLayout(String side, Promise promise) {
        try {
            int sideInt = "BACK".equalsIgnoreCase(side) ? 1 : 0;
            float[] result = CardDetectorJNI.nativeValidateLayout(sideInt);

            if (result == null || result.length < 8) {
                promise.resolve(null);
                return;
            }

            WritableMap map = Arguments.createMap();
            map.putBoolean("valid", result[0] > 0.5);
            map.putDouble("score", result[1]);

            if (sideInt == 0) {
                // FRONT zones
                map.putDouble("flagScore", result[2]);
                map.putDouble("logoScore", result[3]);
                map.putDouble("photoScore", result[4]);
                map.putDouble("headerScore", result[5]);
                map.putDouble("idNumberScore", result[6]);
                map.putDouble("brightnessScore", result[7]);
            } else {
                // BACK zones
                map.putDouble("fingerprintScore", result[2]);
                map.putDouble("barcodeScore", result[3]);
                map.putDouble("stampScore", result[4]);
                map.putDouble("textScore", result[5]);
                map.putDouble("brightnessScore", result[6]);
            }

            promise.resolve(map);

        } catch (Exception e) {
            promise.reject("LAYOUT_ERROR", "Failed to validate layout: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Phase 4: Presence Validation (Anti-Spoof / Liveness)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Push the current frame snapshot into the presence ring buffer.
     * Call once per detection cycle when layout is valid and side is locked.
     */
    @ReactMethod
    public void pushPresenceFrame(Promise promise) {
        try {
            CardDetectorJNI.nativePushPresenceFrame();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("PRESENCE_PUSH_ERROR", "Failed to push presence frame: " + e.getMessage());
        }
    }

    /**
     * Evaluate liveness from the buffered frame snapshots.
     * Returns live verdict + per-test scores.
     */
    @ReactMethod
    public void evaluatePresence(Promise promise) {
        try {
            float[] result = CardDetectorJNI.nativeEvaluatePresence();

            if (result == null || result.length < 12) {
                promise.resolve(null);
                return;
            }

            WritableMap map = Arguments.createMap();
            map.putBoolean("live", result[0] > 0.5);
            map.putDouble("totalScore", result[1]);
            map.putDouble("homographyScore", result[2]);
            map.putDouble("highlightScore", result[3]);
            map.putDouble("approachScore", result[4]);
            map.putBoolean("spoofDetected", result[5] > 0.5);
            map.putBoolean("screenFFT", result[6] > 0.5);
            map.putBoolean("subpixelGrid", result[7] > 0.5);
            map.putBoolean("paperPrint", result[8] > 0.5);
            map.putBoolean("displayFlicker", result[9] > 0.5);
            map.putBoolean("temporalNoise", result[10] > 0.5);
            map.putBoolean("surfaceSmooth", result[11] > 0.5);

            promise.resolve(map);

        } catch (Exception e) {
            promise.reject("PRESENCE_EVAL_ERROR", "Failed to evaluate presence: " + e.getMessage());
        }
    }

    /**
     * Reset the presence validator's ring buffer.
     * Call on side switch, detection loss, or after capture.
     */
    @ReactMethod
    public void resetPresence(Promise promise) {
        try {
            CardDetectorJNI.nativeResetPresence();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("PRESENCE_RESET_ERROR", "Failed to reset presence: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // AUTO-CAPTURE: State Machine (Recto → Verso Flow)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get the current capture state.
     * @return state: "WAIT_FRONT", "WAIT_BACK", or "FINISHED"
     */
    @ReactMethod
    public void getCaptureState(Promise promise) {
        try {
            int state = CardDetectorJNI.nativeGetCaptureState();
            String stateStr;
            switch (state) {
                case 0:  stateStr = "WAIT_FRONT"; break;
                case 1:  stateStr = "WAIT_BACK"; break;
                case 2:  stateStr = "FINISHED"; break;
                default: stateStr = "UNKNOWN"; break;
            }
            promise.resolve(stateStr);
        } catch (Exception e) {
            promise.reject("STATE_ERROR", "Failed to get capture state: " + e.getMessage());
        }
    }

    /**
     * Reset the capture sequence to start fresh.
     * Clears both captured images and resets to WAIT_FRONT state.
     */
    @ReactMethod
    public void resetCaptureSequence(Promise promise) {
        try {
            CardDetectorJNI.nativeResetCaptureSequence();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("RESET_ERROR", "Failed to reset capture sequence: " + e.getMessage());
        }
    }

    /**
     * Attempt to auto-capture based on current state and detected side.
     * This is the main entry point for the automatic recto→verso flow.
     *
     * @param side "FRONT", "BACK", or "UNKNOWN"
     * @param layoutValid true if layout validation passed
     */
    @ReactMethod
    public void autoCapture(String side, boolean layoutValid, Promise promise) {
        try {
            int sideInt;
            switch (side.toUpperCase()) {
                case "FRONT": sideInt = 0; break;
                case "BACK":  sideInt = 1; break;
                default:      sideInt = 2; break; // UNKNOWN
            }

            float[] result = CardDetectorJNI.nativeAutoCapture(sideInt, layoutValid ? 1 : 0);

            if (result == null || result.length < 4) {
                promise.resolve(null);
                return;
            }

            WritableMap map = Arguments.createMap();
            map.putBoolean("captured", result[0] > 0.5);

            int stateInt = (int) result[1];
            String stateStr;
            switch (stateInt) {
                case 0:  stateStr = "WAIT_FRONT"; break;
                case 1:  stateStr = "WAIT_BACK"; break;
                case 2:  stateStr = "FINISHED"; break;
                default: stateStr = "UNKNOWN"; break;
            }
            map.putString("state", stateStr);
            map.putBoolean("frontReady", result[2] > 0.5);
            map.putBoolean("backReady", result[3] > 0.5);

            promise.resolve(map);

        } catch (Exception e) {
            promise.reject("AUTOCAPTURE_ERROR", "Failed to auto-capture: " + e.getMessage());
        }
    }

    /**
     * Get the captured FRONT (recto) image as Base64 PNG.
     */
    @ReactMethod
    public void getCapturedFront(Promise promise) {
        try {
            byte[] imageData = CardDetectorJNI.nativeGetCapturedFront();
            if (imageData == null) {
                promise.resolve(null);
                return;
            }

            // Create bitmap from RGBA data (1000x630)
            int width = 1000;
            int height = 630;
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(
                width, height, android.graphics.Bitmap.Config.ARGB_8888
            );
            java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(imageData);
            bitmap.copyPixelsFromBuffer(buffer);

            // Convert to Base64 PNG
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos);
            String base64Image = android.util.Base64.encodeToString(
                baos.toByteArray(), android.util.Base64.NO_WRAP
            );

            WritableMap result = Arguments.createMap();
            result.putString("base64", base64Image);
            result.putInt("width", width);
            result.putInt("height", height);

            promise.resolve(result);

            bitmap.recycle();
            baos.close();

        } catch (Exception e) {
            promise.reject("CAPTURE_FRONT_ERROR", "Failed to get captured front: " + e.getMessage());
        }
    }

    /**
     * Extract the face photo from the captured FRONT image.
     * Uses fixed crop ratios based on official Tunisian CIN layout.
     * Warped image is 1000x630: face is in the left portion.
     */
    @ReactMethod
    public void extractFacePhoto(Promise promise) {
        try {
            byte[] imageData = CardDetectorJNI.nativeGetCapturedFront();
            if (imageData == null) {
                promise.resolve(null);
                return;
            }

            // Create full card bitmap from RGBA data (1000x630)
            int cardW = 1000;
            int cardH = 630;
            android.graphics.Bitmap cardBitmap = android.graphics.Bitmap.createBitmap(
                cardW, cardH, android.graphics.Bitmap.Config.ARGB_8888
            );
            java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(imageData);
            cardBitmap.copyPixelsFromBuffer(buffer);

            // Face region on Tunisian CIN (normalized ratios)
            // Face photo is in the left side, below the header
            float faceLeftRatio   = 0.02f;
            float faceTopRatio    = 0.28f;
            float faceRightRatio  = 0.27f;
            float faceBottomRatio = 0.85f;

            int faceX = (int)(cardW * faceLeftRatio);
            int faceY = (int)(cardH * faceTopRatio);
            int faceW = (int)(cardW * (faceRightRatio - faceLeftRatio));
            int faceH = (int)(cardH * (faceBottomRatio - faceTopRatio));

            // Ensure bounds are valid
            faceX = Math.max(0, Math.min(faceX, cardW - 1));
            faceY = Math.max(0, Math.min(faceY, cardH - 1));
            faceW = Math.max(1, Math.min(faceW, cardW - faceX));
            faceH = Math.max(1, Math.min(faceH, cardH - faceY));

            // Crop face region
            android.graphics.Bitmap faceBitmap = android.graphics.Bitmap.createBitmap(
                cardBitmap, faceX, faceY, faceW, faceH
            );

            // Convert to Base64 PNG
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            faceBitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos);
            String base64Face = android.util.Base64.encodeToString(
                baos.toByteArray(), android.util.Base64.NO_WRAP
            );

            WritableMap result = Arguments.createMap();
            result.putString("base64", base64Face);
            result.putInt("width", faceW);
            result.putInt("height", faceH);

            promise.resolve(result);

            cardBitmap.recycle();
            faceBitmap.recycle();
            baos.close();

        } catch (Exception e) {
            promise.reject("FACE_EXTRACT_ERROR", "Failed to extract face photo: " + e.getMessage());
        }
    }

    /**
     * Get the captured BACK (verso) image as Base64 PNG.
     */
    @ReactMethod
    public void getCapturedBack(Promise promise) {
        try {
            byte[] imageData = CardDetectorJNI.nativeGetCapturedBack();
            if (imageData == null) {
                promise.resolve(null);
                return;
            }

            // Create bitmap from RGBA data (1000x630)
            int width = 1000;
            int height = 630;
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(
                width, height, android.graphics.Bitmap.Config.ARGB_8888
            );
            java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(imageData);
            bitmap.copyPixelsFromBuffer(buffer);

            // Convert to Base64 PNG
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos);
            String base64Image = android.util.Base64.encodeToString(
                baos.toByteArray(), android.util.Base64.NO_WRAP
            );

            WritableMap result = Arguments.createMap();
            result.putString("base64", base64Image);
            result.putInt("width", width);
            result.putInt("height", height);

            promise.resolve(result);

            bitmap.recycle();
            baos.close();

        } catch (Exception e) {
            promise.reject("CAPTURE_BACK_ERROR", "Failed to get captured back: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ANTI-SPOOF: Screen Detection Controls
    // ═══════════════════════════════════════════════════════════════

    /**
     * Reset screen detection state.
     * Call when user wants to retry after screen detection blocked them.
     * Clears temporal accumulation and allows fresh detection.
     */
    @ReactMethod
    public void resetScreenDetection(Promise promise) {
        try {
            CardDetectorJNI.nativeResetScreenDetection();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SCREEN_RESET_ERROR", "Failed to reset screen detection: " + e.getMessage());
        }
    }

    /**
     * Get module constants
     */
    @Nullable
    @Override
    public java.util.Map<String, Object> getConstants() {
        final java.util.Map<String, Object> constants = new java.util.HashMap<>();
        constants.put("ID1_ASPECT_RATIO", 1.586);
        constants.put("DEFAULT_MIN_AREA", 0.05);
        constants.put("DEFAULT_MAX_AREA", 0.85);
        constants.put("DEFAULT_RATIO_TOLERANCE", 0.10);
        return constants;
    }
}
