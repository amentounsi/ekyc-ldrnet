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
