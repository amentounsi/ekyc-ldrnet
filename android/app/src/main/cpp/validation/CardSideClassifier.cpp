/**
 * CardSideClassifier.cpp
 * 
 * Phase 2 - Recto/Verso Classification for Tunisian CIN
 * 
 * REFACTORED: Symmetric Weighted Scoring System
 * 
 * Classification Strategy:
 *   - Accumulate FRONT evidence independently
 *   - Accumulate BACK evidence independently
 *   - Compare scores: higher score wins
 *   - No early returns, no trigger-based logic
 * 
 * FRONT Evidence (grayscale):
 *   1. Photo texture in left region (stddev > 30) → +0.4
 *   2. Title band horizontal edges (density > 0.08) → +0.3
 *   3. No barcode at bottom (density < 0.06) → +0.3
 * 
 * BACK Evidence (grayscale):
 *   1. Barcode vertical edges (density > 0.08) → +0.5
 *   2. Fingerprint texture (stddev > 35) → +0.3
 *   3. No photo texture on left (stddev < 25) → +0.2
 */

#include "CardSideClassifier.h"
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <algorithm>
#include <android/log.h>

#define LOG_TAG "CardSideClassifier"

// Always log classification results for debugging
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Diagnostic tag for pipeline testing (adb logcat | grep CIN)
#define LOGD_CIN(...) __android_log_print(ANDROID_LOG_DEBUG, "CIN", __VA_ARGS__)

namespace validation {

// ============================================================================
// Public Interface
// ============================================================================

CardSide CardSideClassifier::classify(const cv::Mat& warpedImage) {
    SideClassificationResult result = classifyWithDetails(warpedImage);
    return result.side;
}

SideClassificationResult CardSideClassifier::classifyWithDetails(const cv::Mat& warpedImage) {
    // Initialize result with zeros
    SideClassificationResult result;
    result.side = CardSide::UNKNOWN;
    result.confidence = 0.f;
    result.frontScore = 0.f;
    result.backScore = 0.f;
    result.photoStddev = 0.f;
    result.titleEdgeDensity = 0.f;
    result.barcodeEdgeDensity = 0.f;
    result.fingerprintStddev = 0.f;
    result.meanBrightness = 0.f;
    result.brightEnough = false;
    
    // Legacy fields (for JNI compatibility)
    result.flagDetected = false;
    result.flagRedRatio = 0.f;
    result.photoTextureDetected = false;
    result.barcodeDetected = false;
    result.fingerprintDetected = false;
    result.mrzDetected = false;
    result.mrzEdgeDensity = 0.f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Validate Input
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
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Preprocessing
    // ─────────────────────────────────────────────────────────────────────────
    
    cv::Mat grayInput = ensureGrayscale(warpedImage);
    cv::Mat preprocessed = applyCLAHE(grayInput);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Brightness Check
    // ─────────────────────────────────────────────────────────────────────────
    
    result.meanBrightness = computeMeanBrightness(preprocessed);
    result.brightEnough = (result.meanBrightness >= SideClassifierConfig::BRIGHTNESS_MIN);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Compute All Detection Signals (NO EARLY RETURNS)
    // ─────────────────────────────────────────────────────────────────────────
    
    // 4a. Photo texture (FRONT signal / BACK anti-signal)
    result.photoStddev = detectPhotoTexture(preprocessed);
    
    // 4b. Title band horizontal edges (FRONT signal)
    result.titleEdgeDensity = detectTitleBand(preprocessed);
    
    // 4c. Barcode vertical edges (BACK signal / FRONT anti-signal)
    result.barcodeEdgeDensity = detectBarcode(preprocessed);
    
    // 4d. Fingerprint texture (BACK signal)
    result.fingerprintStddev = detectFingerprintTexture(preprocessed);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 4e: Set legacy boolean fields for JNI compatibility
    // ─────────────────────────────────────────────────────────────────────────
    
    result.photoTextureDetected = (result.photoStddev > SideClassifierConfig::PHOTO_STDDEV_STRONG);
    result.barcodeDetected = (result.barcodeEdgeDensity > SideClassifierConfig::BARCODE_EDGE_DENSITY_MIN);
    result.fingerprintDetected = (result.fingerprintStddev > SideClassifierConfig::FINGERPRINT_STDDEV_MIN);
    // flagDetected, flagRedRatio, mrzDetected, mrzEdgeDensity remain 0/false
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Accumulate FRONT Score
    // ─────────────────────────────────────────────────────────────────────────
    
    // FRONT Signal 1: Photo texture (stddev > 30)
    if (result.photoStddev > SideClassifierConfig::PHOTO_STDDEV_STRONG) {
        result.frontScore += SideClassifierConfig::PHOTO_SCORE_WEIGHT;
    }
    
    // FRONT Signal 1b: Photo dominant boost (stddev > 45 = very strong portrait)
    if (result.photoStddev > 45.f) {
        result.frontScore += 0.40f;
        LOGI("  [BOOST] Photo stddev %.1f > 45 → frontScore += 0.40", result.photoStddev);
    }
    
    // FRONT Signal 2: Title band horizontal edges (density > 0.08)
    if (result.titleEdgeDensity > SideClassifierConfig::TITLE_EDGE_DENSITY_MIN) {
        result.frontScore += SideClassifierConfig::TITLE_SCORE_WEIGHT;
    }
    
    // FRONT Signal 3: No barcode at bottom (density < 0.06)
    if (result.barcodeEdgeDensity < SideClassifierConfig::NO_BARCODE_DENSITY_MAX) {
        result.frontScore += SideClassifierConfig::NO_BARCODE_SCORE_WEIGHT;
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Accumulate BACK Score
    // ─────────────────────────────────────────────────────────────────────────
    
    // BACK Signal 1: Barcode vertical edges (density > 0.08)
    if (result.barcodeEdgeDensity > SideClassifierConfig::BARCODE_EDGE_DENSITY_MIN) {
        result.backScore += SideClassifierConfig::BARCODE_SCORE_WEIGHT;
    }
    
    // BACK Signal 2: Fingerprint texture (stddev > 35)
    if (result.fingerprintStddev > SideClassifierConfig::FINGERPRINT_STDDEV_MIN) {
        result.backScore += SideClassifierConfig::FINGERPRINT_SCORE_WEIGHT;
    }
    
    // BACK Signal 3: No photo texture on left (stddev < 25)
    if (result.photoStddev < SideClassifierConfig::NO_PHOTO_STDDEV_MAX) {
        result.backScore += SideClassifierConfig::NO_PHOTO_SCORE_WEIGHT;
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 6b: Contradiction Penalty — strong photo suppresses BACK
    // ─────────────────────────────────────────────────────────────────────────
    if (result.photoStddev > 45.f) {
        float oldBack = result.backScore;
        result.backScore *= 0.6f;
        LOGI("  [PENALTY] Photo stddev %.1f > 45 → backScore %.3f → %.3f",
             result.photoStddev, oldBack, result.backScore);
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Decisive Override Rules (before score comparison)
    // ─────────────────────────────────────────────────────────────────────────
    
    // Hard override: very strong photo + weak fingerprint → FRONT
    if (result.photoStddev > 50.f && result.fingerprintStddev < 45.f) {
        result.side = CardSide::FRONT;
        result.confidence = 0.95f;
        LOGI("  [OVERRIDE] photo=%.1f > 50, fp=%.1f < 45 → FORCE FRONT",
             result.photoStddev, result.fingerprintStddev);
    }
    // Hard override: very strong fingerprint + weak photo → BACK
    else if (result.fingerprintStddev > 50.f && result.photoStddev < 40.f) {
        result.side = CardSide::BACK;
        result.confidence = 0.95f;
        LOGI("  [OVERRIDE] fp=%.1f > 50, photo=%.1f < 40 → FORCE BACK",
             result.fingerprintStddev, result.photoStddev);
    }
    // Normal decision: higher score wins
    else {
        float totalScore = result.frontScore + result.backScore;
        
        if (totalScore > 0.f) {
            // Compute confidence as ratio of winning score to total
            float maxScore = std::max(result.frontScore, result.backScore);
            result.confidence = maxScore / totalScore;
            
            // Clamp confidence to [0, 1]
            result.confidence = std::min(1.f, std::max(0.f, result.confidence));
            
            // Decision: higher score wins
            if (result.frontScore > result.backScore) {
                result.side = CardSide::FRONT;
            } else {
                result.side = CardSide::BACK;
            }
        } else {
            // No evidence for either side
            result.side = CardSide::UNKNOWN;
            result.confidence = 0.f;
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Mandatory Debug Output
    // ─────────────────────────────────────────────────────────────────────────
    
    LOGI("═══════════════════════════════════════════════════════════════════");
    LOGI("CLASSIFICATION RESULT: %s", sideToString(result.side));
    LOGI("───────────────────────────────────────────────────────────────────");
    LOGI("  frontScore = %.3f", result.frontScore);
    LOGI("  backScore  = %.3f", result.backScore);
    LOGI("  confidence = %.3f", result.confidence);
    LOGI("───────────────────────────────────────────────────────────────────");
    LOGI("  photoStddev       = %.2f (FRONT if > %.1f, BACK if < %.1f)", 
         result.photoStddev,
         SideClassifierConfig::PHOTO_STDDEV_STRONG,
         SideClassifierConfig::NO_PHOTO_STDDEV_MAX);
    LOGI("  titleEdgeDensity  = %.4f (FRONT if > %.2f)",
         result.titleEdgeDensity,
         SideClassifierConfig::TITLE_EDGE_DENSITY_MIN);
    LOGI("  barcodeEdgeDensity= %.4f (BACK if > %.2f, FRONT if < %.2f)",
         result.barcodeEdgeDensity,
         SideClassifierConfig::BARCODE_EDGE_DENSITY_MIN,
         SideClassifierConfig::NO_BARCODE_DENSITY_MAX);
    LOGI("  fingerprintStddev = %.2f (BACK if > %.1f)",
         result.fingerprintStddev,
         SideClassifierConfig::FINGERPRINT_STDDEV_MIN);
    LOGI("───────────────────────────────────────────────────────────────────");
    LOGI("  brightness = %.1f (min %.1f) → %s",
         result.meanBrightness,
         SideClassifierConfig::BRIGHTNESS_MIN,
         result.brightEnough ? "OK" : "DARK");
    LOGI("═══════════════════════════════════════════════════════════════════");

    // Stage C diagnostic log
    LOGD_CIN("CLASS photoStd=%.1f fingerprintStd=%.1f barcode=%.4f title=%.4f result=%d",
             result.photoStddev, result.fingerprintStddev,
             result.barcodeEdgeDensity, result.titleEdgeDensity,
             static_cast<int>(result.side));
    
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

float CardSideClassifier::detectPhotoTexture(const cv::Mat& image) {
    cv::Mat photoROI = extractROI(image,
                                   SideClassifierConfig::PHOTO_ROI_X,
                                   SideClassifierConfig::PHOTO_ROI_Y,
                                   SideClassifierConfig::PHOTO_ROI_WIDTH,
                                   SideClassifierConfig::PHOTO_ROI_HEIGHT);
    
    if (photoROI.empty()) {
        LOGE("detectPhotoTexture: Failed to extract ROI");
        return 0.f;
    }
    
    cv::Mat gray = ensureGrayscale(photoROI);
    
    cv::Scalar mean, stddev;
    cv::meanStdDev(gray, mean, stddev);
    
    return static_cast<float>(stddev[0]);
}

float CardSideClassifier::detectTitleBand(const cv::Mat& image) {
    cv::Mat titleROI = extractROI(image,
                                   SideClassifierConfig::TITLE_ROI_X,
                                   SideClassifierConfig::TITLE_ROI_Y,
                                   SideClassifierConfig::TITLE_ROI_WIDTH,
                                   SideClassifierConfig::TITLE_ROI_HEIGHT);
    
    if (titleROI.empty()) {
        LOGE("detectTitleBand: Failed to extract ROI");
        return 0.f;
    }
    
    cv::Mat gray = ensureGrayscale(titleROI);
    
    // Apply Sobel Y (detect horizontal edges - text lines)
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
    
    return static_cast<float>(edgePixels) / static_cast<float>(totalPixels);
}

float CardSideClassifier::detectBarcode(const cv::Mat& image) {
    cv::Mat barcodeROI = extractROI(image,
                                     SideClassifierConfig::BARCODE_ROI_X,
                                     SideClassifierConfig::BARCODE_ROI_Y,
                                     SideClassifierConfig::BARCODE_ROI_WIDTH,
                                     SideClassifierConfig::BARCODE_ROI_HEIGHT);
    
    if (barcodeROI.empty()) {
        LOGE("detectBarcode: Failed to extract ROI");
        return 0.f;
    }
    
    cv::Mat gray = ensureGrayscale(barcodeROI);
    
    // Apply Sobel X (detect vertical edges - barcode bars)
    cv::Mat sobelX;
    cv::Sobel(gray, sobelX, CV_16S, 1, 0, 3);
    cv::Mat absSobelX;
    cv::convertScaleAbs(sobelX, absSobelX);
    
    // Adaptive threshold
    cv::Scalar mean, stddev;
    cv::meanStdDev(absSobelX, mean, stddev);
    int adaptiveThresh = std::max(15, static_cast<int>(mean[0] + stddev[0] * 0.5));
    
    cv::Mat edges;
    cv::threshold(absSobelX, edges, adaptiveThresh, 255, cv::THRESH_BINARY);
    
    // Compute vertical edge density
    int totalPixels = edges.rows * edges.cols;
    int edgePixels = cv::countNonZero(edges);
    
    return static_cast<float>(edgePixels) / static_cast<float>(totalPixels);
}

float CardSideClassifier::detectFingerprintTexture(const cv::Mat& image) {
    cv::Mat fpROI = extractROI(image,
                                SideClassifierConfig::FINGERPRINT_ROI_X,
                                SideClassifierConfig::FINGERPRINT_ROI_Y,
                                SideClassifierConfig::FINGERPRINT_ROI_WIDTH,
                                SideClassifierConfig::FINGERPRINT_ROI_HEIGHT);
    
    if (fpROI.empty()) {
        LOGE("detectFingerprintTexture: Failed to extract ROI");
        return 0.f;
    }
    
    cv::Mat gray = ensureGrayscale(fpROI);
    
    cv::Scalar mean, stddev;
    cv::meanStdDev(gray, mean, stddev);
    
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
    return image(roi).clone();
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

cv::Mat CardSideClassifier::applyCLAHE(const cv::Mat& grayImage) {
    if (grayImage.empty() || grayImage.channels() != 1) {
        LOGE("applyCLAHE: Invalid input");
        return grayImage;
    }
    
    // Compute stddev for adaptive CLAHE
    cv::Scalar mean, stddev;
    cv::meanStdDev(grayImage, mean, stddev);
    float grayStdDev = static_cast<float>(stddev[0]);
    
    cv::Mat claheOut;
    double clipLimit;
    
    if (grayStdDev < 25.f) {
        clipLimit = SideClassifierConfig::CLAHE_CLIP_LIMIT + 0.5;
    } else if (grayStdDev < 40.f) {
        clipLimit = SideClassifierConfig::CLAHE_CLIP_LIMIT;
    } else {
        clipLimit = 1.5;
    }
    
    cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(
        clipLimit,
        cv::Size(SideClassifierConfig::CLAHE_TILE_SIZE, SideClassifierConfig::CLAHE_TILE_SIZE)
    );
    clahe->apply(grayImage, claheOut);
    
    // Apply Gaussian blur
    cv::Mat blurred;
    int ks = (SideClassifierConfig::GAUSSIAN_BLUR_SIZE % 2 == 0) 
             ? SideClassifierConfig::GAUSSIAN_BLUR_SIZE + 1 
             : SideClassifierConfig::GAUSSIAN_BLUR_SIZE;
    cv::GaussianBlur(claheOut, blurred, cv::Size(ks, ks), 0);
    
    return blurred;
}

} // namespace validation
