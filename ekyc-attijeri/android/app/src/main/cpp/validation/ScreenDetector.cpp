/**
 * ScreenDetector.cpp
 *
 * Anti-Spoof Implementation — PRE-DETECTION PRIMARY PATH.
 *
 * The pipeline is:
 *   Raw YUV frame → center-crop ROI → preDetect(gray, cr) → accumulate()
 *   If screen confirmed → block edge-detection entirely (save CPU).
 *
 * Five pre-detection signals, each mapped to [0..1]:
 *   1. Chroma Uniformity   — Cr stddev (screens: narrow, real: wide)
 *   2. Micro-Texture        — High-pass patch variance (screens: smooth)
 *   3. Gradient Regularity  — Gradient CoV (screens: uniform)
 *   4. Brightness Uniformity — Quadrant mean variance (screens: even)
 *   5. Moiré Interference   — Diagonal Gabor response (screens: strong)
 *
 * Temporal accumulation uses a fixed-size sliding window with hysteresis.
 *
 * Post-warp analysis is preserved but DISABLED by default.
 */

#include "ScreenDetector.h"
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <android/log.h>

#define LOG_TAG "ScreenDetector"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)

namespace validation {

// ============================================================================
// Construction / Configuration
// ============================================================================

ScreenDetector::ScreenDetector() : config_() {}

ScreenDetector::ScreenDetector(const ScreenDetectorConfig& config)
    : config_(config) {}

void ScreenDetector::setConfig(const ScreenDetectorConfig& config) {
    config_ = config;
}

ScreenDetectorConfig ScreenDetector::getConfig() const {
    return config_;
}

// ============================================================================
// PRIMARY PATH — Pre-Detection (runs BEFORE edge-detection / warp)
// ============================================================================

PreDetectResult ScreenDetector::preDetect(const cv::Mat& centerGray,
                                          const cv::Mat& centerCr) {
    PreDetectResult r;

    if (centerGray.empty() || !config_.enablePreDetect) {
        return r;
    }

    // Resize to a consistent working resolution for speed & comparability.
    // 240 px wide is enough for texture / gradient analysis and keeps
    // processing under 2 ms on mid-range devices.
    cv::Mat gray;
    const int kWorkWidth = 240;
    if (centerGray.cols > kWorkWidth) {
        float scale = static_cast<float>(kWorkWidth) / centerGray.cols;
        cv::resize(centerGray, gray,
                   cv::Size(kWorkWidth,
                            static_cast<int>(centerGray.rows * scale)),
                   0, 0, cv::INTER_AREA);
    } else {
        gray = centerGray;
    }

    // ── Signal 1: Chroma Uniformity ──────────────────────────────────────
    if (!centerCr.empty()) {
        r.rawCrStddev  = computeChromaUniformity(centerCr);
        // Map: low stddev → high score (screen-like)
        if (r.rawCrStddev < config_.chromaRealMinStddev) {
            r.chromaScore = 1.0f - (r.rawCrStddev / config_.chromaRealMinStddev);
        } else if (r.rawCrStddev < config_.chromaScreenMaxStddev) {
            // Transition zone
            r.chromaScore = std::max(0.f,
                0.3f * (1.0f - (r.rawCrStddev - config_.chromaRealMinStddev) /
                               (config_.chromaScreenMaxStddev - config_.chromaRealMinStddev)));
        } else {
            r.chromaScore = 0.f;
        }
    }

    // ── Signal 2: Micro-Texture ──────────────────────────────────────────
    r.rawTextureVar = computeCenterTexture(gray);
    // Map: low variance → high score (screen-like)
    if (r.rawTextureVar <= config_.textureScreenMaxVar) {
        r.textureScore = 1.0f;
    } else if (r.rawTextureVar < config_.textureRealMinVar) {
        r.textureScore = 1.0f -
            (r.rawTextureVar - config_.textureScreenMaxVar) /
            (config_.textureRealMinVar - config_.textureScreenMaxVar);
    } else {
        r.textureScore = 0.f;
    }

    // ── Signal 3: Gradient Regularity ────────────────────────────────────
    r.rawGradientCoV = computeGradientRegularity(gray);
    // Map: low CoV → high score (screen has regular gradients)
    if (r.rawGradientCoV <= config_.gradientScreenMaxCoV) {
        r.gradientScore = 1.0f;
    } else if (r.rawGradientCoV < config_.gradientRealMinCoV) {
        r.gradientScore = 1.0f -
            (r.rawGradientCoV - config_.gradientScreenMaxCoV) /
            (config_.gradientRealMinCoV - config_.gradientScreenMaxCoV);
    } else {
        r.gradientScore = 0.f;
    }

    // ── Signal 4: Brightness Spatial Uniformity ──────────────────────────
    r.rawBrightnessVar = computeBrightnessUniformity(gray);
    // Map: low variance → high score (screen has uniform backlight)
    if (r.rawBrightnessVar <= config_.brightnessScreenMaxVar) {
        r.brightnessScore = 1.0f;
    } else if (r.rawBrightnessVar < config_.brightnessRealMinVar) {
        r.brightnessScore = 1.0f -
            (r.rawBrightnessVar - config_.brightnessScreenMaxVar) /
            (config_.brightnessRealMinVar - config_.brightnessScreenMaxVar);
    } else {
        r.brightnessScore = 0.f;
    }

    // ── Signal 5: Moiré Interference ─────────────────────────────────────
    r.rawMoireResponse = computePreMoire(gray);
    // Map: high response → high score (screen-like)
    if (r.rawMoireResponse <= config_.moireMinResponse) {
        r.moireScore = 0.f;
    } else if (r.rawMoireResponse < config_.moireMaxResponse) {
        r.moireScore =
            (r.rawMoireResponse - config_.moireMinResponse) /
            (config_.moireMaxResponse - config_.moireMinResponse);
    } else {
        r.moireScore = 1.0f;
    }

    // ── Combine Signals ──────────────────────────────────────────────────
    r.confidence =
        config_.preWeightChroma     * r.chromaScore     +
        config_.preWeightTexture    * r.textureScore    +
        config_.preWeightGradient   * r.gradientScore   +
        config_.preWeightBrightness * r.brightnessScore +
        config_.preWeightMoire      * r.moireScore;

    // Count how many individual signals exceed their thresholds
    int highCount = 0;
    if (r.chromaScore     >= config_.preChromaThreshold)     highCount++;
    if (r.textureScore    >= config_.preTextureThreshold)    highCount++;
    if (r.gradientScore   >= config_.preGradientThreshold)   highCount++;
    if (r.brightnessScore >= config_.preBrightnessThreshold) highCount++;
    if (r.moireScore      >= config_.preMoireThreshold)      highCount++;

    // ── Moiré Gate ───────────────────────────────────────────────────────
    // Moiré is the ONLY signal that is truly screen-specific.
    // Texture/brightness/gradient fire on real cards too (they're smooth).
    // Without moiré evidence, we CANNOT distinguish screen from real card.
    bool moireGateOpen = !config_.requireMoireGate ||
                         (r.moireScore >= config_.moireGateMinScore);

    // Hard-reject: ONLY moiré can hard-reject (texture/brightness are
    // unreliable — real cards trigger them too)
    bool hardReject = (r.moireScore >= config_.preHardRejectThreshold);

    // Frame is suspicious if moiré gate is open AND:
    //   (a) combined confidence exceeds threshold, OR
    //   (b) N or more individual signals are above their thresholds, OR
    //   (c) moiré alone is a hard-reject
    r.isSuspicious = moireGateOpen &&
        ((r.confidence >= config_.preConfidenceThreshold) ||
         (highCount    >= config_.preMinHighSignals) ||
         hardReject);

    LOGI("[PRE-DETECT] chroma=%.2f(raw=%.1f) tex=%.2f(raw=%.1f) "
         "grad=%.2f(raw=%.2f) bright=%.2f(raw=%.1f) moire=%.2f(raw=%.3f) "
         "-> conf=%.2f high=%d gate=%d hard=%d susp=%d",
         r.chromaScore,     r.rawCrStddev,
         r.textureScore,    r.rawTextureVar,
         r.gradientScore,   r.rawGradientCoV,
         r.brightnessScore, r.rawBrightnessVar,
         r.moireScore,      r.rawMoireResponse,
         r.confidence, highCount, moireGateOpen ? 1 : 0,
         hardReject ? 1 : 0, r.isSuspicious ? 1 : 0);

    return r;
}

// ============================================================================
// Temporal Accumulation — Sliding Window with Hysteresis
// ============================================================================

TemporalVerdict ScreenDetector::accumulate(const PreDetectResult& frameResult) {
    TemporalVerdict v;

    // Push into sliding window
    temporalWindow_.push_back({frameResult.isSuspicious, frameResult.confidence});
    while (static_cast<int>(temporalWindow_.size()) > config_.temporalWindowSize) {
        temporalWindow_.pop_front();
    }

    v.windowSize = static_cast<int>(temporalWindow_.size());

    // Count suspicious frames and compute rolling average confidence
    float confSum = 0.f;
    int   suspCount = 0;
    for (const auto& rec : temporalWindow_) {
        confSum += rec.confidence;
        if (rec.suspicious) suspCount++;
    }
    v.suspiciousCount = suspCount;
    v.avgConfidence   = (v.windowSize > 0) ? confSum / v.windowSize : 0.f;

    // ── Decision Logic with Hysteresis ───────────────────────────────────
    if (screenLatched_) {
        // Screen is currently latched ON.
        // Unlatch only after enough consecutive clean frames.
        if (!frameResult.isSuspicious) {
            cleanFramesSinceLatch_++;
        } else {
            cleanFramesSinceLatch_ = 0;
        }

        if (cleanFramesSinceLatch_ >= config_.temporalHysteresisFrames) {
            // Enough clean frames → unlatch
            screenLatched_ = false;
            cleanFramesSinceLatch_ = 0;
            LOGI("[TEMPORAL] Unlatched screen after %d clean frames",
                 config_.temporalHysteresisFrames);
        }

        // While latched, always report screen
        v.decided  = true;
        v.isScreen = screenLatched_;  // may have just unlatched

        if (screenLatched_) {
            LOGD("[TEMPORAL] Latched ON — susp=%d/%d avgConf=%.2f clean=%d/%d",
                 suspCount, v.windowSize, v.avgConfidence,
                 cleanFramesSinceLatch_, config_.temporalHysteresisFrames);
        }

        return v;
    }

    // Not latched — check if we should latch
    if (v.windowSize >= config_.temporalWindowSize / 2) {
        // Enough frames to make a judgment (at least half the window filled)

        if (suspCount >= config_.temporalConfirmThreshold) {
            // Confirm screen — latch ON
            screenLatched_ = true;
            cleanFramesSinceLatch_ = 0;
            v.decided  = true;
            v.isScreen = true;
            LOGI("[TEMPORAL] SCREEN CONFIRMED — susp=%d/%d avgConf=%.2f → LATCH",
                 suspCount, v.windowSize, v.avgConfidence);
        }
        else if (suspCount <= config_.temporalClearThreshold) {
            // Confirmed NOT screen
            v.decided  = true;
            v.isScreen = false;
            LOGD("[TEMPORAL] Real card confirmed — susp=%d/%d avgConf=%.2f",
                 suspCount, v.windowSize, v.avgConfidence);
        }
        else {
            // Ambiguous — don't block, assume real until decided
            v.decided  = false;
            v.isScreen = false;
            LOGD("[TEMPORAL] Undecided — susp=%d/%d avgConf=%.2f",
                 suspCount, v.windowSize, v.avgConfidence);
        }
    } else {
        // Not enough frames yet — don't block
        v.decided  = false;
        v.isScreen = false;
    }

    return v;
}

void ScreenDetector::resetTemporal() {
    temporalWindow_.clear();
    screenLatched_ = false;
    cleanFramesSinceLatch_ = 0;

    // Also reset legacy temporal
    temporalSuspicionCount_ = 0;
    temporalFrameCount_ = 0;
    temporalConfidenceSum_ = 0.f;

    LOGI("[TEMPORAL] Full reset — all state cleared");
}

// ============================================================================
// Pre-Detection Signal 1: Chroma Uniformity
//
// Screens emit self-illuminated light with a narrow chroma distribution.
// Real cards under ambient light reflect colored light from the environment,
// causing wider variation in the Cr (red-difference) channel.
//
// Returns: Raw Cr stddev value (higher = more variation = more real-like)
// ============================================================================

float ScreenDetector::computeChromaUniformity(const cv::Mat& crChannel) {
    if (crChannel.empty()) return 20.f;  // Conservative: assume real card

    // Resize Cr to working resolution for consistency
    cv::Mat cr;
    if (crChannel.cols > 120) {
        float scale = 120.0f / crChannel.cols;
        cv::resize(crChannel, cr,
                   cv::Size(120, static_cast<int>(crChannel.rows * scale)),
                   0, 0, cv::INTER_AREA);
    } else {
        cr = crChannel;
    }

    cv::Scalar mean, stddev;
    cv::meanStdDev(cr, mean, stddev);

    return static_cast<float>(stddev[0]);
}

// ============================================================================
// Pre-Detection Signal 2: Micro-Texture Variance
//
// Real cards have random micro-texture from paper / plastic / ink.
// Screens have smooth, regular sub-pixel patterns → lower high-pass variance.
//
// Samples 16×16 patches across the image, applies a high-pass filter
// (original − GaussianBlur), and returns the median patch stddev.
// ============================================================================

float ScreenDetector::computeCenterTexture(const cv::Mat& gray) {
    if (gray.empty()) return 10.f;  // Conservative

    const int kPatchSize = 16;
    const int kStep      = 20;  // Dense sampling on small image

    std::vector<float> patchVariances;
    patchVariances.reserve(
        ((gray.rows - kPatchSize) / kStep) *
        ((gray.cols - kPatchSize) / kStep));

    for (int y = 0; y + kPatchSize <= gray.rows; y += kStep) {
        for (int x = 0; x + kPatchSize <= gray.cols; x += kStep) {
            cv::Mat patch = gray(cv::Rect(x, y, kPatchSize, kPatchSize));

            // High-pass: subtract Gaussian blur to isolate micro-texture
            cv::Mat blurred, highPass;
            cv::GaussianBlur(patch, blurred, cv::Size(5, 5), 0);
            cv::subtract(patch, blurred, highPass, cv::noArray(), CV_32F);

            cv::Scalar mean, stddev;
            cv::meanStdDev(highPass, mean, stddev);
            patchVariances.push_back(static_cast<float>(stddev[0]));
        }
    }

    if (patchVariances.empty()) return 10.f;

    // Return median — robust to outlier patches (e.g., text or edges)
    std::sort(patchVariances.begin(), patchVariances.end());
    return patchVariances[patchVariances.size() / 2];
}

// ============================================================================
// Pre-Detection Signal 3: Gradient Regularity
//
// Screens have a regular pixel grid → directional gradients are uniform.
// Real cards have random texture → gradients vary widely.
//
// Computes Sobel in X and Y, projects to row/column profiles, and
// measures the coefficient of variation (CV = stddev/mean).
// Low CV = regular = screen-like.
// ============================================================================

float ScreenDetector::computeGradientRegularity(const cv::Mat& gray) {
    if (gray.empty() || gray.rows < 20 || gray.cols < 20) return 1.f;

    cv::Mat sobelH, sobelV;
    cv::Sobel(gray, sobelH, CV_32F, 1, 0, 3);
    cv::Sobel(gray, sobelV, CV_32F, 0, 1, 3);

    // Project |sobelH| to a 1D column profile (sum each column)
    cv::Mat absH, absV;
    absH = cv::abs(sobelH);
    absV = cv::abs(sobelV);

    // Column profile: average of each column across all rows
    cv::Mat hProfile;  // 1 × cols
    cv::reduce(absH, hProfile, 0, cv::REDUCE_AVG);

    // Row profile: average of each row across all columns
    cv::Mat vProfile;  // rows × 1
    cv::reduce(absV, vProfile, 1, cv::REDUCE_AVG);

    // Compute coefficient of variation for each profile
    auto computeCoV = [](const cv::Mat& profile) -> float {
        cv::Scalar mean, stddev;
        cv::meanStdDev(profile, mean, stddev);
        if (mean[0] < 0.01) return 1.0f;  // Edge case: nearly flat image
        return static_cast<float>(stddev[0] / mean[0]);
    };

    float hCoV = computeCoV(hProfile);
    float vCoV = computeCoV(vProfile);

    // Average of both directions — screens are regular in both
    return (hCoV + vCoV) / 2.0f;
}

// ============================================================================
// Pre-Detection Signal 4: Brightness Spatial Uniformity
//
// Screen backlights produce spatially uniform brightness.
// Real cards under desk lamps / ambient light have brightness gradients
// (one corner brighter, opposite darker).
//
// Divides the image into 4 quadrants, computes mean brightness of each,
// and returns the variance of those 4 means.
// Low variance = uniform = screen-like.
// ============================================================================

float ScreenDetector::computeBrightnessUniformity(const cv::Mat& gray) {
    if (gray.empty() || gray.rows < 10 || gray.cols < 10) return 100.f;

    int halfW = gray.cols / 2;
    int halfH = gray.rows / 2;

    // Clamp to avoid zero-size rects
    if (halfW < 5 || halfH < 5) return 100.f;

    cv::Mat q0 = gray(cv::Rect(0,     0,     halfW, halfH));  // top-left
    cv::Mat q1 = gray(cv::Rect(halfW, 0,     halfW, halfH));  // top-right
    cv::Mat q2 = gray(cv::Rect(0,     halfH, halfW, halfH));  // bottom-left
    cv::Mat q3 = gray(cv::Rect(halfW, halfH, halfW, halfH));  // bottom-right

    float means[4];
    means[0] = static_cast<float>(cv::mean(q0)[0]);
    means[1] = static_cast<float>(cv::mean(q1)[0]);
    means[2] = static_cast<float>(cv::mean(q2)[0]);
    means[3] = static_cast<float>(cv::mean(q3)[0]);

    // Variance of the 4 quadrant means
    float sum  = means[0] + means[1] + means[2] + means[3];
    float avg  = sum / 4.0f;
    float var  = 0.f;
    for (int i = 0; i < 4; i++) {
        float diff = means[i] - avg;
        var += diff * diff;
    }
    var /= 4.0f;

    return var;
}

// ============================================================================
// Pre-Detection Signal 5: Moiré Interference (Multi-Scale)
//
// Camera-screen interference creates diagonal wave patterns visible in raw
// frames.  Different screen types create moiré at different frequencies,
// so we use MULTIPLE kernel sizes to catch all screen densities.
//
// Additionally, we use a lightweight FFT on a small crop to detect
// periodic peaks from regular pixel grids.
//
// Returns raw max response across all scales (stddev of filter response).
// ============================================================================

float ScreenDetector::computePreMoire(const cv::Mat& gray) {
    if (gray.empty() || gray.rows < 30 || gray.cols < 30) return 0.f;

    cv::Mat floatImg;
    gray.convertTo(floatImg, CV_32F, 1.0 / 255.0);

    float maxResponse = 0.f;

    // ── Scale 1: 3×3 kernels (high-frequency moiré, phone screens) ──────
    {
        cv::Mat k45 = (cv::Mat_<float>(3, 3) <<
            -1,  0,  1,
             0,  0,  0,
             1,  0, -1);
        cv::Mat k135 = (cv::Mat_<float>(3, 3) <<
             1,  0, -1,
             0,  0,  0,
            -1,  0,  1);

        cv::Mat r45, r135;
        cv::filter2D(floatImg, r45,  -1, k45);
        cv::filter2D(floatImg, r135, -1, k135);

        cv::Scalar m45, s45, m135, s135;
        cv::meanStdDev(cv::abs(r45),  m45,  s45);
        cv::meanStdDev(cv::abs(r135), m135, s135);

        float resp = std::max(static_cast<float>(s45[0]),
                              static_cast<float>(s135[0]));
        maxResponse = std::max(maxResponse, resp);
    }

    // ── Scale 2: 5×5 kernels (mid-frequency moiré, tablets) ─────────────
    {
        cv::Mat k45 = (cv::Mat_<float>(5, 5) <<
            -1, -1,  0,  1,  1,
            -1, -1,  0,  1,  1,
             0,  0,  0,  0,  0,
             1,  1,  0, -1, -1,
             1,  1,  0, -1, -1);
        cv::Mat k135 = (cv::Mat_<float>(5, 5) <<
             1,  1,  0, -1, -1,
             1,  1,  0, -1, -1,
             0,  0,  0,  0,  0,
            -1, -1,  0,  1,  1,
            -1, -1,  0,  1,  1);

        cv::Mat r45, r135;
        cv::filter2D(floatImg, r45,  -1, k45);
        cv::filter2D(floatImg, r135, -1, k135);

        cv::Scalar m45, s45, m135, s135;
        cv::meanStdDev(cv::abs(r45),  m45,  s45);
        cv::meanStdDev(cv::abs(r135), m135, s135);

        float resp = std::max(static_cast<float>(s45[0]),
                              static_cast<float>(s135[0]));
        maxResponse = std::max(maxResponse, resp);
    }

    // ── Scale 3: 7×7 kernels (low-frequency moiré, monitors/laptops) ────
    {
        cv::Mat k45 = (cv::Mat_<float>(7, 7) <<
            -1, -1, -1,  0,  1,  1,  1,
            -1, -1, -1,  0,  1,  1,  1,
            -1, -1, -1,  0,  1,  1,  1,
             0,  0,  0,  0,  0,  0,  0,
             1,  1,  1,  0, -1, -1, -1,
             1,  1,  1,  0, -1, -1, -1,
             1,  1,  1,  0, -1, -1, -1);
        cv::Mat k135 = (cv::Mat_<float>(7, 7) <<
             1,  1,  1,  0, -1, -1, -1,
             1,  1,  1,  0, -1, -1, -1,
             1,  1,  1,  0, -1, -1, -1,
             0,  0,  0,  0,  0,  0,  0,
            -1, -1, -1,  0,  1,  1,  1,
            -1, -1, -1,  0,  1,  1,  1,
            -1, -1, -1,  0,  1,  1,  1);

        cv::Mat r45, r135;
        cv::filter2D(floatImg, r45,  -1, k45);
        cv::filter2D(floatImg, r135, -1, k135);

        cv::Scalar m45, s45, m135, s135;
        cv::meanStdDev(cv::abs(r45),  m45,  s45);
        cv::meanStdDev(cv::abs(r135), m135, s135);

        float resp = std::max(static_cast<float>(s45[0]),
                              static_cast<float>(s135[0]));
        maxResponse = std::max(maxResponse, resp);
    }

    // ── Lightweight FFT periodic detection ───────────────────────────────
    // Screen pixel grids create periodic peaks in frequency domain.
    // Use a small 64×64 crop for speed.
    {
        int cropSz = std::min(64, std::min(gray.cols, gray.rows));
        int cx = (gray.cols - cropSz) / 2;
        int cy = (gray.rows - cropSz) / 2;
        cv::Mat crop = gray(cv::Rect(cx, cy, cropSz, cropSz));

        cv::Mat fltCrop;
        crop.convertTo(fltCrop, CV_32F);

        // DFT
        cv::Mat planes[] = {fltCrop, cv::Mat::zeros(fltCrop.size(), CV_32F)};
        cv::Mat complex;
        cv::merge(planes, 2, complex);
        cv::dft(complex, complex);
        cv::split(complex, planes);

        cv::Mat mag;
        cv::magnitude(planes[0], planes[1], mag);
        mag += cv::Scalar(1);
        cv::log(mag, mag);

        // Zero out DC component (center after shift)
        int hcx = mag.cols / 2;
        int hcy = mag.rows / 2;

        // Quick shift: swap quadrants
        cv::Mat q0(mag, cv::Rect(0,   0,   hcx, hcy));
        cv::Mat q1(mag, cv::Rect(hcx, 0,   hcx, hcy));
        cv::Mat q2(mag, cv::Rect(0,   hcy, hcx, hcy));
        cv::Mat q3(mag, cv::Rect(hcx, hcy, hcx, hcy));
        cv::Mat tmp;
        q0.copyTo(tmp); q3.copyTo(q0); tmp.copyTo(q3);
        q1.copyTo(tmp); q2.copyTo(q1); tmp.copyTo(q2);

        // Zero DC area (5×5 block at center)
        cv::Rect dcBlock(hcx - 2, hcy - 2, 5, 5);
        dcBlock &= cv::Rect(0, 0, mag.cols, mag.rows);
        mag(dcBlock) = 0;

        // Measure peak vs mean — screens have strong isolated peaks
        double minVal, maxVal;
        cv::minMaxLoc(mag, &minVal, &maxVal);
        cv::Scalar meanVal = cv::mean(mag);

        float peakRatio = (meanVal[0] > 0.01)
            ? static_cast<float>(maxVal / meanVal[0]) : 0.f;

        // Screens typically have peakRatio > 3.5 (strong periodic component)
        // Real cards: peakRatio 1.5-2.5 (no periodicity)
        if (peakRatio > 3.0f) {
            float fftResp = (peakRatio - 3.0f) * 0.02f;  // Scale to similar range
            maxResponse = std::max(maxResponse, fftResp);
        }
    }

    LOGD("moiré multi-scale: maxResponse=%.4f", maxResponse);
    return maxResponse;
}

// ============================================================================
// BACKUP PATH — Post-Warp Analysis (kept for backward compat, disabled default)
// ============================================================================

ScreenDetectionResult ScreenDetector::analyze(const cv::Mat& warpedImage) {
    ScreenDetectionResult result;

    if (warpedImage.empty()) {
        LOGW("analyze: empty image");
        return result;
    }

    cv::Mat gray;
    if (warpedImage.channels() == 3) {
        cv::cvtColor(warpedImage, gray, cv::COLOR_BGR2GRAY);
    } else if (warpedImage.channels() == 4) {
        cv::cvtColor(warpedImage, gray, cv::COLOR_BGRA2GRAY);
    } else {
        gray = warpedImage;
    }

    LOGD("Post-warp analysis %dx%d", gray.cols, gray.rows);

    if (config_.enableFFT)      analyzeFFT(gray, result);
    if (config_.enableMoire)    analyzeMoire(gray, result);
    if (config_.enableTexture)  analyzeTexture(gray, result);
    if (config_.enableSpecular) analyzeSpecular(gray, result);
    if (config_.enableColorBanding && warpedImage.channels() >= 3)
        analyzeColorBanding(warpedImage, result);

    result.confidence =
        config_.weightFFT         * result.fftPeakScore      +
        config_.weightMoirePost   * result.moireScore         +
        config_.weightTexturePost * result.textureUniformity  +
        config_.weightSpecular    * result.specularScore      +
        config_.weightBanding     * result.colorBandingScore;

    result.isScreen = (result.confidence >= config_.screenConfidenceThreshold);

    LOGI("Post-warp: isScreen=%d conf=%.2f "
         "(fft=%.2f moire=%.2f tex=%.2f spec=%.2f band=%.2f)",
         result.isScreen ? 1 : 0, result.confidence,
         result.fftPeakScore, result.moireScore, result.textureUniformity,
         result.specularScore, result.colorBandingScore);

    return result;
}

bool ScreenDetector::isScreenDisplay(const cv::Mat& warpedImage) {
    return analyze(warpedImage).isScreen;
}

// ============================================================================
// Post-Warp Helpers (unchanged — kept for backward compat)
// ============================================================================

void ScreenDetector::analyzeFFT(const cv::Mat& gray, ScreenDetectionResult& result) {
    int cx = gray.cols / 4;
    int cy = gray.rows / 4;
    int cw = gray.cols / 2;
    int ch = gray.rows / 2;

    int optW = cv::getOptimalDFTSize(cw);
    int optH = cv::getOptimalDFTSize(ch);

    cv::Mat roi = gray(cv::Rect(cx, cy, cw, ch));
    cv::Mat padded;
    cv::copyMakeBorder(roi, padded, 0, optH - ch, 0, optW - cw,
                       cv::BORDER_CONSTANT, cv::Scalar(0));

    cv::Mat floatImg;
    padded.convertTo(floatImg, CV_32F);

    cv::Mat planes[] = {floatImg, cv::Mat::zeros(floatImg.size(), CV_32F)};
    cv::Mat complex;
    cv::merge(planes, 2, complex);
    cv::dft(complex, complex);

    cv::split(complex, planes);
    cv::Mat magnitude;
    cv::magnitude(planes[0], planes[1], magnitude);

    magnitude += cv::Scalar(1);
    cv::log(magnitude, magnitude);

    int cx2 = magnitude.cols / 2;
    int cy2 = magnitude.rows / 2;
    cv::Mat q0(magnitude, cv::Rect(0,   0,   cx2, cy2));
    cv::Mat q1(magnitude, cv::Rect(cx2, 0,   cx2, cy2));
    cv::Mat q2(magnitude, cv::Rect(0,   cy2, cx2, cy2));
    cv::Mat q3(magnitude, cv::Rect(cx2, cy2, cx2, cy2));
    cv::Mat tmp;
    q0.copyTo(tmp); q3.copyTo(q0); tmp.copyTo(q3);
    q1.copyTo(tmp); q2.copyTo(q1); tmp.copyTo(q2);

    cv::normalize(magnitude, magnitude, 0, 1, cv::NORM_MINMAX);

    int peakCount = 0;
    float dominantFreq = 0.f;
    result.fftPeakScore    = detectPeriodicPeaks(magnitude, peakCount, dominantFreq);
    result.fftPeakCount    = peakCount;
    result.dominantFrequency = dominantFreq;

    LOGD("FFT: peakScore=%.3f peakCount=%d dominantFreq=%.1f",
         result.fftPeakScore, peakCount, dominantFreq);
}

float ScreenDetector::detectPeriodicPeaks(const cv::Mat& magnitude,
                                           int& peakCount, float& dominantFreq) {
    int cx = magnitude.cols / 2;
    int cy = magnitude.rows / 2;

    std::vector<float> radialProfile;
    int maxR = std::min(cx, cy) - 5;

    for (int r = 5; r < maxR; r++) {
        float sum = 0.f;
        int count = 0;
        for (int angle = 0; angle < 360; angle += 5) {
            float rad = angle * CV_PI / 180.f;
            int x = cx + static_cast<int>(r * cos(rad));
            int y = cy + static_cast<int>(r * sin(rad));
            if (x >= 0 && x < magnitude.cols && y >= 0 && y < magnitude.rows) {
                sum += magnitude.at<float>(y, x);
                count++;
            }
        }
        radialProfile.push_back(count > 0 ? sum / count : 0.f);
    }

    peakCount = 0;
    float maxPeakValue = 0.f;
    dominantFreq = 0.f;

    for (size_t i = 2; i < radialProfile.size() - 2; i++) {
        float val   = radialProfile[i];
        float prev  = radialProfile[i - 1];
        float next  = radialProfile[i + 1];
        float prev2 = radialProfile[i - 2];
        float next2 = radialProfile[i + 2];

        float localMean  = (prev2 + prev + next + next2) / 4.f;
        float prominence = val - localMean;

        if (val > prev && val > next && prominence > config_.fftPeakThreshold) {
            peakCount++;
            if (prominence > maxPeakValue) {
                maxPeakValue = prominence;
                dominantFreq = static_cast<float>(i + 5);
            }
        }
    }

    float score = 0.f;
    if (peakCount >= config_.fftMinPeaks) {
        score = std::min(1.f, peakCount / 6.f + maxPeakValue * 2.f);
    }
    return score;
}

void ScreenDetector::analyzeMoire(const cv::Mat& gray, ScreenDetectionResult& result) {
    cv::Mat floatImg;
    gray.convertTo(floatImg, CV_32F, 1.0 / 255.0);

    cv::Mat kernel45 = (cv::Mat_<float>(3, 3) <<
        -1, -1,  2,
        -1,  2, -1,
         2, -1, -1);

    cv::Mat kernel135 = (cv::Mat_<float>(3, 3) <<
         2, -1, -1,
        -1,  2, -1,
        -1, -1,  2);

    cv::Mat diag45, diag135;
    cv::filter2D(floatImg, diag45,  -1, kernel45);
    cv::filter2D(floatImg, diag135, -1, kernel135);

    cv::Mat absDiag45, absDiag135;
    cv::convertScaleAbs(diag45,  absDiag45,  255);
    cv::convertScaleAbs(diag135, absDiag135, 255);

    double sum45  = cv::sum(absDiag45)[0];
    double sum135 = cv::sum(absDiag135)[0];
    double totalPixels = gray.cols * gray.rows * 255.0;

    float diag45Ratio  = static_cast<float>(sum45  / totalPixels);
    float diag135Ratio = static_cast<float>(sum135 / totalPixels);
    float moireStrength = std::max(diag45Ratio, diag135Ratio);

    cv::Scalar mean45, stddev45, mean135, stddev135;
    cv::meanStdDev(absDiag45,  mean45,  stddev45);
    cv::meanStdDev(absDiag135, mean135, stddev135);
    float periodicScore = static_cast<float>(
        std::max(stddev45[0], stddev135[0]) / 50.0);

    result.moireScore = std::min(1.f, moireStrength * 3.f + periodicScore * 0.5f);

    LOGD("Moire(post): score=%.3f (diag45=%.3f diag135=%.3f)",
         result.moireScore, diag45Ratio, diag135Ratio);
}

void ScreenDetector::analyzeTexture(const cv::Mat& gray, ScreenDetectionResult& result) {
    result.textureVariance = computeMicroTextureVariance(gray);
    float lbpUniform = computeLBPUniformity(gray);

    float varianceScore = 0.f;
    if (result.textureVariance < config_.textureMinVariance) {
        varianceScore = 1.f - (result.textureVariance / config_.textureMinVariance);
    }

    float lbpScore = 0.f;
    if (lbpUniform > config_.lbpUniformThreshold / 100.f) {
        lbpScore = (lbpUniform - config_.lbpUniformThreshold / 100.f) /
                   (1.f - config_.lbpUniformThreshold / 100.f);
    }

    result.textureUniformity = 0.6f * varianceScore + 0.4f * lbpScore;

    LOGD("Texture(post): var=%.2f(score=%.2f) lbp=%.2f(score=%.2f) -> %.2f",
         result.textureVariance, varianceScore, lbpUniform, lbpScore,
         result.textureUniformity);
}

float ScreenDetector::computeMicroTextureVariance(const cv::Mat& gray) {
    std::vector<float> variances;
    int patchSize = 32;
    int step = 64;

    for (int y = patchSize; y < gray.rows - patchSize; y += step) {
        for (int x = patchSize; x < gray.cols - patchSize; x += step) {
            cv::Mat patch = gray(cv::Rect(x - patchSize/2, y - patchSize/2,
                                          patchSize, patchSize));
            cv::Mat blurred, highPass;
            cv::GaussianBlur(patch, blurred, cv::Size(5, 5), 0);
            cv::subtract(patch, blurred, highPass, cv::noArray(), CV_32F);

            cv::Scalar mean, stddev;
            cv::meanStdDev(highPass, mean, stddev);
            variances.push_back(static_cast<float>(stddev[0]));
        }
    }

    if (variances.empty()) return 0.f;
    std::sort(variances.begin(), variances.end());
    return variances[variances.size() / 2];
}

float ScreenDetector::computeLBPUniformity(const cv::Mat& gray) {
    int uniformCount = 0;
    int totalCount = 0;
    int step = 4;

    for (int y = 1; y < gray.rows - 1; y += step) {
        for (int x = 1; x < gray.cols - 1; x += step) {
            uchar center = gray.at<uchar>(y, x);

            uchar neighbors[8];
            neighbors[0] = gray.at<uchar>(y-1, x-1);
            neighbors[1] = gray.at<uchar>(y-1, x);
            neighbors[2] = gray.at<uchar>(y-1, x+1);
            neighbors[3] = gray.at<uchar>(y, x+1);
            neighbors[4] = gray.at<uchar>(y+1, x+1);
            neighbors[5] = gray.at<uchar>(y+1, x);
            neighbors[6] = gray.at<uchar>(y+1, x-1);
            neighbors[7] = gray.at<uchar>(y, x-1);

            uchar pattern = 0;
            for (int i = 0; i < 8; i++) {
                if (neighbors[i] >= center) {
                    pattern |= (1 << i);
                }
            }

            int transitions = 0;
            for (int i = 0; i < 8; i++) {
                int bit1 = (pattern >> i) & 1;
                int bit2 = (pattern >> ((i + 1) % 8)) & 1;
                if (bit1 != bit2) transitions++;
            }

            if (transitions <= 2) uniformCount++;
            totalCount++;
        }
    }

    return totalCount > 0 ? static_cast<float>(uniformCount) / totalCount : 0.f;
}

void ScreenDetector::analyzeSpecular(const cv::Mat& gray, ScreenDetectionResult& result) {
    cv::Mat bright;
    cv::threshold(gray, bright, config_.specularThreshold, 255, cv::THRESH_BINARY);

    int hotspotPixels = cv::countNonZero(bright);
    float hotspotRatio = static_cast<float>(hotspotPixels) / (gray.cols * gray.rows);

    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(bright, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    result.hotspotCount = static_cast<int>(contours.size());

    float maxHotspotArea = 0.f;
    for (const auto& c : contours) {
        float area = static_cast<float>(cv::contourArea(c));
        maxHotspotArea = std::max(maxHotspotArea, area);
    }

    float imageArea = static_cast<float>(gray.cols * gray.rows);
    float maxHotspotRatio = maxHotspotArea / imageArea;

    result.specularScore = 0.f;
    if (hotspotRatio > 0.001f && hotspotRatio < config_.specularAreaMax) {
        if (maxHotspotRatio > 0.005f && result.hotspotCount < 10) {
            result.specularScore = std::min(1.f, maxHotspotRatio * 50.f);
        }
    } else if (hotspotRatio >= config_.specularAreaMax) {
        result.specularScore = 0.8f;
    }

    LOGD("Specular: hotspots=%d ratio=%.4f maxRatio=%.4f -> score=%.2f",
         result.hotspotCount, hotspotRatio, maxHotspotRatio, result.specularScore);
}

void ScreenDetector::analyzeColorBanding(const cv::Mat& image, ScreenDetectionResult& result) {
    if (image.channels() < 3) {
        result.colorBandingScore = 0.f;
        return;
    }

    std::vector<cv::Mat> channels;
    cv::split(image, channels);

    float totalBanding = 0.f;

    for (int c = 0; c < 3; c++) {
        cv::Mat hist;
        int histSize = 256;
        float range[] = {0, 256};
        const float* histRange = {range};
        cv::calcHist(&channels[c], 1, 0, cv::Mat(), hist, 1, &histSize, &histRange);
        hist /= (image.rows * image.cols);

        int gaps = 0;
        int consecutiveZeros = 0;
        for (int i = 1; i < 255; i++) {
            float val = hist.at<float>(i);
            if (val < 0.0001f) {
                consecutiveZeros++;
            } else {
                if (consecutiveZeros >= 2) gaps++;
                consecutiveZeros = 0;
            }
        }
        totalBanding += std::min(1.f, gaps / 20.f);
    }

    result.colorBandingScore = totalBanding / 3.f;
    LOGD("ColorBanding: score=%.3f", result.colorBandingScore);
}

// ============================================================================
// Legacy Quick-Check (ABI kept, functionality replaced by preDetect)
// ============================================================================

ScreenDetector::QuickScreenResult ScreenDetector::quickCheck(const cv::Mat& roiFrame) {
    QuickScreenResult result;
    // Legacy path disabled — preDetect() is the primary path now.
    // Return non-suspicious to avoid blocking.
    return result;
}

bool ScreenDetector::quickCheckWithTemporal(const cv::Mat& roiFrame,
                                             bool& isScreenOut,
                                             float& confidenceOut) {
    // Legacy path disabled — preDetect() + accumulate() is the primary path.
    isScreenOut   = false;
    confidenceOut = 0.f;
    return false;
}

} // namespace validation
