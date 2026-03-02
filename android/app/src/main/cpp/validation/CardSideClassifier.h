/**
 * CardSideClassifier.h
 * 
 * Phase 2 - Recto/Verso Classification for Tunisian CIN
 * 
 * Determines whether a normalized 1000×630 card image is:
 *   - FRONT (Recto): Contains flag, photo, ministry logo
 *   - BACK (Verso): Contains barcode, fingerprint, stamp
 *   - UNKNOWN: Cannot determine with confidence
 * 
 * Architecture:
 *   - Independent of CardDetector (frozen)
 *   - Independent of CardWarper (frozen)
 *   - Pure structural classification
 *   - No OCR, no ML, no anti-spoof
 * 
 * Input: cv::Mat exactly 1000×630 pixels
 * Output: CardSide enum
 */

#ifndef CARD_SIDE_CLASSIFIER_H
#define CARD_SIDE_CLASSIFIER_H

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

namespace validation {

// ============================================================================
// Card Side Enumeration
// ============================================================================

/**
 * Classification result for card orientation
 */
enum class CardSide {
    FRONT,      // Recto - contains flag, photo, personal info
    BACK,       // Verso - contains barcode, fingerprint, stamp
    UNKNOWN     // Cannot determine - fallback safety
};

// ============================================================================
// Configuration Constants (Fixed - Do Not Modify at Runtime)
// ============================================================================

/**
 * Configuration for side classification
 * All values are fixed constants relative to 1000×630 space
 */
struct SideClassifierConfig {
    // Expected image dimensions (MUST be exactly these)
    static constexpr int EXPECTED_WIDTH  = 1000;
    static constexpr int EXPECTED_HEIGHT = 630;
    
    // ─────────────────────────────────────────────────────────────────────────
    // FRONT Detection: Flag ROI (Top-Left)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int FLAG_ROI_X      = 0;
    static constexpr int FLAG_ROI_Y      = 0;
    static constexpr int FLAG_ROI_WIDTH  = 180;
    static constexpr int FLAG_ROI_HEIGHT = 150;
    
    // Red detection in YCrCb space (Tunisian flag red)
    static constexpr int   CR_THRESHOLD       = 150;   // Cr > 150 → red pixel
    static constexpr float RED_RATIO_MIN      = 0.12f; // >12% red pixels → flag detected
    
    // ─────────────────────────────────────────────────────────────────────────
    // FRONT Detection: Photo Texture ROI (Left Side)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int PHOTO_ROI_X      = 0;
    static constexpr int PHOTO_ROI_Y      = 180;
    static constexpr int PHOTO_ROI_WIDTH  = 350;
    static constexpr int PHOTO_ROI_HEIGHT = 450;  // 180 → 630
    
    // Texture variance threshold (face has moderate texture)
    static constexpr float PHOTO_STDDEV_MIN = 20.f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // Overall Brightness Check
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr float BRIGHTNESS_MIN = 90.f;  // Reject very dark images
    
    // ─────────────────────────────────────────────────────────────────────────
    // BACK Detection: Barcode ROI (Bottom Strip)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int BARCODE_ROI_X      = 0;
    static constexpr int BARCODE_ROI_Y      = 520;
    static constexpr int BARCODE_ROI_WIDTH  = 1000;
    static constexpr int BARCODE_ROI_HEIGHT = 110;  // 520 → 630
    
    // Barcode edge density threshold (vertical lines)
    static constexpr float BARCODE_EDGE_DENSITY_MIN = 0.08f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // BACK Detection: Fingerprint ROI (Right Side)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int FINGERPRINT_ROI_X      = 650;
    static constexpr int FINGERPRINT_ROI_Y      = 150;
    static constexpr int FINGERPRINT_ROI_WIDTH  = 350;
    static constexpr int FINGERPRINT_ROI_HEIGHT = 350;  // 150 → 500
    
    // Fingerprint texture threshold (high local variance)
    static constexpr float FINGERPRINT_STDDEV_MIN = 25.f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // BACK Detection: MRZ Text ROI (Bottom - 2 lines of machine-readable text)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int MRZ_ROI_X      = 50;
    static constexpr int MRZ_ROI_Y      = 540;
    static constexpr int MRZ_ROI_WIDTH  = 900;
    static constexpr int MRZ_ROI_HEIGHT = 80;   // Contains 2 MRZ lines
    
    // MRZ horizontal edge density threshold (text lines)
    static constexpr float MRZ_EDGE_DENSITY_MIN = 0.05f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // CLAHE Preprocessing (applied like CardDetector Stage 1)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr double CLAHE_CLIP_LIMIT      = 2.0;
    static constexpr int    CLAHE_TILE_SIZE       = 8;
    static constexpr int    GAUSSIAN_BLUR_SIZE    = 5;
};

// ============================================================================
// Classification Result with Debug Info
// ============================================================================

/**
 * Detailed result with metrics for debugging
 */
struct SideClassificationResult {
    CardSide side;              // Final classification
    
    // FRONT metrics
    bool  flagDetected;         // Red flag found in top-left
    float flagRedRatio;         // Red pixel ratio in flag ROI
    bool  photoTextureDetected; // Photo texture found
    float photoStddev;          // Stddev in photo ROI
    
    // BACK metrics
    bool  barcodeDetected;      // Barcode edge pattern found
    float barcodeEdgeDensity;   // Edge density in barcode ROI
    bool  fingerprintDetected;  // Fingerprint texture found
    float fingerprintStddev;    // Stddev in fingerprint ROI
    bool  mrzDetected;          // MRZ text pattern found (BACK indicator)
    float mrzEdgeDensity;       // Horizontal edge density in MRZ ROI
    
    // Overall
    float meanBrightness;       // Overall card brightness
    bool  brightEnough;         // Above minimum brightness
    
    // Confidence
    float confidence;           // 0-1 classification confidence
};

// ============================================================================
// CardSideClassifier Class
// ============================================================================

/**
 * Classifier for determining CIN card side (FRONT/BACK)
 * 
 * Usage:
 *   CardSideClassifier classifier;
 *   CardSide side = classifier.classify(warpedImage);
 *   // or for detailed result:
 *   SideClassificationResult result = classifier.classifyWithDetails(warpedImage);
 */
class CardSideClassifier {
public:
    /**
     * Default constructor
     */
    CardSideClassifier() = default;
    
    /**
     * Classify card side (simple interface)
     * 
     * @param warpedImage  Normalized card image (MUST be 1000×630)
     * @return CardSide::FRONT, CardSide::BACK, or CardSide::UNKNOWN
     */
    CardSide classify(const cv::Mat& warpedImage);
    
    /**
     * Classify with detailed metrics (for debugging)
     * 
     * @param warpedImage  Normalized card image (MUST be 1000×630)
     * @return Full result with all detection metrics
     */
    SideClassificationResult classifyWithDetails(const cv::Mat& warpedImage);
    
    /**
     * Convert CardSide enum to string
     */
    static const char* sideToString(CardSide side);

private:
    // ─────────────────────────────────────────────────────────────────────────
    // Detection Methods
    // ─────────────────────────────────────────────────────────────────────────
    
    /**
     * Detect red flag in top-left ROI
     * @return Red pixel ratio (0-1)
     */
    float detectFlag(const cv::Mat& image);
    
    /**
     * Detect photo texture in left side ROI
     * @return Stddev of grayscale values
     */
    float detectPhotoTexture(const cv::Mat& image);
    
    /**
     * Detect barcode in bottom ROI using vertical edge density
     * @return Edge density (0-1)
     */
    float detectBarcode(const cv::Mat& image);
    
    /**
     * Detect MRZ text lines in bottom ROI using horizontal edge density
     * @return Horizontal edge density (0-1)
     */
    float detectMRZ(const cv::Mat& image);
    
    /**
     * Detect fingerprint texture in right side ROI
     * @return Stddev of grayscale values
     */
    float detectFingerprintTexture(const cv::Mat& image);
    
    /**
     * Compute overall mean brightness
     * @return Mean luminance (0-255)
     */
    float computeMeanBrightness(const cv::Mat& image);
    
    /**
     * Safely extract ROI with bounds checking
     */
    cv::Mat extractROI(const cv::Mat& image, int x, int y, int width, int height);
    
    /**
     * Convert image to grayscale if needed
     */
    cv::Mat ensureGrayscale(const cv::Mat& image);
    
    /**
     * Apply CLAHE preprocessing (like CardDetector Stage 1)
     * Normalizes local contrast for better feature detection
     */
    cv::Mat applyCLAHE(const cv::Mat& grayImage);
    
    /**
     * Adaptive edge detection similar to CardDetector
     * Uses median-based Canny thresholds
     */
    cv::Mat adaptiveEdgeDetection(const cv::Mat& grayImage);
};

} // namespace validation

#endif // CARD_SIDE_CLASSIFIER_H
