/**
 * OfficialCINValidator.h
 *
 * Phase 3 — Deterministic Structural Layout Validation for Tunisian CIN
 *
 * Verifies that a warped 1000×630 grayscale image matches the official
 * Tunisian National Identity Card layout using zone-based structural
 * analysis.
 *
 * Architecture:
 *   - Fully independent of CardDetector (frozen)
 *   - Fully independent of CardWarper (frozen)
 *   - Fully independent of CardSideClassifier
 *   - No OCR, no ML, no template matching
 *   - Pure structural / statistical validation
 *   - All ROIs are ratio-based (proportional to W×H)
 *
 * Input:  cv::Mat exactly 1000×630 pixels (grayscale or BGR)
 * Output: LayoutResult with per-zone scores and overall validity
 */

#ifndef OFFICIAL_CIN_VALIDATOR_H
#define OFFICIAL_CIN_VALIDATOR_H

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>

namespace validation {

// ============================================================================
// Layout Validation Result
// ============================================================================

struct FrontLayoutResult {
    bool   valid;        // Overall layout valid
    float  score;        // Weighted total score (0–1)

    // Individual zone scores (0–1 each)
    float  flagScore;        // Zone 1: Flag (top-right)
    float  logoScore;        // Zone 2: Ministry logo / emblem
    float  photoScore;       // Zone 3: Photo region (left block)
    float  headerScore;      // Zone 4: Header text band (top center)
    float  idNumberScore;    // Zone 5: ID number zone (center)
    float  brightnessScore;  // Zone 6: Global brightness consistency
};

struct BackLayoutResult {
    bool   valid;        // Overall layout valid
    float  score;        // Weighted total score (0–1)

    // Individual zone scores (0–1 each)
    float  fingerprintScore; // Zone 1: Fingerprint region (right)
    float  barcodeScore;     // Zone 2: Barcode zone (bottom strip)
    float  stampScore;       // Zone 3: Municipal stamp (center)
    float  textScore;        // Zone 4: Upper text block
    float  brightnessScore;  // Zone 5: Global structure / brightness
};

// ============================================================================
// Configuration — All ROIs Are Ratio-Based
// ============================================================================

struct CINLayoutConfig {
    // Expected image dimensions
    static constexpr int EXPECTED_WIDTH  = 1000;
    static constexpr int EXPECTED_HEIGHT = 630;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Zone 1: Flag (Top-Right)
    //   Tunisian flag: red rectangle with white circle + crescent/star
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float FLAG_X1 = 0.82f;
    static constexpr float FLAG_Y1 = 0.02f;
    static constexpr float FLAG_X2 = 0.98f;
    static constexpr float FLAG_Y2 = 0.20f;

    static constexpr float FLAG_STDDEV_MIN     = 25.0f;
    static constexpr float FLAG_EDGE_DENSITY_MIN = 0.04f;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Zone 2: Ministry Logo / Golden Emblem (Bottom-Right)
    //   Coat of arms emblem visible in bottom-right area
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float LOGO_X1 = 0.78f;
    static constexpr float LOGO_Y1 = 0.78f;
    static constexpr float LOGO_X2 = 0.96f;
    static constexpr float LOGO_Y2 = 0.96f;

    static constexpr float LOGO_EDGE_DENSITY_MIN = 0.03f;
    static constexpr float LOGO_STDDEV_MIN       = 18.0f;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Zone 3: Photo Region (Left Block)
    //   B&W passport photo occupying left side
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float PHOTO_X1 = 0.04f;
    static constexpr float PHOTO_Y1 = 0.22f;
    static constexpr float PHOTO_X2 = 0.34f;
    static constexpr float PHOTO_Y2 = 0.88f;

    static constexpr float PHOTO_STDDEV_MIN = 28.0f;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Zone 4: Header Text Band (Top Center)
    //   "الجمهورية التونسية" / "بطاقة التعريف الوطنية"
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float HEADER_X1 = 0.18f;
    static constexpr float HEADER_Y1 = 0.03f;
    static constexpr float HEADER_X2 = 0.80f;
    static constexpr float HEADER_Y2 = 0.18f;

    static constexpr float HEADER_EDGE_DENSITY_MIN      = 0.06f;
    static constexpr float HEADER_PROJECTION_VARIANCE_MIN = 80.0f;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Zone 5: ID Number Zone (Center)
    //   8-digit CIN number with vertical strokes
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float ID_X1 = 0.40f;
    static constexpr float ID_Y1 = 0.28f;
    static constexpr float ID_X2 = 0.62f;
    static constexpr float ID_Y2 = 0.50f;

    static constexpr float ID_VEDGE_DENSITY_MIN = 0.05f;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Zone 6: Global Brightness
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float BRIGHTNESS_MEAN_MIN   = 120.0f;
    static constexpr float BRIGHTNESS_STDDEV_MIN = 15.0f;

    // ─────────────────────────────────────────────────────────────────────
    // FRONT Scoring Weights (rebalanced: Photo dominant)
    // ───────────────────────────────────────────────────────────────────
    static constexpr float FRONT_FLAG_WEIGHT       = 0.15f;
    static constexpr float FRONT_LOGO_WEIGHT       = 0.15f;
    static constexpr float FRONT_PHOTO_WEIGHT      = 0.30f;  // was 0.25
    static constexpr float FRONT_HEADER_WEIGHT     = 0.15f;  // was 0.20
    static constexpr float FRONT_ID_WEIGHT         = 0.15f;
    static constexpr float FRONT_BRIGHTNESS_WEIGHT = 0.10f;  // kept at 0.10 for sum=1.00
    // SUM = 0.15+0.15+0.30+0.15+0.15+0.10 = 1.00 ✓

    static constexpr float FRONT_VALID_THRESHOLD   = 0.67f;

    // Per-zone minimum floors (hard reject if critical zone below floor)
    static constexpr float FRONT_PHOTO_FLOOR = 0.25f;
    static constexpr float FRONT_FLAG_FLOOR  = 0.25f;  // flag zone must show dark region (red flag)

    // ═════════════════════════════════════════════════════════════════════
    // BACK ZONES
    // ═════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────
    // BACK Zone 1: Fingerprint Region (Right Side) — Y2 tightened to avoid barcode overlap
    // ───────────────────────────────────────────────────────────────────
    static constexpr float FP_X1 = 0.60f;
    static constexpr float FP_Y1 = 0.35f;
    static constexpr float FP_X2 = 0.95f;
    static constexpr float FP_Y2 = 0.80f;  // was 0.85 — eliminates overlap with barcode

    static constexpr float FP_STDDEV_MIN       = 30.0f;
    static constexpr float FP_EDGE_DENSITY_MIN = 0.05f;

    // ─────────────────────────────────────────────────────────────────────
    // BACK Zone 2: Barcode Zone (Bottom Strip)
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float BC_X1 = 0.05f;
    static constexpr float BC_Y1 = 0.82f;
    static constexpr float BC_X2 = 0.95f;
    static constexpr float BC_Y2 = 0.96f;

    static constexpr float BC_VEDGE_DENSITY_MIN = 0.10f;  // raised: text rarely exceeds this

    // ─────────────────────────────────────────────────────────────────────
    // BACK Zone 3: Municipal Stamp (Center-Left)
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float STAMP_X1 = 0.25f;
    static constexpr float STAMP_Y1 = 0.42f;
    static constexpr float STAMP_X2 = 0.55f;
    static constexpr float STAMP_Y2 = 0.72f;

    static constexpr float STAMP_EDGE_DENSITY_MIN = 0.02f;
    static constexpr float STAMP_STDDEV_MIN       = 12.0f;

    // ─────────────────────────────────────────────────────────────────────
    // BACK Zone 4: Upper Text Block
    // ─────────────────────────────────────────────────────────────────────
    static constexpr float BTEXT_X1 = 0.08f;
    static constexpr float BTEXT_Y1 = 0.05f;
    static constexpr float BTEXT_X2 = 0.90f;
    static constexpr float BTEXT_Y2 = 0.40f;

    static constexpr float BTEXT_HEDGE_DENSITY_MIN = 0.04f;

    // ─────────────────────────────────────────────────────────────────────
    // BACK Zone 5: Global Structure / Brightness
    // ─────────────────────────────────────────────────────────────────────
    // Re-uses BRIGHTNESS_MEAN_MIN and BRIGHTNESS_STDDEV_MIN

    // ─────────────────────────────────────────────────────────────────────
    // BACK Scoring Weights (rebalanced: barcode reduced, text raised)
    // ───────────────────────────────────────────────────────────────────
    static constexpr float BACK_FP_WEIGHT         = 0.30f;
    static constexpr float BACK_BC_WEIGHT         = 0.25f;  // was 0.30
    static constexpr float BACK_STAMP_WEIGHT      = 0.20f;
    static constexpr float BACK_TEXT_WEIGHT        = 0.20f;  // was 0.10
    static constexpr float BACK_BRIGHTNESS_WEIGHT  = 0.05f;  // was 0.10
    // SUM = 0.30+0.25+0.20+0.20+0.05 = 1.00 ✓

    static constexpr float BACK_VALID_THRESHOLD    = 0.68f;

    // Per-zone minimum floors (hard reject if critical zone below floor)
    static constexpr float BACK_FP_FLOOR = 0.30f;  // raised: fingerprint isotropy gate ensures this
    static constexpr float BACK_BC_FLOOR = 0.30f;  // raised: barcode vEdge gate ensures this

    // ─────────────────────────────────────────────────────────────────────
    // CLAHE Preprocessing
    // ─────────────────────────────────────────────────────────────────────
    static constexpr double CLAHE_CLIP_LIMIT  = 2.0;
    static constexpr int    CLAHE_TILE_SIZE   = 8;
    static constexpr int    GAUSSIAN_BLUR_K   = 3;
};

// ============================================================================
// OfficialCINValidator Class
// ============================================================================

class OfficialCINValidator {
public:
    OfficialCINValidator() = default;

    /**
     * Validate a warped FRONT (Recto) image against official CIN layout.
     * @param warpedGray  Grayscale or BGR 1000×630 image
     * @return FrontLayoutResult with zone scores and overall validity
     */
    FrontLayoutResult validateFront(const cv::Mat& warpedGray);

    /**
     * Validate a warped BACK (Verso) image against official CIN layout.
     * @param warpedGray  Grayscale or BGR 1000×630 image
     * @return BackLayoutResult with zone scores and overall validity
     */
    BackLayoutResult validateBack(const cv::Mat& warpedGray);

private:
    // ── FRONT zone evaluators ──────────────────────────────────────────
    float evaluateFlagZone(const cv::Mat& gray);
    float evaluateLogoZone(const cv::Mat& gray);
    float evaluatePhotoZone(const cv::Mat& gray);
    float evaluateHeaderZone(const cv::Mat& gray);
    float evaluateIdNumberZone(const cv::Mat& gray);

    // ── BACK zone evaluators ───────────────────────────────────────────
    float evaluateFingerprintZone(const cv::Mat& gray);
    float evaluateBarcodeZone(const cv::Mat& gray);
    float evaluateStampZone(const cv::Mat& gray);
    float evaluateBackTextZone(const cv::Mat& gray);

    // ── Shared evaluators ──────────────────────────────────────────────
    float evaluateBrightness(const cv::Mat& gray);

    // ── Utility ────────────────────────────────────────────────────────
    cv::Mat extractROI(const cv::Mat& img, float x1Ratio, float y1Ratio,
                       float x2Ratio, float y2Ratio);
    cv::Mat ensureGrayscale(const cv::Mat& img);
    cv::Mat preprocess(const cv::Mat& img);
    float   computeEdgeDensitySobelX(const cv::Mat& gray);
    float   computeEdgeDensitySobelY(const cv::Mat& gray);
    float   computeEdgeDensityCanny(const cv::Mat& gray);
    float   computeRowProjectionVariance(const cv::Mat& gray);
    float   computeColumnProjectionVariance(const cv::Mat& gray);
};

} // namespace validation

#endif // OFFICIAL_CIN_VALIDATOR_H
