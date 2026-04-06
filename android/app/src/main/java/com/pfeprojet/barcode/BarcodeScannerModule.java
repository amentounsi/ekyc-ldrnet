package com.pfeprojet.barcode;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

/**
 * React Native module for barcode scanning using ZXing
 * Scans PDF417, Code128, Code39 barcodes from base64 images
 * 
 * Tunisian CIN Barcode Format (18 characters):
 *   - Chars 1-8:   CIN Number
 *   - Chars 9-10:  Left Number
 *   - Chars 11-12: Right Number
 *   - Chars 13-18: Release Date (DDMMYY)
 */
public class BarcodeScannerModule extends ReactContextBaseJavaModule {
    
    private static final String TAG = "BarcodeScannerModule";
    private static final String MODULE_NAME = "BarcodeScanner";
    
    private final MultiFormatReader reader;
    private final Map<DecodeHintType, Object> hints;
    
    public BarcodeScannerModule(ReactApplicationContext context) {
        super(context);
        
        // Initialize ZXing reader with all 1D barcode formats
        reader = new MultiFormatReader();
        hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, EnumSet.of(
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.CODABAR,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.ITF,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.PDF_417,
            BarcodeFormat.DATA_MATRIX
        ));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        hints.put(DecodeHintType.ALSO_INVERTED, Boolean.TRUE);
        reader.setHints(hints);
        
        Log.i(TAG, "BarcodeScannerModule initialized with ZXing (multi-format)");
    }
    
    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }
    
    /**
     * Scan barcode from base64-encoded image
     * Tries multiple strategies: full image, rotations, cropped regions
     * @param base64Image Base64 encoded image (with or without data URI prefix)
     * @param promise React Native promise for async result
     */
    @ReactMethod
    public void scanFromBase64(String base64Image, Promise promise) {
        try {
            // Remove data URI prefix if present
            String base64Data = base64Image;
            if (base64Image.contains(",")) {
                base64Data = base64Image.split(",")[1];
            }
            
            // Decode base64 to bitmap
            byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
            
            if (bitmap == null) {
                promise.reject("DECODE_ERROR", "Failed to decode base64 image");
                return;
            }
            
            Log.e(TAG, "=== BARCODE SCAN CALLED ===");
            Log.e(TAG, "Scanning barcode from image: " + bitmap.getWidth() + "x" + bitmap.getHeight());
            Log.e(TAG, "Base64 length: " + base64Data.length() + ", decoded bytes: " + decodedBytes.length);
            
            // Save full back image for diagnostic
            try {
                java.io.File cacheDir = getReactApplicationContext().getExternalCacheDir();
                if (cacheDir != null) {
                    java.io.File fullImg = new java.io.File(cacheDir, "back_full_debug.png");
                    java.io.FileOutputStream fos = new java.io.FileOutputStream(fullImg);
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
                    fos.close();
                    Log.e(TAG, "Saved full back image to: " + fullImg.getAbsolutePath());
                    
                    // Also save bottom 10% strip
                    int stripY = (int)(bitmap.getHeight() * 0.90);
                    int stripH = bitmap.getHeight() - stripY;
                    Bitmap strip = Bitmap.createBitmap(bitmap, 0, stripY, bitmap.getWidth(), stripH);
                    java.io.File stripImg = new java.io.File(cacheDir, "back_strip_debug.png");
                    fos = new java.io.FileOutputStream(stripImg);
                    strip.compress(Bitmap.CompressFormat.PNG, 100, fos);
                    fos.close();
                    strip.recycle();
                    Log.e(TAG, "Saved strip to: " + stripImg.getAbsolutePath());
                }
            } catch (Exception ex) {
                Log.e(TAG, "Save diagnostic failed: " + ex.getMessage());
            }
            
            // Try multiple scanning strategies with ZXing
            Result result = scanWithMultipleStrategies(bitmap);
            int imgW = bitmap.getWidth();
            int imgH = bitmap.getHeight();
            bitmap.recycle();
            
            if (result != null) {
                WritableMap response = createSuccessResponse(result);
                promise.resolve(response);
            } else {
                WritableMap response = Arguments.createMap();
                response.putBoolean("found", false);
                response.putString("error", "V5: No barcode (" + imgW + "x" + imgH + ")");
                promise.resolve(response);
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error scanning barcode: " + e.getMessage(), e);
            promise.reject("SCAN_ERROR", "Barcode scan failed: " + e.getMessage());
        }
    }
    
    /**
     * Row-by-row barcode scanner — scans individual horizontal lines.
     * Creates a thin image (1 row repeated) from each row in the barcode area.
     * This gives ZXing the cleanest possible 1D input.
     */
    private Result scanRowByRow(Bitmap image, int startY, int endY) {
        int w = image.getWidth();
        int[] rowPixels = new int[w];
        
        // Scan every 2nd row for speed
        for (int y = startY; y < endY; y += 2) {
            image.getPixels(rowPixels, 0, w, 0, y, w, 1);
            
            // Create a thin image: duplicate the row 10 times for ZXing
            int thinH = 10;
            int[] thinPixels = new int[w * thinH];
            for (int r = 0; r < thinH; r++) {
                System.arraycopy(rowPixels, 0, thinPixels, r * w, w);
            }
            
            LuminanceSource source = new RGBLuminanceSource(w, thinH, thinPixels);
            
            // Try with our standard hints (TRY_HARDER + format list)
            try {
                BinaryBitmap binaryBitmap = new BinaryBitmap(new GlobalHistogramBinarizer(source));
                Result result = reader.decodeWithState(binaryBitmap);
                if (result != null) {
                    Log.e(TAG, "  Row-by-row: found at row " + y + ": " + result.getText());
                    return result;
                }
            } catch (NotFoundException e) {
                // Continue
            } finally {
                reader.reset();
            }
            
            // Try with auto-detect (no format restriction)
            try {
                MultiFormatReader autoReader = new MultiFormatReader();
                Map<DecodeHintType, Object> autoHints = new EnumMap<>(DecodeHintType.class);
                autoHints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
                autoReader.setHints(autoHints);
                BinaryBitmap binaryBitmap = new BinaryBitmap(new GlobalHistogramBinarizer(source));
                Result result = autoReader.decodeWithState(binaryBitmap);
                if (result != null) {
                    Log.e(TAG, "  Row-by-row (auto): found at row " + y + ": " + result.getText());
                    return result;
                }
            } catch (NotFoundException e) {
                // Continue to next row
            }
        }
        return null;
    }
    
    /**
     * Try scanning with auto-detect formats (no format restriction)
     * Sometimes restricting formats causes ZXing to miss the barcode
     */
    private Result scanAutoDetect(Bitmap bitmap) {
        try {
            int w = bitmap.getWidth();
            int h = bitmap.getHeight();
            int[] pixels = new int[w * h];
            bitmap.getPixels(pixels, 0, w, 0, 0, w, h);
            
            LuminanceSource source = new RGBLuminanceSource(w, h, pixels);
            
            // Try with NO format hints — let ZXing auto-detect
            MultiFormatReader autoReader = new MultiFormatReader();
            Map<DecodeHintType, Object> autoHints = new EnumMap<>(DecodeHintType.class);
            autoHints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            autoReader.setHints(autoHints);
            
            try {
                BinaryBitmap binaryBitmap = new BinaryBitmap(new HybridBinarizer(source));
                Result result = autoReader.decodeWithState(binaryBitmap);
                if (result != null) return result;
            } catch (NotFoundException e) {
                // try global
            } finally {
                autoReader.reset();
            }
            
            try {
                BinaryBitmap binaryBitmap = new BinaryBitmap(new GlobalHistogramBinarizer(source));
                return autoReader.decodeWithState(binaryBitmap);
            } catch (NotFoundException e) {
                return null;
            } finally {
                autoReader.reset();
            }
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * Try multiple strategies to find the barcode.
     * 
     * Tunisian CIN barcode analysis (from real captured images):
     *   - Warped back image: 1000×630 pixels
     *   - Barcode: thin 1D strip at VERY BOTTOM, roughly rows 580-625
     *   - That's bottom ~8% of the image, not 15-17%
     *   - Barcode is very thin (~40-50 pixels tall) → needs upscaling
     *   - Must use NEAREST-NEIGHBOR upscaling to preserve sharp bar edges
     */
    private Result scanWithMultipleStrategies(Bitmap original) {
        Result result;
        int w = original.getWidth();
        int h = original.getHeight();
        
        Log.e(TAG, "Image dimensions: " + w + "x" + h);
        
        // ══════════════════════════════════════════════════════════════════
        // PRIORITY 1: Most likely crops — both full and trimmed bottom
        // Each tryBarcodeStrip also tries WITHOUT padding as fallback
        // ══════════════════════════════════════════════════════════════════
        
        // S1: Bottom 10% (full) + Otsu + 4×
        Log.e(TAG, "S1: 90%-100% + Otsu + 4x");
        result = tryBarcodeStrip(original, w, h, 0.90, 4, true);
        if (result != null) return result;
        
        // S2: Bottom 10% trimmed (90%-97%) + Otsu + 4× — excludes dark edge
        Log.e(TAG, "S2: 90%-97% + Otsu + 4x");
        result = tryBarcodeStripRange(original, w, h, 0.90, 0.97, 4, true);
        if (result != null) return result;
        
        // S3: Bottom 10% (full) + enhanced (no Otsu) + 4×
        Log.e(TAG, "S3: 90%-100% + 4x (no Otsu)");
        result = tryBarcodeStrip(original, w, h, 0.90, 4, false);
        if (result != null) return result;
        
        // S4: Bottom 8% + Otsu + 6×
        Log.e(TAG, "S4: 92%-100% + Otsu + 6x");
        result = tryBarcodeStrip(original, w, h, 0.92, 6, true);
        if (result != null) return result;
        
        // S5: Bottom 90%-97% + enhanced + 6×
        Log.e(TAG, "S5: 90%-97% + 6x (no Otsu)");
        result = tryBarcodeStripRange(original, w, h, 0.90, 0.97, 6, false);
        if (result != null) return result;
        
        // S6: Bottom 15% + Otsu + 3×
        Log.e(TAG, "S6: 85%-100% + Otsu + 3x");
        result = tryBarcodeStrip(original, w, h, 0.85, 3, true);
        if (result != null) return result;
        
        // ══════════════════════════════════════════════════════════════════
        // PRIORITY 2: Wider crops and native resolution
        // ══════════════════════════════════════════════════════════════════
        
        // S7: Bottom 10% native resolution (no upscale)
        Log.e(TAG, "S7: 90%-100% native (no upscale)");
        result = tryBarcodeStrip(original, w, h, 0.90, 1, false);
        if (result != null) return result;
        
        // S8: Bottom 20%
        Log.e(TAG, "S8: 80%-100% + 2x");
        result = tryBarcodeStrip(original, w, h, 0.80, 2, false);
        if (result != null) return result;
        
        // S9: Full image direct
        Log.e(TAG, "S9: Full image");
        result = scanBitmap(original);
        if (result != null) return result;
        
        // ══════════════════════════════════════════════════════════════════
        // PRIORITY 3: More crop/scale variations
        // ══════════════════════════════════════════════════════════════════
        
        // S10: 88%-98% + Otsu + 3×
        Log.e(TAG, "S10: 88%-98% + Otsu + 3x");
        result = tryBarcodeStripRange(original, w, h, 0.88, 0.98, 3, true);
        if (result != null) return result;
        
        // S11: 90%-100% + Otsu + 8× (max resolution)
        Log.e(TAG, "S11: 90%-100% + Otsu + 8x");
        result = tryBarcodeStrip(original, w, h, 0.90, 8, true);
        if (result != null) return result;
        
        // ══════════════════════════════════════════════════════════════════
        // PRIORITY 4: Auto-detect format + row-by-row
        // ══════════════════════════════════════════════════════════════════
        
        // S12: Auto-detect on full image
        Log.e(TAG, "S12: Auto-detect (full image)");
        result = scanAutoDetect(original);
        if (result != null) return result;
        
        // S13: Auto-detect on bottom 15%
        Log.e(TAG, "S13: Auto-detect (bottom 15%)");
        int cropY = (int)(h * 0.85);
        int cropH = h - cropY;
        if (cropH > 5) {
            Bitmap strip = Bitmap.createBitmap(original, 0, cropY, w, cropH);
            result = scanAutoDetect(strip);
            strip.recycle();
            if (result != null) return result;
        }
        
        // S14: Row-by-row scanning
        Log.e(TAG, "S14: Row-by-row scanning");
        int rowStart = (int)(h * 0.88);
        int rowEnd = Math.min(h - 1, (int)(h * 0.99));
        result = scanRowByRow(original, rowStart, rowEnd);
        if (result != null) return result;
        
        // S15: Rotated 180°
        Log.e(TAG, "S15: Rotated 180°");
        Bitmap rotated = rotateBitmap(original, 180);
        result = tryBarcodeStrip(rotated, rotated.getWidth(), rotated.getHeight(), 0.90, 4, true);
        rotated.recycle();
        if (result != null) return result;
        
        Log.e(TAG, "All 15 strategies failed");
        return null;
    }
    
    /**
     * Helper: crop bottom strip, optionally threshold, optionally upscale, then scan.
     * 
     * @param source      Source image
     * @param w           Image width
     * @param h           Image height
     * @param topFraction Where to start crop (0.90 = bottom 10%)
     * @param scale       Upscale factor (1 = no upscale)
     * @param useOtsu     Apply Otsu threshold before upscaling
     */
    private Result tryBarcodeStrip(Bitmap source, int w, int h, double topFraction, int scale, boolean useOtsu) {
        return tryBarcodeStripRange(source, w, h, topFraction, 1.0, scale, useOtsu);
    }
    
    /**
     * Extended helper with configurable bottom boundary
     */
    private Result tryBarcodeStripRange(Bitmap source, int w, int h, double topFraction, double bottomFraction, int scale, boolean useOtsu) {
        int barY = (int)(h * topFraction);
        int barBottom = (int)(h * bottomFraction);
        int barH = barBottom - barY;
        if (barH < 5) return null;
        
        Bitmap strip = Bitmap.createBitmap(source, 0, barY, w, barH);
        Log.e(TAG, "  Strip: y=" + barY + "-" + barBottom + " (" + strip.getWidth() + "x" + strip.getHeight() + ") scale=" + scale + " otsu=" + useOtsu);
        
        // Step 1: Enhance contrast on JUST the barcode strip
        Bitmap enhanced = enhanceContrast(strip);
        strip.recycle();
        
        Bitmap toScan = enhanced;
        
        // Step 2: Apply Otsu threshold if requested
        if (useOtsu) {
            Bitmap thresholded = applyOtsuThreshold(enhanced);
            if (thresholded != null) {
                toScan = thresholded;
                enhanced.recycle();
            }
        }
        
        // Step 3: Add quiet zone padding
        int padH = Math.max(barH / 2, 20);
        int padW = Math.max(w / 10, 50);
        Bitmap padded = Bitmap.createBitmap(
            toScan.getWidth() + padW * 2,
            toScan.getHeight() + padH * 2,
            Bitmap.Config.ARGB_8888
        );
        padded.eraseColor(0xFFFFFFFF);
        android.graphics.Canvas padCanvas = new android.graphics.Canvas(padded);
        padCanvas.drawBitmap(toScan, padW, padH, null);
        
        // Step 4: Upscale with nearest-neighbor
        Bitmap scanTarget = padded;
        if (scale > 1) {
            int scaledW = scanTarget.getWidth() * scale;
            int scaledH = scanTarget.getHeight() * scale;
            Bitmap scaled = Bitmap.createBitmap(scaledW, scaledH, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(scaled);
            android.graphics.Paint paint = new android.graphics.Paint();
            paint.setFilterBitmap(false);
            android.graphics.Matrix scaleMatrix = new android.graphics.Matrix();
            scaleMatrix.setScale(scale, scale);
            canvas.drawBitmap(scanTarget, scaleMatrix, paint);
            scanTarget.recycle();
            scanTarget = scaled;
        }
        
        Log.e(TAG, "  Final scan size: " + scanTarget.getWidth() + "x" + scanTarget.getHeight());
        
        // Try scanning padded+scaled version
        Result result = scanBitmap(scanTarget);
        scanTarget.recycle();
        
        if (result != null) {
            toScan.recycle();
            return result;
        }
        
        // Fallback: try scanning WITHOUT padding (sometimes padding hurts)
        if (scale > 1) {
            int scaledW2 = toScan.getWidth() * scale;
            int scaledH2 = toScan.getHeight() * scale;
            Bitmap scaled2 = Bitmap.createBitmap(scaledW2, scaledH2, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas2 = new android.graphics.Canvas(scaled2);
            android.graphics.Paint paint2 = new android.graphics.Paint();
            paint2.setFilterBitmap(false);
            android.graphics.Matrix scaleMatrix2 = new android.graphics.Matrix();
            scaleMatrix2.setScale(scale, scale);
            canvas2.drawBitmap(toScan, scaleMatrix2, paint2);
            toScan.recycle();
            
            result = scanBitmap(scaled2);
            scaled2.recycle();
            return result;
        }
        
        // No upscale, no padding fallback
        result = scanBitmap(toScan);
        toScan.recycle();
        return result;
    }
    
    /**
     * Apply Otsu global threshold — best for clean 1D barcodes.
     * Simpler and more reliable than adaptive threshold for thin barcode strips.
     */
    private Bitmap applyOtsuThreshold(Bitmap source) {
        try {
            int w = source.getWidth();
            int h = source.getHeight();
            int[] pixels = new int[w * h];
            source.getPixels(pixels, 0, w, 0, 0, w, h);
            
            // Build luminance histogram
            int[] histogram = new int[256];
            int[] lum = new int[w * h];
            for (int i = 0; i < pixels.length; i++) {
                int r = (pixels[i] >> 16) & 0xFF;
                int g = (pixels[i] >> 8) & 0xFF;
                int b = pixels[i] & 0xFF;
                int l = (r + g + b) / 3;
                lum[i] = l;
                histogram[l]++;
            }
            
            // Otsu's method: find threshold that minimizes intra-class variance
            int total = w * h;
            float sum = 0;
            for (int t = 0; t < 256; t++) sum += t * histogram[t];
            
            float sumB = 0;
            int wB = 0;
            float maxVariance = 0;
            int threshold = 128; // fallback
            
            for (int t = 0; t < 256; t++) {
                wB += histogram[t];
                if (wB == 0) continue;
                int wF = total - wB;
                if (wF == 0) break;
                
                sumB += (float)(t * histogram[t]);
                float mB = sumB / wB;
                float mF = (sum - sumB) / wF;
                
                float variance = (float)wB * (float)wF * (mB - mF) * (mB - mF);
                if (variance > maxVariance) {
                    maxVariance = variance;
                    threshold = t;
                }
            }
            
            Log.e(TAG, "  Otsu threshold: " + threshold);
            
            // Apply threshold
            int[] result = new int[w * h];
            for (int i = 0; i < lum.length; i++) {
                int out = (lum[i] > threshold) ? 255 : 0;
                result[i] = (0xFF << 24) | (out << 16) | (out << 8) | out;
            }
            
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            bmp.setPixels(result, 0, w, 0, 0, w, h);
            return bmp;
        } catch (Exception e) {
            Log.e(TAG, "Otsu threshold failed: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Rotate bitmap by specified degrees
     */
    private Bitmap rotateBitmap(Bitmap source, float angle) {
        Matrix matrix = new Matrix();
        matrix.postRotate(angle);
        return Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
    }
    
    /**
     * Scan barcode from bitmap - tries both HybridBinarizer and GlobalHistogramBinarizer
     */
    private Result scanBitmap(Bitmap bitmap) {
        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int[] pixels = new int[width * height];
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
            
            LuminanceSource source = new RGBLuminanceSource(width, height, pixels);
            
            // Try HybridBinarizer first (better for images with varying lighting)
            try {
                BinaryBitmap binaryBitmap = new BinaryBitmap(new HybridBinarizer(source));
                Result result = reader.decodeWithState(binaryBitmap);
                if (result != null) return result;
            } catch (NotFoundException e) {
                // Continue to try GlobalHistogramBinarizer
            } finally {
                reader.reset();
            }
            
            // Try GlobalHistogramBinarizer (better for uniform lighting, printed barcodes)
            try {
                BinaryBitmap binaryBitmap = new BinaryBitmap(new GlobalHistogramBinarizer(source));
                return reader.decodeWithState(binaryBitmap);
            } catch (NotFoundException e) {
                return null;
            } finally {
                reader.reset();
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error scanning bitmap: " + e.getMessage());
            return null;
        } finally {
            reader.reset();
        }
    }
    
    /**
     * Enhance contrast of a grayscale bitmap via histogram stretching.
     * The warped card image is often low-contrast which makes barcode bars
     * hard for ZXing to distinguish.
     */
    private Bitmap enhanceContrast(Bitmap source) {
        int w = source.getWidth();
        int h = source.getHeight();
        int[] pixels = new int[w * h];
        source.getPixels(pixels, 0, w, 0, 0, w, h);
        
        // Find min/max luminance
        int min = 255, max = 0;
        for (int p : pixels) {
            int r = (p >> 16) & 0xFF;
            int g = (p >> 8) & 0xFF;
            int b = p & 0xFF;
            int lum = (r + g + b) / 3;
            if (lum < min) min = lum;
            if (lum > max) max = lum;
        }
        
        // Stretch histogram to full 0-255 range
        int range = max - min;
        if (range < 30) {
            // Very low contrast — force stretch
            range = Math.max(range, 1);
        }
        
        int[] enhanced = new int[w * h];
        for (int i = 0; i < pixels.length; i++) {
            int r = (pixels[i] >> 16) & 0xFF;
            int g = (pixels[i] >> 8) & 0xFF;
            int b = pixels[i] & 0xFF;
            
            r = Math.min(255, Math.max(0, (r - min) * 255 / range));
            g = Math.min(255, Math.max(0, (g - min) * 255 / range));
            b = Math.min(255, Math.max(0, (b - min) * 255 / range));
            
            enhanced[i] = (0xFF << 24) | (r << 16) | (g << 8) | b;
        }
        
        Bitmap result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        result.setPixels(enhanced, 0, w, 0, 0, w, h);
        return result;
    }
    
    /**
     * Apply adaptive thresholding to create a clean black/white barcode image.
     * Uses a local window to handle uneven lighting across the barcode.
     */
    private Bitmap applyAdaptiveThreshold(Bitmap source) {
        try {
            int w = source.getWidth();
            int h = source.getHeight();
            int[] pixels = new int[w * h];
            source.getPixels(pixels, 0, w, 0, 0, w, h);
            
            // Convert to grayscale array
            int[] gray = new int[w * h];
            for (int i = 0; i < pixels.length; i++) {
                int r = (pixels[i] >> 16) & 0xFF;
                int g = (pixels[i] >> 8) & 0xFF;
                int b = pixels[i] & 0xFF;
                gray[i] = (r + g + b) / 3;
            }
            
            // Simple adaptive threshold: pixel = white if > local_mean - offset, else black
            int windowSize = Math.max(15, w / 20); // ~5% of width
            if (windowSize % 2 == 0) windowSize++;
            int halfWin = windowSize / 2;
            int offset = 10; // bias toward keeping barcode bars black
            
            int[] result = new int[w * h];
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    // Compute local mean in window
                    int sum = 0, count = 0;
                    int y0 = Math.max(0, y - halfWin);
                    int y1 = Math.min(h - 1, y + halfWin);
                    int x0 = Math.max(0, x - halfWin);
                    int x1 = Math.min(w - 1, x + halfWin);
                    
                    for (int wy = y0; wy <= y1; wy += 2) { // Step 2 for speed
                        for (int wx = x0; wx <= x1; wx += 2) {
                            sum += gray[wy * w + wx];
                            count++;
                        }
                    }
                    
                    int localMean = sum / Math.max(1, count);
                    int val = gray[y * w + x];
                    
                    // White if above local mean - offset, else black
                    int out = (val > localMean - offset) ? 255 : 0;
                    result[y * w + x] = (0xFF << 24) | (out << 16) | (out << 8) | out;
                }
            }
            
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            bmp.setPixels(result, 0, w, 0, 0, w, h);
            return bmp;
        } catch (Exception e) {
            Log.e(TAG, "Adaptive threshold failed: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Create success response with parsed barcode data
     */
    private WritableMap createSuccessResponse(Result result) {
        WritableMap response = Arguments.createMap();
        response.putBoolean("found", true);
        response.putString("format", result.getBarcodeFormat().toString());
        response.putString("rawValue", result.getText());
        
        // Parse Tunisian CIN barcode if it's 18 characters
        String rawValue = result.getText();
        if (rawValue != null) {
            WritableMap parsed = parseCINBarcode(rawValue);
            response.putMap("parsed", parsed);
        }
        
        Log.i(TAG, "Barcode found: format=" + result.getBarcodeFormat() + 
              ", value=" + result.getText());
        
        return response;
    }
    
    /**
     * Parse Tunisian CIN barcode data (18 characters)
     * Format: CCCCCCCCLLRRDDMMYY
     *   - C: CIN Number (8 chars)
     *   - L: Left Number (2 chars)
     *   - R: Right Number (2 chars)
     *   - D: Day (2 chars)
     *   - M: Month (2 chars)
     *   - Y: Year (2 chars)
     */
    private WritableMap parseCINBarcode(String rawData) {
        WritableMap parsed = Arguments.createMap();
        String trimmed = rawData.trim();
        
        parsed.putString("rawData", trimmed);
        
        // Validate: must be exactly 18 characters
        if (trimmed.length() != 18) {
            parsed.putBoolean("isValid", false);
            parsed.putString("error", "Invalid length: expected 18, got " + trimmed.length());
            parsed.putString("cinNumber", "");
            parsed.putString("leftNumber", "");
            parsed.putString("rightNumber", "");
            parsed.putString("releaseDate", "");
            parsed.putString("releaseDateFormatted", "");
            return parsed;
        }
        
        // Validate: must be all numeric
        if (!trimmed.matches("\\d+")) {
            parsed.putBoolean("isValid", false);
            parsed.putString("error", "Barcode contains non-numeric characters");
            parsed.putString("cinNumber", "");
            parsed.putString("leftNumber", "");
            parsed.putString("rightNumber", "");
            parsed.putString("releaseDate", "");
            parsed.putString("releaseDateFormatted", "");
            return parsed;
        }
        
        // Parse fields
        String cinNumber = trimmed.substring(0, 8);       // Chars 1-8
        String leftNumber = trimmed.substring(8, 10);     // Chars 9-10
        String rightNumber = trimmed.substring(10, 12);   // Chars 11-12
        String releaseDate = trimmed.substring(12, 18);   // Chars 13-18
        
        // Format release date: DDMMYY → DD/MM/YY
        String day = releaseDate.substring(0, 2);
        String month = releaseDate.substring(2, 4);
        String year = releaseDate.substring(4, 6);
        String releaseDateFormatted = day + "/" + month + "/" + year;
        
        parsed.putBoolean("isValid", true);
        parsed.putString("cinNumber", cinNumber);
        parsed.putString("leftNumber", leftNumber);
        parsed.putString("rightNumber", rightNumber);
        parsed.putString("releaseDate", releaseDate);
        parsed.putString("releaseDateFormatted", releaseDateFormatted);
        
        Log.e(TAG, "Parsed CIN: number=" + cinNumber + 
              ", left=" + leftNumber + 
              ", right=" + rightNumber + 
              ", date=" + releaseDateFormatted);
        
        return parsed;
    }
}
