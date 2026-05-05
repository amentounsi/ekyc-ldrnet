/**
 * LivePresenceValidator.h
 *
 * Interaction-Based Liveness Protocol (clean implementation).
 *
 * All passive anti-spoof heuristics (T7 flicker, T8 frame-diff, T10 texture,
 * T11 FFT stationarity) have been removed.  Brightness / FFT / temporal-noise
 * buffers are gone.
 *
 * The new protocol has three stages:
 *
 *   Stage 1 — Stabilization
 *       Track the last 10 detected quads.  If the mean per-corner variance is
 *       below CORNER_VAR_THRESHOLD the card is considered stable and the
 *       challenge begins.
 *
 *   Stage 2 — Tilt Challenge
 *       Collect 30-40 warped frames while the user tilts the card slightly.
 *
 *   Stage 3 — Highlight Motion Verification
 *       For each frame, extract the specular highlight centroid via
 *       morphological top-hat → threshold → largest contour → moments.
 *       Compute cumulative Euclidean displacement across consecutive centroids.
 *       If totalMotion > HIGHLIGHT_MOTION_THRESHOLD → LIVE, else SPOOF.
 *
 * All legacy PresenceResult fields are retained (set to defaults) so that the
 * JNI bridge compiles without changes.
 */

#pragma once

#include <opencv2/core.hpp>
#include <deque>
#include <vector>

namespace validation {

/* ------------------------------------------------------------------ */
/*  Protocol state machine                                             */
/* ------------------------------------------------------------------ */

enum class PresenceState {
    WAIT_FOR_CARD,   // no card seen yet (or after full reset)
    BOOTSTRAP,       // locking reference area (first BOOTSTRAP_FRAMES frames)
    STABILIZING,     // waiting for the card to hold still
    CHALLENGE,       // collecting tilt centroids
    DECISION         // result ready, waiting for external reset
};

/* ------------------------------------------------------------------ */
/*  Result                                                             */
/* ------------------------------------------------------------------ */

struct PresenceResult {
    /* Primary verdict */
    bool   live            = false;
    bool   spoofDetected   = false;

    /* Scores (JNI slots 1-4) */
    float  totalScore      = 0.f;
    float  homographyScore = 0.f;
    float  highlightScore  = 0.f;
    float  approachScore   = 0.f;

    /* Legacy boolean detectors (JNI slots 6-11, all disabled) */
    bool   screenFFT       = false;
    bool   subpixelGrid    = false;
    bool   paperPrint      = false;
    bool   temporalStable  = false;
    bool   textureWeak     = false;
    bool   fftStationary   = false;

    int    frameCount      = 0;

    /* Debug values routed through the existing JNI log line */
    float  dbgEnergy       = 0.f;
    float  dbgTextureStd   = 0.f;
    float  dbgFftDiff      = 0.f;
    int    dbgVotes        = 0;

    /* New protocol metric */
    float  highlightMotion = 0.f;
};

/* ------------------------------------------------------------------ */
/*  Validator                                                          */
/* ------------------------------------------------------------------ */

class LivePresenceValidator {
public:
    LivePresenceValidator() = default;

    /** Clear all state.  Call on side switch or detection loss. */
    void reset();

    /**
     * Push one frame into the pipeline.
     * @param rawGray  Full-resolution rotated grayscale camera frame
     * @param warped   1000x630 warped card image (grayscale)
     * @param quad     4-corner polygon in rawGray coordinates
     */
    void pushFrame(const cv::Mat& rawGray,
                   const cv::Mat& warped,
                   const std::vector<cv::Point2f>& quad);

    /**
     * Run the liveness decision.
     * Returns live=false when not enough frames have been collected yet.
     */
    PresenceResult evaluate() const;

private:
    /* ── Tuning constants ── */
    static constexpr int   STABILITY_WINDOW           = 10;   // frames for stability check
    static constexpr int   CHALLENGE_MIN_FRAMES       = 30;   // minimum tilt frames
    static constexpr int   CHALLENGE_MAX_FRAMES       = 40;   // maximum tilt frames

    static constexpr int   TOPHAT_KERNEL_SIZE         = 15;   // morphological kernel
    static constexpr float HIGHLIGHT_MOTION_THRESHOLD = 40.f; // px cumulative displacement
    static constexpr float CORNER_VAR_THRESHOLD       = 100.f;// per-corner mean variance

    static constexpr int   BOOTSTRAP_FRAMES           = 15;   // frames to observe before locking refArea
    static constexpr float CARD_ASPECT_MIN            = 1.5f; // minimum w/h for landscape card
    static constexpr float CARD_ASPECT_MAX            = 2.2f; // maximum w/h for landscape card

    static constexpr int   DETECTOR_GRACE_FRAMES      = 10;   // consecutive resets tolerated before full reset

    // Blob area discriminator: real card specular highlights are small concentrated spots.
    // Screen cards produce either very large diffuse blobs or no contours at all (fallback only).
    static constexpr float HIGHLIGHT_BLOB_MAX_AREA    = 5000.f; // px² — above this signals screen/diffuse glare
    static constexpr float HIGHLIGHT_MIN_CONTOUR_FRAC = 0.25f;  // fraction of challenge frames that must have real contours

    /* ── State ── */
    PresenceState m_state              = PresenceState::WAIT_FOR_CARD;
    int   m_detectorLostFrames         = 0;   // incremented each time reset() arrives during active protocol

    std::deque<std::vector<cv::Point2f>> m_quadHistory;        // last N quads for stability
    std::deque<cv::Point2f>              m_highlightCentroids;  // centroids collected during challenge

    int   m_challengeFrames      = 0;
    int   m_totalPushed          = 0;      // lifetime push count (debug)
    float m_refArea              = 0.f;    // locked reference area after bootstrap
    bool  m_refAreaLocked        = false;  // true once bootstrap phase has locked refArea
    int   m_bootstrapFrames      = 0;      // frames observed so far in bootstrap
    std::vector<float> m_bootstrapAreas;      // valid-aspect areas collected during bootstrap (used for median)

    int   m_contourFrames        = 0;      // challenge frames where a real contour (not fallback) was found
    float m_totalBlobArea        = 0.f;    // sum of blob areas from contour frames

    // Intensity instrumentation accumulators (data collection)
    float m_totalPeakRatio       = 0.f;    // sum of peakValue/medianROI per contour frame
    float m_totalSatFraction     = 0.f;    // sum of saturated-pixel fraction per contour frame
    float m_totalCompactness     = 0.f;    // sum of area/perimeter² per contour frame

    /* ── Internal helpers ── */
    void  performFullReset();
    bool  isCardStable() const;
    bool  extractHighlightCentroid(const cv::Mat& warpedGray,
                                   cv::Point2f& outCentroid,
                                   float& outBlobArea,
                                   float& outPeakRatio,
                                   float& outSatFraction,
                                   float& outCompactness) const;
    float computeHighlightMotion() const;

    /** ROI on the card surface away from text / photo / barcode. */
    static cv::Rect getMaterialROI(const cv::Mat& img);

    static float quadArea(const std::vector<cv::Point2f>& pts);
    static float quadAspect(const std::vector<cv::Point2f>& pts);
};

} // namespace validation
