/**
 * ScreenDetector.h
 * 
 * Anti-Spoof Module: Detects if CIN card is displayed on a screen vs real
 * physical card.  PRIMARY PATH runs BEFORE edge-detection / warp on the raw
 * camera ROI (center-cropped) together with the Cr (V) chroma plane.
 *
 * Pre-Detection Signals (raw frame, fast):
 *   1. Chroma Uniformity   — Cr channel stddev (screens emit narrow chroma)
 *   2. Micro-Texture        — High-pass variance on center crop
 *   3. Gradient Regularity  — Coefficient-of-variation of directional gradients
 *   4. Brightness Uniformity — Variance of quadrant mean brightness
 *   5. Moiré Interference   — Diagonal Gabor-filter response
 *
 * Temporal Accumulation:
 *   Sliding window of last N frames.  Confirmed screen only when a
 *   super-majority of frames are suspicious.  Hysteresis prevents flicker.
 *
 * Post-Warp Analysis (kept as lightweight backup — should rarely be needed):
 *   FFT, Moiré, Texture, Specular, ColorBanding on 1000×630 warped image.
 */

#ifndef SCREEN_DETECTOR_H
#define SCREEN_DETECTOR_H

#include <opencv2/core.hpp>
#include <vector>
#include <deque>

namespace validation {

// ============================================================================
// Result Structs
// ============================================================================

/**
 * Result of the PRIMARY pre-detection screen check.
 * Computed on the raw camera ROI before edge-detection / warp.
 */
struct PreDetectResult {
    bool   isSuspicious      = false;   // This individual frame looks screen-like
    float  confidence        = 0.f;     // Combined weighted score [0..1]

    // Individual signal scores (0 = real card, 1 = screen-like)
    float  chromaScore       = 0.f;     // Cr-channel uniformity
    float  textureScore      = 0.f;     // Micro-texture variance
    float  gradientScore     = 0.f;     // Gradient regularity (CoV)
    float  brightnessScore   = 0.f;     // Spatial brightness uniformity
    float  moireScore        = 0.f;     // Diagonal moiré strength

    // Raw diagnostic values (for logcat calibration)
    float  rawCrStddev       = 0.f;     // Cr channel stddev
    float  rawTextureVar     = 0.f;     // Median high-pass patch variance
    float  rawGradientCoV    = 0.f;     // Gradient coefficient of variation
    float  rawBrightnessVar  = 0.f;     // Variance of quadrant brightness
    float  rawMoireResponse  = 0.f;     // Max diagonal filter response
};

/**
 * Temporal verdict after accumulating multiple PreDetectResults.
 */
struct TemporalVerdict {
    bool   decided           = false;   // true if enough data to decide
    bool   isScreen          = false;   // verdict (only valid when decided)
    float  avgConfidence     = 0.f;     // rolling mean confidence
    int    suspiciousCount   = 0;       // suspicious frames in window
    int    windowSize        = 0;       // current window fill level
};

/**
 * Result of full post-warp screen analysis (kept for backward compatibility).
 */
struct ScreenDetectionResult {
    bool   isScreen              = false;
    float  confidence            = 0.f;

    float  fftPeakScore          = 0.f;
    float  moireScore            = 0.f;
    float  textureUniformity     = 0.f;
    float  specularScore         = 0.f;
    float  colorBandingScore     = 0.f;

    int    fftPeakCount          = 0;
    float  dominantFrequency     = 0.f;
    float  textureVariance       = 0.f;
    int    hotspotCount          = 0;
};

// ============================================================================
// Configuration
// ============================================================================

struct ScreenDetectorConfig {
    // ── Pre-Detection (primary path) ──────────────────────────────────────
    // TEMPORARILY DISABLED: Needs logcat calibration with real vs screen data.
    // All code preserved — flip to true when thresholds are tuned.
    bool  enablePreDetect           = false;

    // Signal weights (must sum ≈ 1.0)
    // Moiré is the ONLY truly screen-specific signal (camera-pixel interference)
    // Chroma is secondary (screen backlight vs ambient reflection)
    // Texture/gradient/brightness are DEMOTED — real cards are also smooth!
    float preWeightChroma           = 0.25f;
    float preWeightTexture          = 0.05f;   // Demoted: real cards are smooth
    float preWeightGradient         = 0.05f;   // Demoted: real cards are uniform
    float preWeightBrightness       = 0.05f;   // Demoted: real cards are uniform
    float preWeightMoire            = 0.60f;   // PRIMARY: screen-specific

    // Per-signal thresholds (frame marked suspicious if score > threshold)
    float preChromaThreshold        = 0.60f;
    float preTextureThreshold       = 0.80f;   // Very high: avoid false positives
    float preGradientThreshold      = 0.80f;   // Very high: avoid false positives
    float preBrightnessThreshold    = 0.80f;   // Very high: avoid false positives
    float preMoireThreshold         = 0.35f;   // Sensitive to moiré

    // Combined confidence threshold
    float preConfidenceThreshold    = 0.55f;

    // Frame is suspicious if combined > preConfidenceThreshold
    // OR if >= preMinHighSignals signals are above their individual threshold
    int   preMinHighSignals         = 3;       // Need 3/5 signals (was 2)

    // Hard-reject: any single signal above this → immediate suspicious
    float preHardRejectThreshold    = 0.90f;

    // ── Moiré Gate ────────────────────────────────────────────────────────
    // Require SOME moiré evidence before flagging as screen.
    // Without moiré, smooth surfaces (real cards) would false-trigger.
    bool  requireMoireGate          = true;
    float moireGateMinScore         = 0.15f;   // Minimum moiré to even consider

    // Chroma calibration
    float chromaRealMinStddev       = 4.0f;    // Real cards typically > 4
    float chromaScreenMaxStddev     = 10.0f;   // Score normalization ceiling

    // Texture calibration
    float textureScreenMaxVar       = 2.0f;    // Below this → very screen-like
    float textureRealMinVar         = 5.0f;    // Above this → definitely real

    // Gradient calibration
    float gradientScreenMaxCoV      = 0.20f;   // Low CoV → regular (screen)
    float gradientRealMinCoV        = 0.45f;   // High CoV → random (real card)

    // Brightness uniformity calibration
    float brightnessScreenMaxVar    = 10.0f;   // Low variance → uniform (screen)
    float brightnessRealMinVar      = 50.0f;   // High variance → gradient (real)

    // Moiré calibration — WIDENED sensitivity range
    float moireMinResponse          = 0.015f;  // Below → no moiré
    float moireMaxResponse          = 0.045f;  // Above → strong moiré (screen)

    // ── Temporal Accumulation ─────────────────────────────────────────────
    int   temporalWindowSize        = 12;      // Larger window for stability
    int   temporalConfirmThreshold  = 8;       // Need 8/12 suspicious (was 6/10)
    int   temporalClearThreshold    = 2;       // Max suspicious to confirm real
    int   temporalHysteresisFrames  = 10;      // Clean frames needed to unlatch

    // ── Post-Warp (backup path — rarely needed) ───────────────────────────
    bool  enablePostWarp            = false;   // DISABLED — pre-detect is primary

    // FFT
    bool  enableFFT                 = true;
    float fftPeakThreshold          = 0.15f;
    int   fftMinPeaks               = 2;

    // Moiré (post-warp)
    bool  enableMoire               = true;
    float moireThreshold            = 0.12f;

    // Texture (post-warp)
    bool  enableTexture             = true;
    float textureMinVariance        = 5.0f;
    int   lbpUniformThreshold       = 65;

    // Specular
    bool  enableSpecular            = true;
    int   specularThreshold         = 245;
    float specularAreaMax           = 0.08f;

    // Color banding
    bool  enableColorBanding        = true;
    int   colorBandCount            = 8;
    float bandingThreshold          = 0.25f;

    // Post-warp combined decision
    float screenConfidenceThreshold = 0.40f;
    float weightFFT                 = 0.25f;
    float weightMoirePost           = 0.20f;
    float weightTexturePost         = 0.35f;
    float weightSpecular            = 0.10f;
    float weightBanding             = 0.10f;

    // Legacy quick-check (DISABLED — replaced by pre-detect)
    bool  enableQuickCheck          = false;
    float quickTextureThreshold     = 0.70f;
    float quickMoireThreshold       = 0.55f;
    float quickGridThreshold        = 0.60f;
    float quickConfidenceThreshold  = 0.60f;
    int   quickTemporalFrames       = 8;
};

// ============================================================================
// ScreenDetector Class
// ============================================================================

class ScreenDetector {
public:
    ScreenDetector();
    explicit ScreenDetector(const ScreenDetectorConfig& config);
    ~ScreenDetector() = default;

    // ── PRIMARY: Pre-Detection (raw frame, before edge-detect / warp) ────

    /**
     * Analyze a center-cropped ROI from the raw camera frame.
     *
     * @param centerGray  Center-cropped grayscale ROI (Y channel)
     * @param centerCr    Center-cropped Cr (V) chroma plane, upscaled to
     *                    match centerGray dimensions.  May be empty if Cr
     *                    is unavailable — chroma signal will be skipped.
     * @return Per-frame pre-detection result with all signal scores.
     */
    PreDetectResult preDetect(const cv::Mat& centerGray,
                              const cv::Mat& centerCr);

    /**
     * Feed a PreDetectResult into the temporal sliding window and return
     * the accumulated verdict.
     *
     * @param frameResult  Result from preDetect() for the current frame.
     * @return Temporal verdict (decided / isScreen / avgConfidence).
     */
    TemporalVerdict accumulate(const PreDetectResult& frameResult);

    /**
     * Reset all temporal state.  Call on detection loss, side switch,
     * or when the user taps "retry".
     */
    void resetTemporal();

    // ── BACKUP: Post-Warp Analysis ───────────────────────────────────────

    /** Full analysis on warped 1000×630 image (backup path). */
    ScreenDetectionResult analyze(const cv::Mat& warpedImage);

    /** Convenience: just the verdict. */
    bool isScreenDisplay(const cv::Mat& warpedImage);

    // ── Legacy (kept for ABI but disabled) ───────────────────────────────

    struct QuickScreenResult {
        bool  isSuspicious = false;
        float confidence   = 0.f;
        float textureScore = 0.f;
        float moireScore   = 0.f;
        float gridScore    = 0.f;
    };
    QuickScreenResult quickCheck(const cv::Mat& roiFrame);
    bool quickCheckWithTemporal(const cv::Mat& roiFrame,
                                bool& isScreenOut,
                                float& confidenceOut);

    // ── Configuration ────────────────────────────────────────────────────

    void setConfig(const ScreenDetectorConfig& config);
    ScreenDetectorConfig getConfig() const;

private:
    ScreenDetectorConfig config_;

    // ── Temporal sliding window ──────────────────────────────────────────
    struct FrameRecord {
        bool  suspicious;
        float confidence;
    };
    std::deque<FrameRecord> temporalWindow_;
    bool  screenLatched_       = false;   // hysteresis latch
    int   cleanFramesSinceLatch_ = 0;     // consecutive clean after latch

    // Legacy temporal state (kept for quickCheckWithTemporal ABI)
    int   temporalSuspicionCount_  = 0;
    int   temporalFrameCount_      = 0;
    float temporalConfidenceSum_   = 0.f;

    // ── Pre-detection signal helpers ─────────────────────────────────────
    float computeChromaUniformity(const cv::Mat& crChannel);
    float computeCenterTexture(const cv::Mat& gray);
    float computeGradientRegularity(const cv::Mat& gray);
    float computeBrightnessUniformity(const cv::Mat& gray);
    float computePreMoire(const cv::Mat& gray);

    // ── Post-warp analysis helpers ───────────────────────────────────────
    void  analyzeFFT(const cv::Mat& gray, ScreenDetectionResult& result);
    void  analyzeMoire(const cv::Mat& gray, ScreenDetectionResult& result);
    void  analyzeTexture(const cv::Mat& gray, ScreenDetectionResult& result);
    void  analyzeSpecular(const cv::Mat& gray, ScreenDetectionResult& result);
    void  analyzeColorBanding(const cv::Mat& image, ScreenDetectionResult& result);

    float detectPeriodicPeaks(const cv::Mat& magnitude,
                              int& peakCount, float& dominantFreq);
    float computeLBPUniformity(const cv::Mat& gray);
    float computeMicroTextureVariance(const cv::Mat& gray);

    // Legacy quick-check helpers
    float computeQuickTextureUniformity(const cv::Mat& gray);
    float computeQuickMoire(const cv::Mat& gray);
    float computePixelGridRegularity(const cv::Mat& gray);
};

} // namespace validation

#endif // SCREEN_DETECTOR_H
