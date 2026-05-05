/**
 * CardSideClassifier.h
 * 
 * Phase 2 - Recto/Verso Classification for Tunisian CIN
 * 
 * REFACTORED: Uses symmetric weighted scoring (no trigger-based logic)
 * 
 * Determines whether a normalized 1000×630 grayscale card image is:
 *   - FRONT (Recto): Photo texture + Title band + No barcode
 *   - BACK (Verso): Barcode + Fingerprint texture + No photo
 *   - UNKNOWN: Cannot determine with confidence
 * 
 * Architecture:
 *   - Independent of CardDetector (frozen)
 *   - Independent of CardWarper (frozen)
 *   - Pure grayscale structural classification
 *   - No color detection (red flag removed)
 *   - No OCR, no ML, no anti-spoof
 * 
 * Input: cv::Mat exactly 1000×630 pixels (grayscale)
 * Output: CardSide enum with confidence score
 */

#ifndef CARD_SIDE_CLASSIFIER_H
#define CARD_SIDE_CLASSIFIER_H

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

namespace validation {

// ============================================================================
// Card Side Enumeration
// ============================================================================

enum class CardSide {
    FRONT,      // Recto - contains photo, personal info
    BACK,       // Verso - contains barcode, fingerprint
    UNKNOWN     // Cannot determine - fallback safety
};

// ============================================================================
// Configuration Constants (Fixed 1000×630 Space)
// ============================================================================

struct SideClassifierConfig {
    // Expected image dimensions (MUST be exactly these)
    static constexpr int EXPECTED_WIDTH  = 1000;
    static constexpr int EXPECTED_HEIGHT = 630;
    
    // ─────────────────────────────────────────────────────────────────────────
    // FRONT Evidence: Photo Region (Left Side)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int PHOTO_ROI_X      = 40;
    static constexpr int PHOTO_ROI_Y      = 160;
    static constexpr int PHOTO_ROI_WIDTH  = 300;   // 40 → 340
    static constexpr int PHOTO_ROI_HEIGHT = 400;   // 160 → 560
    
    // Photo texture threshold (high stddev = portrait present)
    static constexpr float PHOTO_STDDEV_STRONG = 30.f;
    static constexpr float PHOTO_STDDEV_WEAK   = 25.f;
    
    // Score weights
    static constexpr float PHOTO_SCORE_WEIGHT = 0.4f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // FRONT Evidence: Title Text Band (Top Horizontal Edges)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int TITLE_ROI_X      = 0;
    static constexpr int TITLE_ROI_Y      = 20;
    static constexpr int TITLE_ROI_WIDTH  = 1000;
    static constexpr int TITLE_ROI_HEIGHT = 100;   // 20 → 120
    
    // Horizontal edge density for title text
    static constexpr float TITLE_EDGE_DENSITY_MIN = 0.08f;
    static constexpr float TITLE_SCORE_WEIGHT = 0.3f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // FRONT Evidence: No Barcode in Bottom (negative BACK signal)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr float NO_BARCODE_DENSITY_MAX = 0.06f;
    static constexpr float NO_BARCODE_SCORE_WEIGHT = 0.3f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // BACK Evidence: Barcode Region (Bottom Strip)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int BARCODE_ROI_X      = 0;
    static constexpr int BARCODE_ROI_Y      = 520;
    static constexpr int BARCODE_ROI_WIDTH  = 1000;
    static constexpr int BARCODE_ROI_HEIGHT = 110;  // 520 → 630
    
    // Vertical edge density for barcode detection
    static constexpr float BARCODE_EDGE_DENSITY_MIN = 0.08f;
    static constexpr float BARCODE_SCORE_WEIGHT = 0.5f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // BACK Evidence: Fingerprint Region (Right Side) — Tightened to avoid barcode overlap
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr int FINGERPRINT_ROI_X      = 650;
    static constexpr int FINGERPRINT_ROI_Y      = 284;
    static constexpr int FINGERPRINT_ROI_WIDTH  = 270;  // 650 → 920 (was 950)
    static constexpr int FINGERPRINT_ROI_HEIGHT = 220;  // 284 → 504 (was 150→480)
    
    // Fingerprint texture threshold
    static constexpr float FINGERPRINT_STDDEV_MIN = 35.f;
    static constexpr float FINGERPRINT_SCORE_WEIGHT = 0.3f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // BACK Evidence: No Photo Texture (negative FRONT signal)
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr float NO_PHOTO_STDDEV_MAX = 25.f;
    static constexpr float NO_PHOTO_SCORE_WEIGHT = 0.2f;
    
    // ─────────────────────────────────────────────────────────────────────────
    // CLAHE Preprocessing
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr double CLAHE_CLIP_LIMIT   = 2.0;
    static constexpr int    CLAHE_TILE_SIZE    = 8;
    static constexpr int    GAUSSIAN_BLUR_SIZE = 5;
    
    // ─────────────────────────────────────────────────────────────────────────
    // Overall Brightness Check
    // ─────────────────────────────────────────────────────────────────────────
    static constexpr float BRIGHTNESS_MIN = 90.f;
};

// ============================================================================
// Classification Result with Debug Info
// ============================================================================

struct SideClassificationResult {
    CardSide side;              // Final classification
    float confidence;           // 0-1 classification confidence
    
    // Accumulated scores (for symmetric decision)
    float frontScore;           // Total FRONT evidence score
    float backScore;            // Total BACK evidence score
    
    // Individual signal metrics (for debugging/tuning)
    float photoStddev;          // Photo region texture (FRONT signal)
    float titleEdgeDensity;     // Title band horizontal edges (FRONT signal)
    float barcodeEdgeDensity;   // Barcode vertical edges (BACK signal)
    float fingerprintStddev;    // Fingerprint region texture (BACK signal)
    
    // Overall image metrics
    float meanBrightness;
    bool  brightEnough;
    
    // ─────────────────────────────────────────────────────────────────────────
    // Legacy fields for JNI compatibility (computed from new logic)
    // ─────────────────────────────────────────────────────────────────────────
    bool  flagDetected;         // Always false (red detection removed)
    float flagRedRatio;         // Always 0 (red detection removed)
    bool  photoTextureDetected; // Derived from photoStddev > threshold
    bool  barcodeDetected;      // Derived from barcodeEdgeDensity > threshold
    bool  fingerprintDetected;  // Derived from fingerprintStddev > threshold
    bool  mrzDetected;          // Always false (MRZ merged into barcode)
    float mrzEdgeDensity;       // Always 0 (MRZ merged into barcode)
};

// ============================================================================
// CardSideClassifier Class
// ============================================================================

class CardSideClassifier {
public:
    CardSideClassifier() = default;
    
    /**
     * Classify card side (simple interface)
     * @param warpedImage  Grayscale 1000×630 warped image
     * @return CardSide::FRONT, CardSide::BACK, or CardSide::UNKNOWN
     */
    CardSide classify(const cv::Mat& warpedImage);
    
    /**
     * Classify with detailed metrics (for debugging)
     * @param warpedImage  Grayscale 1000×630 warped image
     * @return Full result with all detection metrics
     */
    SideClassificationResult classifyWithDetails(const cv::Mat& warpedImage);
    
    /**
     * Convert CardSide enum to string
     */
    static const char* sideToString(CardSide side);

private:
    // ─────────────────────────────────────────────────────────────────────────
    // Detection Methods (All grayscale-based)
    // ─────────────────────────────────────────────────────────────────────────
    
    /**
     * Detect photo texture in left side ROI
     * @return Stddev of grayscale values
     */
    float detectPhotoTexture(const cv::Mat& image);
    
    /**
     * Detect title text band using horizontal edge density
     * @return Horizontal edge density (0-1)
     */
    float detectTitleBand(const cv::Mat& image);
    
    /**
     * Detect barcode in bottom ROI using vertical edge density
     * @return Vertical edge density (0-1)
     */
    float detectBarcode(const cv::Mat& image);
    
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
    
    // ─────────────────────────────────────────────────────────────────────────
    // Utility Methods
    // ─────────────────────────────────────────────────────────────────────────
    
    cv::Mat extractROI(const cv::Mat& image, int x, int y, int width, int height);
    cv::Mat ensureGrayscale(const cv::Mat& image);
    cv::Mat applyCLAHE(const cv::Mat& grayImage);
};

} // namespace validation

#endif // CARD_SIDE_CLASSIFIER_H
