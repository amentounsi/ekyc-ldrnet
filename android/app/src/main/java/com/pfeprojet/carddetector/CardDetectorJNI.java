package com.pfeprojet.carddetector;

import android.graphics.Bitmap;
import java.nio.ByteBuffer;

/**
 * JNI wrapper for native CardDetector functions
 * Provides interface between Java and C++ OpenCV code
 */
public class CardDetectorJNI {
    
    static {
        System.loadLibrary("carddetector");
    }
    
    /**
     * Initialize the native CardDetector
     * Must be called before any detection
     */
    public static native void nativeInit();
    
    /**
     * Release native resources
     * Call when done with detection
     */
    public static native void nativeRelease();
    
    /**
     * Update detection configuration
     * 
     * @param cannyLow Canny edge detection low threshold
     * @param cannyHigh Canny edge detection high threshold
     * @param blurSize Gaussian blur kernel size
     * @param minArea Minimum area ratio (0-1)
     * @param maxArea Maximum area ratio (0-1)
     * @param targetRatio Target aspect ratio (ID-1 = 1.586)
     * @param ratioTolerance Aspect ratio tolerance (0-1)
     */
    public static native void nativeSetConfig(
        int cannyLow,
        int cannyHigh,
        int blurSize,
        float minArea,
        float maxArea,
        float targetRatio,
        float ratioTolerance
    );
    
    /**
     * Set overlay-guided detection bounds
     * 
     * @param enabled Enable overlay-guided detection
     * @param x Normalized X coordinate (0-1)
     * @param y Normalized Y coordinate (0-1)
     * @param width Normalized width (0-1)
     * @param height Normalized height (0-1)
     * @param useROICropping Crop frame to ROI before detection
     */
    public static native void nativeSetOverlay(
        boolean enabled,
        float x,
        float y,
        float width,
        float height,
        boolean useROICropping
    );
    
    /**
     * Set scan mode for card detection
     * 
     * @param mode 0 = FRONT (requires red flag), 1 = BACK (no red flag needed)
     */
    public static native void nativeSetScanMode(int mode);
    
    /**
     * Detect card from YUV frame data
     * Optimized for camera frames
     *
     * @param yBuffer        Y plane direct buffer
     * @param uBuffer        U plane direct buffer
     * @param vBuffer        V plane direct buffer (Cr — used for red validation)
     * @param width          Frame width
     * @param height         Frame height
     * @param yRowStride     Y plane row stride
     * @param uvRowStride    UV plane row stride
     * @param uvPixelStride  UV pixel stride (1=planar, 2=semi-planar)
     * @param rotationDegrees Rotation to apply: 0, 90, 180, 270
     * @return float[20]
     */
    public static native float[] nativeDetectFromYUV(
        ByteBuffer yBuffer,
        ByteBuffer uBuffer,
        ByteBuffer vBuffer,
        int width,
        int height,
        int yRowStride,
        int uvRowStride,
        int uvPixelStride,
        int rotationDegrees
    );
    
    /**
     * Detect card from RGBA bitmap
     * 
     * @param bitmap Android Bitmap (ARGB_8888)
     * @return float[10]: [isValid, confidence, x0, y0, x1, y1, x2, y2, x3, y3]
     */
    public static native float[] nativeDetectFromBitmap(Bitmap bitmap);
    
    /**
     * Detect card from grayscale byte array
     * Most efficient method for processed frames
     * 
     * @param data Grayscale image data
     * @param width Image width
     * @param height Image height
     * @return float[10]: [isValid, confidence, x0, y0, x1, y1, x2, y2, x3, y3]
     */
    public static native float[] nativeDetectFromGrayscale(
        byte[] data,
        int width,
        int height
    );
    
    /**
     * Get the last warped image as RGBA byte array
     * Available after a successful detection
     * 
     * @return RGBA byte array (1000x630x4 bytes) or null if not available
     */
    public static native byte[] nativeGetWarpedImage();
    
    /**
     * Get dimensions of the warped image
     * 
     * @return int[2]: [width, height] (1000, 630) or (0, 0) if not available
     */
    public static native int[] nativeGetWarpedImageDimensions();
    
    /**
     * Classify the last warped image as FRONT, BACK, or UNKNOWN
     * Phase 2 - Recto/Verso Classification
     * 
     * @return float[12]:
     *   [0] side (0=UNKNOWN, 1=FRONT, 2=BACK)
     *   [1] confidence (0-1)
     *   [2] flagDetected (0 or 1)
     *   [3] flagRedRatio (0-1)
     *   [4] photoTextureDetected (0 or 1)
     *   [5] photoStddev (0-255)
     *   [6] barcodeDetected (0 or 1)
     *   [7] barcodeEdgeDensity (0-1)
     *   [8] fingerprintDetected (0 or 1)
     *   [9] fingerprintStddev (0-255)
     *   [10] meanBrightness (0-255)
     *   [11] brightEnough (0 or 1)
     */
    public static native float[] nativeClassifyCardSide();

    /**
     * Validate layout of the last warped image against official CIN structure.
     * Phase 3 - Structural Layout Validation
     *
     * @param side 0 = FRONT, 1 = BACK
     * @return float[8]:
     *   [0] valid (0 or 1)
     *   [1] score (0-1)
     *   [2-7] zone scores (0-1)
     */
    public static native float[] nativeValidateLayout(int side);

    // ═══════════════════════════════════════════════════════════════
    // Phase 4: Presence Validation (Anti-Spoof / Liveness)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Push the current frame snapshot (raw gray + warped + quad) into
     * the presence validator's ring buffer.
     */
    public static native void nativePushPresenceFrame();

    /**
     * Evaluate liveness from the buffered frames.
     *
     * @return float[5]:
     *   [0] live            (0 or 1)
     *   [1] totalScore      (0-1)
     *   [2] homographyScore (0-1)
     *   [3] highlightScore  (0-1)
     *   [4] approachScore   (0-1)
     */
    public static native float[] nativeEvaluatePresence();

    /**
     * Reset the presence validator's ring buffer.
     * Call on side switch, detection loss, or after capture.
     */
    public static native void nativeResetPresence();

    // ═══════════════════════════════════════════════════════════════
    // AUTO-CAPTURE: State Machine (Recto → Verso Flow)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get the current capture state.
     *
     * @return 0 = WAIT_FRONT, 1 = WAIT_BACK, 2 = FINISHED
     */
    public static native int nativeGetCaptureState();

    /**
     * Reset the capture sequence to start fresh.
     * Clears both captured images and resets to WAIT_FRONT state.
     */
    public static native void nativeResetCaptureSequence();

    /**
     * Attempt to auto-capture based on current state and detected side.
     *
     * @param detectedSide 0 = FRONT, 1 = BACK, 2 = UNKNOWN
     * @param layoutValid  1 = valid, 0 = invalid
     * @return float[4]:
     *   [0] captured    (0 or 1)
     *   [1] newState    (0 = WAIT_FRONT, 1 = WAIT_BACK, 2 = FINISHED)
     *   [2] frontReady  (0 or 1)
     *   [3] backReady   (0 or 1)
     */
    public static native float[] nativeAutoCapture(int detectedSide, int layoutValid);

    /**
     * Get the captured FRONT (recto) image as RGBA byte array.
     *
     * @return RGBA byte array (1000x630x4 bytes) or null if not captured
     */
    public static native byte[] nativeGetCapturedFront();

    /**
     * Get the captured BACK (verso) image as RGBA byte array.
     *
     * @return RGBA byte array (1000x630x4 bytes) or null if not captured
     */
    public static native byte[] nativeGetCapturedBack();

    // ═══════════════════════════════════════════════════════════════
    // ANTI-SPOOF: Screen Detection
    // ═══════════════════════════════════════════════════════════════

    /**
     * Reset screen detection state.
     * Call when user wants to retry after screen detection blocked them.
     * Clears temporal accumulation and allows fresh detection.
     */
    public static native void nativeResetScreenDetection();
}
