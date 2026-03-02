/**
 * CardSideClassifier.cpp
 * 
 * Implementation of Phase 2 - Recto/Verso Classification for Tunisian CIN
 * 
 * Detection Strategy:
 *   FRONT: Red flag (top-left) + Photo texture (left side)
 *   BACK:  Barcode (bottom) + No flag + Fingerprint texture (right side)
 *   UNKNOWN: Neither pattern matches confidently
 */

#include "CardSideClassifier.h"
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <algorithm>
#include <android/log.h>

#define LOG_TAG "CardSideClassifier"

// Performance: Disable verbose debug logging in production
// Set to 1 for detailed classification logging, 0 for performance
#define CLASSIFIER_VERBOSE_LOG 0

#if CLASSIFIER_VERBOSE_LOG
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#else
#define LOGD(...) ((void)0)  // No-op when disabled
#endif

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace validation {

// ============================================================================
// Public Interface
// ============================================================================

CardSide CardSideClassifier::classify(const cv::Mat& warpedImage) {
    SideClassificationResult result = classifyWithDetails(warpedImage);
    return result.side;
}

SideClassificationResult CardSideClassifier::classifyWithDetails(const cv::Mat& warpedImage) {
    SideClassificationResult result;
    result.side = CardSide::UNKNOWN;
    result.flagDetected = false;
    result.flagRedRatio = 0.f;
    result.photoTextureDetected = false;
    result.photoStddev = 0.f;
    result.barcodeDetected = false;
    result.barcodeEdgeDensity = 0.f;
    result.fingerprintDetected = false;
    result.fingerprintStddev = 0.f;
    result.mrzDetected = false;
    result.mrzEdgeDensity = 0.f;
    result.meanBrightness = 0.f;
    result.brightEnough = false;
    result.confidence = 0.f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // Validate Input
    // ─────────────────────────────────────────────────────────────────────────
    
    if (warpedImage.empty()) {
        LOGE("classify: Input image is empty");
        return result;
    }
    
    if (warpedImage.cols != SideClassifierConfig::EXPECTED_WIDTH ||
        warpedImage.rows != SideClassifierConfig::EXPECTED_HEIGHT) {
        LOGE("classify: Invalid image size %dx%d (expected %dx%d)",
             warpedImage.cols, warpedImage.rows,
             SideClassifierConfig::EXPECTED_WIDTH,
             SideClassifierConfig::EXPECTED_HEIGHT);
        return result;
    }
    
    LOGD("classify: Processing %dx%d image", warpedImage.cols, warpedImage.rows);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 0: Apply CLAHE Preprocessing (like CardDetector Stage 1)
    // Normalizes local contrast for robust detection under varying lighting
    // ─────────────────────────────────────────────────────────────────────────
    
    cv::Mat grayInput = ensureGrayscale(warpedImage);
    cv::Mat preprocessed = applyCLAHE(grayInput);
    
    LOGD("CLAHE preprocessing applied");
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Overall Brightness Check
    // ─────────────────────────────────────────────────────────────────────────
    
    result.meanBrightness = computeMeanBrightness(preprocessed);
    result.brightEnough = (result.meanBrightness >= SideClassifierConfig::BRIGHTNESS_MIN);
    
    LOGD("Brightness: %.1f (min=%.1f) → %s",
         result.meanBrightness,
         SideClassifierConfig::BRIGHTNESS_MIN,
         result.brightEnough ? "OK" : "TOO_DARK");
    
    if (!result.brightEnough) {
        LOGW("Image too dark for reliable classification");
        // Continue anyway, but confidence will be lower
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: FRONT Detection - Flag (use original for color detection)
    // ─────────────────────────────────────────────────────────────────────────
    
    result.flagRedRatio = detectFlag(warpedImage);
    result.flagDetected = (result.flagRedRatio >= SideClassifierConfig::RED_RATIO_MIN);
    
    LOGD("Flag: redRatio=%.3f (min=%.3f) → %s",
         result.flagRedRatio,
         SideClassifierConfig::RED_RATIO_MIN,
         result.flagDetected ? "DETECTED" : "not_found");
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: FRONT Detection - Photo Texture (use preprocessed for better contrast)
    // ─────────────────────────────────────────────────────────────────────────
    
    result.photoStddev = detectPhotoTexture(preprocessed);
    result.photoTextureDetected = (result.photoStddev >= SideClassifierConfig::PHOTO_STDDEV_MIN);
    
    LOGD("Photo: stddev=%.1f (min=%.1f) → %s",
         result.photoStddev,
         SideClassifierConfig::PHOTO_STDDEV_MIN,
         result.photoTextureDetected ? "DETECTED" : "not_found");
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: BACK Detection - Barcode (use preprocessed with adaptive edge detection)
    // ─────────────────────────────────────────────────────────────────────────
    
    result.barcodeEdgeDensity = detectBarcode(preprocessed);
    result.barcodeDetected = (result.barcodeEdgeDensity >= SideClassifierConfig::BARCODE_EDGE_DENSITY_MIN);
    
    LOGD("Barcode: edgeDensity=%.3f (min=%.3f) → %s",
         result.barcodeEdgeDensity,
         SideClassifierConfig::BARCODE_EDGE_DENSITY_MIN,
         result.barcodeDetected ? "DETECTED" : "not_found");
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: BACK Detection - MRZ Text Lines (use preprocessed)
    // ─────────────────────────────────────────────────────────────────────────
    
    result.mrzEdgeDensity = detectMRZ(preprocessed);
    result.mrzDetected = (result.mrzEdgeDensity >= SideClassifierConfig::MRZ_EDGE_DENSITY_MIN);
    
    LOGD("MRZ: edgeDensity=%.3f (min=%.3f) → %s",
         result.mrzEdgeDensity,
         SideClassifierConfig::MRZ_EDGE_DENSITY_MIN,
         result.mrzDetected ? "DETECTED" : "not_found");
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: BACK Detection - Fingerprint Texture (use preprocessed)
    // ─────────────────────────────────────────────────────────────────────────
    
    result.fingerprintStddev = detectFingerprintTexture(preprocessed);
    result.fingerprintDetected = (result.fingerprintStddev >= SideClassifierConfig::FINGERPRINT_STDDEV_MIN);
    
    LOGD("Fingerprint: stddev=%.1f (min=%.1f) → %s",
         result.fingerprintStddev,
         SideClassifierConfig::FINGERPRINT_STDDEV_MIN,
         result.fingerprintDetected ? "DETECTED" : "not_found");
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Decision Logic
    // ─────────────────────────────────────────────────────────────────────────
    
    // FRONT Decision: Flag + Photo texture
    bool frontSignal = result.flagDetected && result.photoTextureDetected;
    
    // BACK Decision: (Barcode OR MRZ) + No flag
    // MRZ provides additional BACK evidence when barcode is weak
    bool backSignal = (result.barcodeDetected || result.mrzDetected) && !result.flagDetected;
    
    // Strong BACK: Both barcode AND MRZ detected
    bool backStrong = result.barcodeDetected && result.mrzDetected && !result.flagDetected;
    
    // Additional BACK signal: fingerprint (optional reinforcement)
    bool backReinforced = backSignal && result.fingerprintDetected;
    
    LOGD("Signals: frontSignal=%d, backSignal=%d, backStrong=%d, backReinforced=%d",
         frontSignal, backSignal, backStrong, backReinforced);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Final Classification
    // ─────────────────────────────────────────────────────────────────────────
    
    if (frontSignal && !backSignal) {
        // Clear FRONT
        result.side = CardSide::FRONT;
        result.confidence = 0.9f;
        
        // Boost confidence if bright enough
        if (result.brightEnough) {
            result.confidence = 0.95f;
        }
        
    } else if (backSignal && !frontSignal) {
        // Clear BACK
        result.side = CardSide::BACK;
        
        // Strong BACK confidence when both barcode and MRZ detected
        if (backStrong) {
            result.confidence = 0.95f;
        } else if (backReinforced) {
            result.confidence = 0.90f;
        } else {
            result.confidence = 0.80f;
        }
        
    } else if (frontSignal && backSignal) {
        // Ambiguous - both signals present (shouldn't happen normally)
        LOGW("Ambiguous: both FRONT and BACK signals detected");
        
        // Prefer FRONT if flag is strong
        if (result.flagRedRatio > 0.20f) {
            result.side = CardSide::FRONT;
            result.confidence = 0.6f;
        } else {
            result.side = CardSide::UNKNOWN;
            result.confidence = 0.3f;
        }
        
    } else {
        // Neither clear signal
        result.side = CardSide::UNKNOWN;
        result.confidence = 0.2f;
        
        // Check if any partial signal exists
        if (result.flagDetected || result.barcodeDetected) {
            result.confidence = 0.4f;
        }
    }
    
    LOGD("RESULT: %s (confidence=%.2f)", sideToString(result.side), result.confidence);
    
    return result;
}

const char* CardSideClassifier::sideToString(CardSide side) {
    switch (side) {
        case CardSide::FRONT:   return "FRONT";
        case CardSide::BACK:    return "BACK";
        case CardSide::UNKNOWN: return "UNKNOWN";
        default:                return "INVALID";
    }
}

// ============================================================================
// Detection Methods
// ============================================================================

float CardSideClassifier::detectFlag(const cv::Mat& image) {
    // Extract flag ROI (top-left corner)
    cv::Mat flagROI = extractROI(image,
                                  SideClassifierConfig::FLAG_ROI_X,
                                  SideClassifierConfig::FLAG_ROI_Y,
                                  SideClassifierConfig::FLAG_ROI_WIDTH,
                                  SideClassifierConfig::FLAG_ROI_HEIGHT);
    
    if (flagROI.empty()) {
        LOGE("detectFlag: Failed to extract ROI");
        return 0.f;
    }
    
    // Convert to YCrCb color space
    cv::Mat ycrcb;
    if (flagROI.channels() == 1) {
        // If grayscale, cannot detect red - return 0
        LOGW("detectFlag: Image is grayscale, cannot detect red");
        return 0.f;
    } else if (flagROI.channels() == 3) {
        cv::cvtColor(flagROI, ycrcb, cv::COLOR_BGR2YCrCb);
    } else if (flagROI.channels() == 4) {
        cv::Mat bgr;
        cv::cvtColor(flagROI, bgr, cv::COLOR_BGRA2BGR);
        cv::cvtColor(bgr, ycrcb, cv::COLOR_BGR2YCrCb);
    } else {
        LOGE("detectFlag: Unsupported channel count %d", flagROI.channels());
        return 0.f;
    }
    
    // Split channels and extract Cr
    std::vector<cv::Mat> channels;
    cv::split(ycrcb, channels);
    cv::Mat crChannel = channels[1];  // Cr is channel 1 in YCrCb
    
    // Count red pixels (Cr > threshold)
    int totalPixels = crChannel.rows * crChannel.cols;
    int redPixels = 0;
    
    for (int r = 0; r < crChannel.rows; r++) {
        const uchar* row = crChannel.ptr<uchar>(r);
        for (int c = 0; c < crChannel.cols; c++) {
            if (row[c] > SideClassifierConfig::CR_THRESHOLD) {
                redPixels++;
            }
        }
    }
    
    float redRatio = static_cast<float>(redPixels) / static_cast<float>(totalPixels);
    
    LOGD("detectFlag: ROI %dx%d, redPixels=%d/%d, ratio=%.3f",
         flagROI.cols, flagROI.rows, redPixels, totalPixels, redRatio);
    
    return redRatio;
}

float CardSideClassifier::detectPhotoTexture(const cv::Mat& image) {
    // Extract photo ROI (left side, below flag)
    cv::Mat photoROI = extractROI(image,
                                   SideClassifierConfig::PHOTO_ROI_X,
                                   SideClassifierConfig::PHOTO_ROI_Y,
                                   SideClassifierConfig::PHOTO_ROI_WIDTH,
                                   SideClassifierConfig::PHOTO_ROI_HEIGHT);
    
    if (photoROI.empty()) {
        LOGE("detectPhotoTexture: Failed to extract ROI");
        return 0.f;
    }
    
    // Convert to grayscale
    cv::Mat gray = ensureGrayscale(photoROI);
    
    // Compute mean and stddev
    cv::Scalar mean, stddev;
    cv::meanStdDev(gray, mean, stddev);
    
    LOGD("detectPhotoTexture: ROI %dx%d, mean=%.1f, stddev=%.1f",
         gray.cols, gray.rows, mean[0], stddev[0]);
    
    return static_cast<float>(stddev[0]);
}

float CardSideClassifier::detectBarcode(const cv::Mat& image) {
    // Extract barcode ROI (bottom strip)
    cv::Mat barcodeROI = extractROI(image,
                                     SideClassifierConfig::BARCODE_ROI_X,
                                     SideClassifierConfig::BARCODE_ROI_Y,
                                     SideClassifierConfig::BARCODE_ROI_WIDTH,
                                     SideClassifierConfig::BARCODE_ROI_HEIGHT);
    
    if (barcodeROI.empty()) {
        LOGE("detectBarcode: Failed to extract ROI");
        return 0.f;
    }
    
    // Convert to grayscale
    cv::Mat gray = ensureGrayscale(barcodeROI);
    
    // Apply Sobel X (detect vertical edges - barcode bars)
    cv::Mat sobelX;
    cv::Sobel(gray, sobelX, CV_16S, 1, 0, 3);
    cv::Mat absSobelX;
    cv::convertScaleAbs(sobelX, absSobelX);
    
    // Adaptive threshold based on local statistics (like CardDetector)
    // This handles varying lighting conditions much better than fixed threshold
    cv::Scalar mean, stddev;
    cv::meanStdDev(absSobelX, mean, stddev);
    
    // Adaptive threshold: use mean + 0.5*stddev as threshold
    // Lower than CardDetector's 30 fixed threshold for better low-light detection
    int adaptiveThresh = std::max(15, static_cast<int>(mean[0] + stddev[0] * 0.5));
    
    cv::Mat edges;
    cv::threshold(absSobelX, edges, adaptiveThresh, 255, cv::THRESH_BINARY);
    
    // Compute edge density (ratio of edge pixels)
    int totalPixels = edges.rows * edges.cols;
    int edgePixels = cv::countNonZero(edges);
    
    float edgeDensity = static_cast<float>(edgePixels) / static_cast<float>(totalPixels);
    
    LOGD("detectBarcode: ROI %dx%d, threshold=%d, edgePixels=%d/%d, density=%.3f",
         gray.cols, gray.rows, adaptiveThresh, edgePixels, totalPixels, edgeDensity);
    
    return edgeDensity;
}

float CardSideClassifier::detectFingerprintTexture(const cv::Mat& image) {
    // Extract fingerprint ROI (right side)
    cv::Mat fpROI = extractROI(image,
                                SideClassifierConfig::FINGERPRINT_ROI_X,
                                SideClassifierConfig::FINGERPRINT_ROI_Y,
                                SideClassifierConfig::FINGERPRINT_ROI_WIDTH,
                                SideClassifierConfig::FINGERPRINT_ROI_HEIGHT);
    
    if (fpROI.empty()) {
        LOGE("detectFingerprintTexture: Failed to extract ROI");
        return 0.f;
    }
    
    // Convert to grayscale
    cv::Mat gray = ensureGrayscale(fpROI);
    
    // Compute stddev (fingerprint has high local variance)
    cv::Scalar mean, stddev;
    cv::meanStdDev(gray, mean, stddev);
    
    LOGD("detectFingerprintTexture: ROI %dx%d, mean=%.1f, stddev=%.1f",
         gray.cols, gray.rows, mean[0], stddev[0]);
    
    return static_cast<float>(stddev[0]);
}

float CardSideClassifier::computeMeanBrightness(const cv::Mat& image) {
    cv::Mat gray = ensureGrayscale(image);
    cv::Scalar mean = cv::mean(gray);
    return static_cast<float>(mean[0]);
}

// ============================================================================
// Utility Methods
// ============================================================================

cv::Mat CardSideClassifier::extractROI(const cv::Mat& image, int x, int y, int width, int height) {
    // Bounds checking
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
        LOGE("extractROI: Invalid parameters x=%d y=%d w=%d h=%d", x, y, width, height);
        return cv::Mat();
    }
    
    if (x + width > image.cols || y + height > image.rows) {
        LOGE("extractROI: ROI exceeds image bounds. ROI=[%d,%d,%d,%d] Image=[%d,%d]",
             x, y, width, height, image.cols, image.rows);
        return cv::Mat();
    }
    
    cv::Rect roi(x, y, width, height);
    return image(roi).clone();  // Clone to ensure continuous memory
}

cv::Mat CardSideClassifier::ensureGrayscale(const cv::Mat& image) {
    if (image.empty()) {
        return cv::Mat();
    }
    
    if (image.channels() == 1) {
        return image;
    } else if (image.channels() == 3) {
        cv::Mat gray;
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
        return gray;
    } else if (image.channels() == 4) {
        cv::Mat gray;
        cv::cvtColor(image, gray, cv::COLOR_BGRA2GRAY);
        return gray;
    }
    
    LOGE("ensureGrayscale: Unsupported channel count %d", image.channels());
    return cv::Mat();
}

// ============================================================================
// Preprocessing Methods (Based on CardDetector Stage 1)
// ============================================================================

cv::Mat CardSideClassifier::applyCLAHE(const cv::Mat& grayImage) {
    if (grayImage.empty() || grayImage.channels() != 1) {
        LOGE("applyCLAHE: Invalid input (empty or not grayscale)");
        return grayImage;
    }
    
    // Compute stddev to adapt CLAHE parameters (like CardDetector)
    cv::Scalar mean, stddev;
    cv::meanStdDev(grayImage, mean, stddev);
    float grayStdDev = static_cast<float>(stddev[0]);
    
    cv::Mat claheOut;
    
    // Adaptive CLAHE parameters based on image contrast (like CardDetector Stage 1)
    if (grayStdDev < 25.f) {
        // Low contrast - use strong CLAHE
        cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(
            SideClassifierConfig::CLAHE_CLIP_LIMIT + 0.5,
            cv::Size(SideClassifierConfig::CLAHE_TILE_SIZE, SideClassifierConfig::CLAHE_TILE_SIZE)
        );
        clahe->apply(grayImage, claheOut);
        LOGD("applyCLAHE: Strong clip=%.1f (stddev=%.1f)", 
             SideClassifierConfig::CLAHE_CLIP_LIMIT + 0.5, grayStdDev);
    } else if (grayStdDev < 40.f) {
        // Medium contrast
        cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(
            SideClassifierConfig::CLAHE_CLIP_LIMIT,
            cv::Size(SideClassifierConfig::CLAHE_TILE_SIZE, SideClassifierConfig::CLAHE_TILE_SIZE)
        );
        clahe->apply(grayImage, claheOut);
        LOGD("applyCLAHE: Medium clip=%.1f (stddev=%.1f)", 
             SideClassifierConfig::CLAHE_CLIP_LIMIT, grayStdDev);
    } else {
        // High contrast scene - light CLAHE
        cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(
            1.5,
            cv::Size(SideClassifierConfig::CLAHE_TILE_SIZE, SideClassifierConfig::CLAHE_TILE_SIZE)
        );
        clahe->apply(grayImage, claheOut);
        LOGD("applyCLAHE: Light clip=1.5 (stddev=%.1f)", grayStdDev);
    }
    
    // Apply GaussianBlur after CLAHE (like CardDetector)
    cv::Mat blurred;
    int ks = (SideClassifierConfig::GAUSSIAN_BLUR_SIZE % 2 == 0) 
             ? SideClassifierConfig::GAUSSIAN_BLUR_SIZE + 1 
             : SideClassifierConfig::GAUSSIAN_BLUR_SIZE;
    cv::GaussianBlur(claheOut, blurred, cv::Size(ks, ks), 0);
    
    return blurred;
}

cv::Mat CardSideClassifier::adaptiveEdgeDetection(const cv::Mat& grayImage) {
    if (grayImage.empty() || grayImage.channels() != 1) {
        LOGE("adaptiveEdgeDetection: Invalid input");
        return cv::Mat();
    }
    
    // Use central 40% region for median calculation (like CardDetector)
    int rx = grayImage.cols * 3 / 10;
    int ry = grayImage.rows * 3 / 10;
    int rw = grayImage.cols * 4 / 10;
    int rh = grayImage.rows * 4 / 10;
    
    // Clamp bounds
    rx = std::max(0, std::min(rx, grayImage.cols - 2));
    ry = std::max(0, std::min(ry, grayImage.rows - 2));
    rw = std::max(2, std::min(rw, grayImage.cols - rx));
    rh = std::max(2, std::min(rh, grayImage.rows - ry));
    
    cv::Mat roiMat = grayImage(cv::Rect(rx, ry, rw, rh));
    cv::Mat flat;
    roiMat.clone().reshape(1, 1).copyTo(flat);
    std::sort(flat.begin<uchar>(), flat.end<uchar>());
    double med = static_cast<double>(flat.at<uchar>(flat.total() / 2));
    
    // Adaptive thresholds (like CardDetector)
    int cannyLow = std::max(10, std::min(20, static_cast<int>(med * 0.33)));
    int cannyHigh = std::max(cannyLow + 20, std::min(50, static_cast<int>(med * 1.10)));
    
    cv::Mat edges;
    cv::Canny(grayImage, edges, cannyLow, cannyHigh);
    
    LOGD("adaptiveEdgeDetection: median=%.0f, low=%d, high=%d", med, cannyLow, cannyHigh);
    
    return edges;
}

// ============================================================================
// MRZ Detection (BACK indicator - 2 lines of machine-readable text at bottom)
// ============================================================================

float CardSideClassifier::detectMRZ(const cv::Mat& image) {
    // Extract MRZ ROI (bottom strip with text lines)
    cv::Mat mrzROI = extractROI(image,
                                 SideClassifierConfig::MRZ_ROI_X,
                                 SideClassifierConfig::MRZ_ROI_Y,
                                 SideClassifierConfig::MRZ_ROI_WIDTH,
                                 SideClassifierConfig::MRZ_ROI_HEIGHT);
    
    if (mrzROI.empty()) {
        LOGE("detectMRZ: Failed to extract ROI");
        return 0.f;
    }
    
    // Ensure grayscale
    cv::Mat gray = ensureGrayscale(mrzROI);
    
    // Apply Sobel Y (detect horizontal edges - text lines)
    // MRZ has 2 horizontal lines of dense text characters
    cv::Mat sobelY;
    cv::Sobel(gray, sobelY, CV_16S, 0, 1, 3);
    cv::Mat absSobelY;
    cv::convertScaleAbs(sobelY, absSobelY);
    
    // Adaptive threshold based on image statistics
    cv::Scalar mean, stddev;
    cv::meanStdDev(absSobelY, mean, stddev);
    int adaptiveThresh = std::max(15, static_cast<int>(mean[0] + stddev[0] * 0.5));
    
    cv::Mat edges;
    cv::threshold(absSobelY, edges, adaptiveThresh, 255, cv::THRESH_BINARY);
    
    // Compute horizontal edge density
    int totalPixels = edges.rows * edges.cols;
    int edgePixels = cv::countNonZero(edges);
    
    float edgeDensity = static_cast<float>(edgePixels) / static_cast<float>(totalPixels);
    
    LOGD("detectMRZ: ROI %dx%d, threshold=%d, edgePixels=%d/%d, density=%.3f",
         gray.cols, gray.rows, adaptiveThresh, edgePixels, totalPixels, edgeDensity);
    
    return edgeDensity;
}

} // namespace validation
