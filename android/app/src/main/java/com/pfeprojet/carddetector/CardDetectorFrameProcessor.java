package com.pfeprojet.carddetector;

import android.media.Image;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.ImageProxy;

import com.mrousavy.camera.frameprocessor.Frame;
import com.mrousavy.camera.frameprocessor.FrameProcessorPlugin;
import com.mrousavy.camera.frameprocessor.VisionCameraProxy;
import com.mrousavy.camera.core.FrameInvalidError;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * VisionCamera Frame Processor Plugin for Card Detection
 * Processes camera frames in real-time to detect ID cards
 */
public class CardDetectorFrameProcessor extends FrameProcessorPlugin {
    
    private static final String TAG = "CardDetectorFrameProcessor";
    private boolean isInitialized = false;
    
    public CardDetectorFrameProcessor(@NonNull VisionCameraProxy proxy, @Nullable Map<String, Object> options) {
        super();
        // Initialize native detector
        try {
            CardDetectorJNI.nativeInit();
            isInitialized = true;
        } catch (Exception e) {
            android.util.Log.e(TAG, "Failed to initialize CardDetector: " + e.getMessage());
        }
    }
    
    private static int frameCount = 0;
    
    @Nullable
    @Override
    public Object callback(@NonNull Frame frame, @Nullable Map<String, Object> arguments) {
        frameCount++;
        
        if (frameCount % 60 == 1) {
            android.util.Log.d(TAG, "callback() called - frame #" + frameCount + ", isInitialized=" + isInitialized);
        }
        
        if (!isInitialized) {
            android.util.Log.e(TAG, "Detector not initialized!");
            return createErrorResult("Detector not initialized");
        }
        
        try {
            // Get image from frame
            Image image = frame.getImage();
            if (image == null) {
                android.util.Log.e(TAG, "No image in frame");
                return createErrorResult("No image in frame");
            }
            
            int width = image.getWidth();
            int height = image.getHeight();
            
            if (frameCount % 60 == 1) {
                android.util.Log.d(TAG, "Frame size: " + width + "x" + height);
            }
            
            // Get Y plane (luminance) for grayscale processing
            Image.Plane[] planes = image.getPlanes();
            if (planes.length == 0) {
                android.util.Log.e(TAG, "No image planes");
                return createErrorResult("No image planes");
            }
            
            Image.Plane yPlane = planes[0];
            ByteBuffer yBuffer = yPlane.getBuffer();
            int yRowStride = yPlane.getRowStride();
            
            // For YUV_420_888 format, we can use just the Y plane for grayscale
            ByteBuffer uBuffer = planes.length > 1 ? planes[1].getBuffer() : null;
            ByteBuffer vBuffer = planes.length > 2 ? planes[2].getBuffer() : null;
            int uvRowStride = planes.length > 1 ? planes[1].getRowStride() : 0;
            int uvPixelStride = planes.length > 1 ? planes[1].getPixelStride() : 0;
            
            // Detect card using native code
            float[] result = CardDetectorJNI.nativeDetectFromYUV(
                yBuffer,
                uBuffer,
                vBuffer,
                width,
                height,
                yRowStride,
                uvRowStride,
                uvPixelStride
            );
            
            if (frameCount % 60 == 1) {
                android.util.Log.d(TAG, "Native result: " + (result != null ? "length=" + result.length + ", isValid=" + (result.length > 0 ? result[0] : "null") : "null"));
            }
            
            // Parse result and create response
            String orientation = "portrait-up";
            try {
                orientation = frame.getOrientation().toString();
            } catch (FrameInvalidError e) {
                // Use default orientation if frame is invalid
            }
            return parseDetectionResult(result, width, height, orientation);
            
        } catch (Throwable e) {
            android.util.Log.e(TAG, "Error processing frame: " + e.getMessage(), e);
            return createErrorResult(e.getMessage());
        }
    }
    
    /**
     * Parse native detection result into JavaScript-friendly format
     * IMPORTANT: VisionCamera only supports Boolean, Integer, Double (NOT Float), String, Map, List
     */
    private Map<String, Object> parseDetectionResult(float[] result, int width, int height, String orientation) {
        Map<String, Object> response = new HashMap<>();
        
        if (result == null || result.length < 10) {
            response.put("isValid", Boolean.FALSE);
            response.put("corners", new ArrayList<>());
            response.put("frameWidth", Integer.valueOf(width));
            response.put("frameHeight", Integer.valueOf(height));
            return response;
        }
        
        boolean isValid = result[0] > 0.5f;
        double confidence = (double) result[1];  // Convert float to double!
        
        response.put("isValid", Boolean.valueOf(isValid));
        response.put("confidence", Double.valueOf(confidence));  // Must be Double, not Float
        response.put("frameWidth", Integer.valueOf(width));
        response.put("frameHeight", Integer.valueOf(height));
        response.put("orientation", orientation);
        
        if (isValid) {
            List<Map<String, Object>> corners = new ArrayList<>();
            
            // Corners: top-left, top-right, bottom-right, bottom-left
            for (int i = 0; i < 4; i++) {
                Map<String, Object> corner = new HashMap<>();
                corner.put("x", Double.valueOf((double) result[2 + i * 2]));
                corner.put("y", Double.valueOf((double) result[3 + i * 2]));
                corners.add(corner);
            }
            
            response.put("corners", corners);
        } else {
            response.put("corners", new ArrayList<>());
        }
        
        return response;
    }
    
    /**
     * Create error result
     */
    private Map<String, Object> createErrorResult(String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("isValid", Boolean.FALSE);
        response.put("error", message);
        response.put("corners", new ArrayList<>());
        return response;
    }
}
