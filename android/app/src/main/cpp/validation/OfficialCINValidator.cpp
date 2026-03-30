/**
 * OfficialCINValidator.cpp
 *
 * Phase 3 — Deterministic Structural Layout Validation for Tunisian CIN
 *
 * Strategy:
 *   FRONT: Flag + Logo + Photo + Header text + ID number + Brightness
 *   BACK:  Fingerprint + Barcode + Municipal stamp + Text block + Brightness
 *
 * Every zone is scored independently (0–1), then combined via fixed weights.
 * All ROIs use ratio-based coordinates.  No OCR.  No ML.  No template matching.
 */

#include "OfficialCINValidator.h"
#include <opencv2/imgproc.hpp>
#include <cmath>
#include <algorithm>
#include <numeric>
#include <android/log.h>

#define LOG_TAG "CINValidator"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Diagnostic tag for pipeline testing (adb logcat | grep CIN)
#define LOGD_CIN(...) __android_log_print(ANDROID_LOG_DEBUG, "CIN", __VA_ARGS__)

namespace validation {

// ============================================================================
// Helper: clamp a value between 0 and 1
// ============================================================================
static inline float clamp01(float v) { return std::min(1.f, std::max(0.f, v)); }

// ============================================================================
// Preprocessing
// ============================================================================

cv::Mat OfficialCINValidator::ensureGrayscale(const cv::Mat& img) {
    if (img.empty()) return cv::Mat();
    if (img.channels() == 1) return img;
    if (img.channels() == 3) {
        cv::Mat g; cv::cvtColor(img, g, cv::COLOR_BGR2GRAY); return g;
    }
    if (img.channels() == 4) {
        cv::Mat g; cv::cvtColor(img, g, cv::COLOR_BGRA2GRAY); return g;
    }
    LOGE("ensureGrayscale: unsupported channels=%d", img.channels());
    return cv::Mat();
}

cv::Mat OfficialCINValidator::preprocess(const cv::Mat& img) {
    cv::Mat gray = ensureGrayscale(img);
    if (gray.empty()) return gray;

    // Adaptive CLAHE
    cv::Scalar m, s;
    cv::meanStdDev(gray, m, s);
    double clip = (s[0] < 25.0) ? CINLayoutConfig::CLAHE_CLIP_LIMIT + 0.5
                : (s[0] < 40.0) ? CINLayoutConfig::CLAHE_CLIP_LIMIT
                :                  1.5;

    cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(
        clip, cv::Size(CINLayoutConfig::CLAHE_TILE_SIZE,
                       CINLayoutConfig::CLAHE_TILE_SIZE));
    cv::Mat out;
    clahe->apply(gray, out);

    int ks = CINLayoutConfig::GAUSSIAN_BLUR_K | 1;  // ensure odd
    cv::GaussianBlur(out, out, cv::Size(ks, ks), 0);
    return out;
}

// ============================================================================
// ROI Extraction (ratio-based)
// ============================================================================

cv::Mat OfficialCINValidator::extractROI(const cv::Mat& img,
                                         float x1r, float y1r,
                                         float x2r, float y2r) {
    int W = img.cols, H = img.rows;
    int x1 = static_cast<int>(x1r * W);
    int y1 = static_cast<int>(y1r * H);
    int x2 = static_cast<int>(x2r * W);
    int y2 = static_cast<int>(y2r * H);

    // Clamp to image bounds
    x1 = std::max(0, std::min(x1, W - 1));
    y1 = std::max(0, std::min(y1, H - 1));
    x2 = std::max(x1 + 1, std::min(x2, W));
    y2 = std::max(y1 + 1, std::min(y2, H));

    return img(cv::Rect(x1, y1, x2 - x1, y2 - y1)).clone();
}

// ============================================================================
// Edge / Projection Utilities
// ============================================================================

float OfficialCINValidator::computeEdgeDensitySobelX(const cv::Mat& gray) {
    if (gray.empty()) return 0.f;
    cv::Mat sobel, absSobel;
    cv::Sobel(gray, sobel, CV_16S, 0, 1, 3);       // horizontal edges
    cv::convertScaleAbs(sobel, absSobel);

    cv::Scalar m, s;
    cv::meanStdDev(absSobel, m, s);
    int thresh = std::max(15, static_cast<int>(m[0] + s[0] * 0.5));
    cv::Mat edges;
    cv::threshold(absSobel, edges, thresh, 255, cv::THRESH_BINARY);
    return static_cast<float>(cv::countNonZero(edges))
         / static_cast<float>(edges.total());
}

float OfficialCINValidator::computeEdgeDensitySobelY(const cv::Mat& gray) {
    if (gray.empty()) return 0.f;
    cv::Mat sobel, absSobel;
    cv::Sobel(gray, sobel, CV_16S, 1, 0, 3);       // vertical edges
    cv::convertScaleAbs(sobel, absSobel);

    cv::Scalar m, s;
    cv::meanStdDev(absSobel, m, s);
    int thresh = std::max(15, static_cast<int>(m[0] + s[0] * 0.5));
    cv::Mat edges;
    cv::threshold(absSobel, edges, thresh, 255, cv::THRESH_BINARY);
    return static_cast<float>(cv::countNonZero(edges))
         / static_cast<float>(edges.total());
}

float OfficialCINValidator::computeEdgeDensityCanny(const cv::Mat& gray) {
    if (gray.empty()) return 0.f;
    cv::Mat edges;
    cv::Canny(gray, edges, 50, 150);
    return static_cast<float>(cv::countNonZero(edges))
         / static_cast<float>(edges.total());
}

float OfficialCINValidator::computeRowProjectionVariance(const cv::Mat& gray) {
    if (gray.empty() || gray.rows < 2) return 0.f;
    std::vector<float> proj(gray.rows, 0.f);
    for (int r = 0; r < gray.rows; ++r) {
        proj[r] = static_cast<float>(cv::sum(gray.row(r))[0]) / gray.cols;
    }
    float mean = std::accumulate(proj.begin(), proj.end(), 0.f) / proj.size();
    float var = 0.f;
    for (float v : proj) var += (v - mean) * (v - mean);
    return var / proj.size();
}

float OfficialCINValidator::computeColumnProjectionVariance(const cv::Mat& gray) {
    if (gray.empty() || gray.cols < 2) return 0.f;
    std::vector<float> proj(gray.cols, 0.f);
    for (int c = 0; c < gray.cols; ++c) {
        proj[c] = static_cast<float>(cv::sum(gray.col(c))[0]) / gray.rows;
    }
    float mean = std::accumulate(proj.begin(), proj.end(), 0.f) / proj.size();
    float var = 0.f;
    for (float v : proj) var += (v - mean) * (v - mean);
    return var / proj.size();
}

// ============================================================================
//  FRONT Zone Evaluators
// ============================================================================

// ── Zone 1: Flag (Top-Right) ─────────────────────────────────────────────
float OfficialCINValidator::evaluateFlagZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::FLAG_X1, CINLayoutConfig::FLAG_Y1,
        CINLayoutConfig::FLAG_X2, CINLayoutConfig::FLAG_Y2);
    if (roi.empty()) return 0.f;

    cv::Scalar m, s;
    cv::meanStdDev(roi, m, s);
    float stddev = static_cast<float>(s[0]);

    float edgeDensity = computeEdgeDensityCanny(roi);

    // Score: stddev contribution (0–0.6) + edge contribution (0–0.4)
    float stdScore = clamp01((stddev - 15.f) / (CINLayoutConfig::FLAG_STDDEV_MIN - 15.f));
    float edgeScore = clamp01(edgeDensity / (CINLayoutConfig::FLAG_EDGE_DENSITY_MIN * 2.f));

    float score = stdScore * 0.6f + edgeScore * 0.4f;

    LOGI("FRONT Z1-Flag: stddev=%.1f edgeDens=%.4f → score=%.3f", stddev, edgeDensity, score);
    return clamp01(score);
}

// ── Zone 2: Logo / Emblem (Bottom-Right) ─────────────────────────────────
float OfficialCINValidator::evaluateLogoZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::LOGO_X1, CINLayoutConfig::LOGO_Y1,
        CINLayoutConfig::LOGO_X2, CINLayoutConfig::LOGO_Y2);
    if (roi.empty()) return 0.f;

    cv::Scalar m, s;
    cv::meanStdDev(roi, m, s);
    float stddev = static_cast<float>(s[0]);

    float edgeDensity = computeEdgeDensityCanny(roi);

    // Check for circular contour presence
    cv::Mat edges;
    cv::Canny(roi, edges, 40, 120);
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(edges, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    float circularityScore = 0.f;
    for (const auto& cnt : contours) {
        double area = cv::contourArea(cnt);
        double perimeter = cv::arcLength(cnt, true);
        if (perimeter > 0 && area > 50) {
            double circ = 4.0 * CV_PI * area / (perimeter * perimeter);
            if (circ > 0.5f) {
                circularityScore = std::max(circularityScore, clamp01(static_cast<float>(circ)));
            }
        }
    }

    float stdScore  = clamp01((stddev - 10.f) / (CINLayoutConfig::LOGO_STDDEV_MIN - 10.f));
    float edgeScore = clamp01(edgeDensity / (CINLayoutConfig::LOGO_EDGE_DENSITY_MIN * 3.f));

    float score = stdScore * 0.3f + edgeScore * 0.35f + circularityScore * 0.35f;

    LOGI("FRONT Z2-Logo: stddev=%.1f edgeDens=%.4f circ=%.3f → score=%.3f",
         stddev, edgeDensity, circularityScore, score);
    return clamp01(score);
}

// ── Zone 3: Photo Region (Left Block) ────────────────────────────────────
float OfficialCINValidator::evaluatePhotoZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::PHOTO_X1, CINLayoutConfig::PHOTO_Y1,
        CINLayoutConfig::PHOTO_X2, CINLayoutConfig::PHOTO_Y2);
    if (roi.empty()) return 0.f;

    cv::Scalar m, s;
    cv::meanStdDev(roi, m, s);
    float stddev = static_cast<float>(s[0]);
    float mean   = static_cast<float>(m[0]);

    // Photo should have significantly higher variance than background
    float stdScore = clamp01((stddev - 18.f) / (CINLayoutConfig::PHOTO_STDDEV_MIN - 18.f));

    // Photo region should not be uniformly bright (blank area)
    float meanPenalty = (mean > 230.f) ? 0.5f : 1.0f;  // penalize near-white

    // Check edge density — photos have moderate edge density
    float edgeDensity = computeEdgeDensityCanny(roi);
    float edgeScore = clamp01(edgeDensity / 0.08f);

    float score = (stdScore * 0.55f + edgeScore * 0.45f) * meanPenalty;

    LOGI("FRONT Z3-Photo: stddev=%.1f mean=%.1f edgeDens=%.4f → score=%.3f",
         stddev, mean, edgeDensity, score);
    return clamp01(score);
}

// ── Zone 4: Header Text Band (Top Center) ────────────────────────────────
float OfficialCINValidator::evaluateHeaderZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::HEADER_X1, CINLayoutConfig::HEADER_Y1,
        CINLayoutConfig::HEADER_X2, CINLayoutConfig::HEADER_Y2);
    if (roi.empty()) return 0.f;

    // Horizontal edges (text lines)
    float hEdgeDensity = computeEdgeDensitySobelX(roi);

    // Row projection variance — text lines create oscillation
    float rowProjVar = computeRowProjectionVariance(roi);

    float edgeScore = clamp01(hEdgeDensity / (CINLayoutConfig::HEADER_EDGE_DENSITY_MIN * 2.f));
    float projScore = clamp01(rowProjVar / (CINLayoutConfig::HEADER_PROJECTION_VARIANCE_MIN * 2.f));

    float score = edgeScore * 0.55f + projScore * 0.45f;

    LOGI("FRONT Z4-Header: hEdge=%.4f rowProjVar=%.1f → score=%.3f",
         hEdgeDensity, rowProjVar, score);
    return clamp01(score);
}

// ── Zone 5: ID Number Zone (Center) ──────────────────────────────────────
float OfficialCINValidator::evaluateIdNumberZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::ID_X1, CINLayoutConfig::ID_Y1,
        CINLayoutConfig::ID_X2, CINLayoutConfig::ID_Y2);
    if (roi.empty()) return 0.f;

    // Vertical edges (digit strokes)
    float vEdgeDensity = computeEdgeDensitySobelY(roi);

    // Column projection variance — digits create regularly spaced peaks
    float colProjVar = computeColumnProjectionVariance(roi);

    float edgeScore = clamp01(vEdgeDensity / (CINLayoutConfig::ID_VEDGE_DENSITY_MIN * 2.f));
    float projScore = clamp01(colProjVar / 120.f);   // normalize

    float score = edgeScore * 0.55f + projScore * 0.45f;

    LOGI("FRONT Z5-ID: vEdge=%.4f colProjVar=%.1f → score=%.3f",
         vEdgeDensity, colProjVar, score);
    return clamp01(score);
}

// ============================================================================
//  BACK Zone Evaluators
// ============================================================================

// ── Zone 1: Fingerprint (Right Side) ─────────────────────────────────────
float OfficialCINValidator::evaluateFingerprintZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::FP_X1, CINLayoutConfig::FP_Y1,
        CINLayoutConfig::FP_X2, CINLayoutConfig::FP_Y2);
    if (roi.empty()) return 0.f;

    cv::Scalar m, s;
    cv::meanStdDev(roi, m, s);
    float stddev = static_cast<float>(s[0]);

    // Fine texture creates high edge density
    float edgeDensity = computeEdgeDensityCanny(roi);

    float stdScore  = clamp01((stddev - 18.f) / (CINLayoutConfig::FP_STDDEV_MIN - 18.f));
    float edgeScore = clamp01(edgeDensity / (CINLayoutConfig::FP_EDGE_DENSITY_MIN * 2.f));

    float score = stdScore * 0.5f + edgeScore * 0.5f;

    LOGI("BACK Z1-Fingerprint: stddev=%.1f edgeDens=%.4f → score=%.3f",
         stddev, edgeDensity, score);
    return clamp01(score);
}

// ── Zone 2: Barcode (Bottom Strip) ───────────────────────────────────────
float OfficialCINValidator::evaluateBarcodeZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::BC_X1, CINLayoutConfig::BC_Y1,
        CINLayoutConfig::BC_X2, CINLayoutConfig::BC_Y2);
    if (roi.empty()) return 0.f;

    // Strong vertical edges (barcode bars)
    float vEdgeDensity = computeEdgeDensitySobelY(roi);

    // Column projection — alternating bars produce high variance
    float colProjVar = computeColumnProjectionVariance(roi);

    float edgeScore = clamp01(vEdgeDensity / (CINLayoutConfig::BC_VEDGE_DENSITY_MIN * 2.f));
    float projScore = clamp01(colProjVar / 200.f);

    float score = edgeScore * 0.6f + projScore * 0.4f;

    LOGI("BACK Z2-Barcode: vEdge=%.4f colProjVar=%.1f → score=%.3f",
         vEdgeDensity, colProjVar, score);
    return clamp01(score);
}

// ── Zone 3: Municipal Stamp (Center-Left) ────────────────────────────────
float OfficialCINValidator::evaluateStampZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::STAMP_X1, CINLayoutConfig::STAMP_Y1,
        CINLayoutConfig::STAMP_X2, CINLayoutConfig::STAMP_Y2);
    if (roi.empty()) return 0.f;

    cv::Scalar m, s;
    cv::meanStdDev(roi, m, s);
    float stddev = static_cast<float>(s[0]);

    // Look for circular contours (stamp is circular)
    cv::Mat edges;
    cv::Canny(roi, edges, 30, 100);
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(edges, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    float circularityScore = 0.f;
    for (const auto& cnt : contours) {
        double area = cv::contourArea(cnt);
        double perimeter = cv::arcLength(cnt, true);
        if (perimeter > 0 && area > 80) {
            double circ = 4.0 * CV_PI * area / (perimeter * perimeter);
            if (circ > 0.4f) {
                circularityScore = std::max(circularityScore, clamp01(static_cast<float>(circ)));
            }
        }
    }

    float edgeDensity = computeEdgeDensityCanny(roi);

    float stdScore  = clamp01((stddev - 8.f) / (CINLayoutConfig::STAMP_STDDEV_MIN - 8.f));
    float edgeScore = clamp01(edgeDensity / (CINLayoutConfig::STAMP_EDGE_DENSITY_MIN * 3.f));

    float score = stdScore * 0.25f + edgeScore * 0.30f + circularityScore * 0.45f;

    LOGI("BACK Z3-Stamp: stddev=%.1f edgeDens=%.4f circ=%.3f → score=%.3f",
         stddev, edgeDensity, circularityScore, score);
    return clamp01(score);
}

// ── Zone 4: Upper Text Block ─────────────────────────────────────────────
float OfficialCINValidator::evaluateBackTextZone(const cv::Mat& gray) {
    cv::Mat roi = extractROI(gray,
        CINLayoutConfig::BTEXT_X1, CINLayoutConfig::BTEXT_Y1,
        CINLayoutConfig::BTEXT_X2, CINLayoutConfig::BTEXT_Y2);
    if (roi.empty()) return 0.f;

    // Horizontal edges — text lines
    float hEdgeDensity = computeEdgeDensitySobelX(roi);

    // Row projection variance
    float rowProjVar = computeRowProjectionVariance(roi);

    float edgeScore = clamp01(hEdgeDensity / (CINLayoutConfig::BTEXT_HEDGE_DENSITY_MIN * 2.f));
    float projScore = clamp01(rowProjVar / 100.f);

    float score = edgeScore * 0.55f + projScore * 0.45f;

    LOGI("BACK Z4-Text: hEdge=%.4f rowProjVar=%.1f → score=%.3f",
         hEdgeDensity, rowProjVar, score);
    return clamp01(score);
}

// ============================================================================
//  Shared: Brightness Evaluation
// ============================================================================

float OfficialCINValidator::evaluateBrightness(const cv::Mat& gray) {
    cv::Scalar m, s;
    cv::meanStdDev(gray, m, s);
    float mean   = static_cast<float>(m[0]);
    float stddev = static_cast<float>(s[0]);

    // Mean brightness score (0 if < 80, 1.0 if >= 120)
    float meanScore = clamp01((mean - 80.f) / (CINLayoutConfig::BRIGHTNESS_MEAN_MIN - 80.f));

    // Stddev score — not too low (blank), not excessively high
    float stdScore = 0.f;
    if (stddev >= CINLayoutConfig::BRIGHTNESS_STDDEV_MIN) {
        stdScore = clamp01(stddev / 60.f);
    }

    float score = meanScore * 0.6f + stdScore * 0.4f;

    LOGI("Brightness: mean=%.1f stddev=%.1f → score=%.3f", mean, stddev, score);
    return clamp01(score);
}

// ============================================================================
//  validateFront
// ============================================================================

FrontLayoutResult OfficialCINValidator::validateFront(const cv::Mat& warpedImg) {
    FrontLayoutResult result = {};
    result.valid = false;
    result.score = 0.f;

    if (warpedImg.empty()) {
        LOGE("validateFront: empty image");
        return result;
    }

    if (warpedImg.cols != CINLayoutConfig::EXPECTED_WIDTH ||
        warpedImg.rows != CINLayoutConfig::EXPECTED_HEIGHT) {
        LOGE("validateFront: unexpected size %dx%d", warpedImg.cols, warpedImg.rows);
        return result;
    }

    cv::Mat gray = preprocess(warpedImg);
    if (gray.empty()) return result;

    // ── Evaluate every zone ──────────────────────────────────────────
    result.flagScore       = evaluateFlagZone(gray);
    result.logoScore       = evaluateLogoZone(gray);
    result.photoScore      = evaluatePhotoZone(gray);
    result.headerScore     = evaluateHeaderZone(gray);
    result.idNumberScore   = evaluateIdNumberZone(gray);
    result.brightnessScore = evaluateBrightness(gray);

    // ── Weighted total ───────────────────────────────────────────────
    result.score =
        result.flagScore       * CINLayoutConfig::FRONT_FLAG_WEIGHT +
        result.logoScore       * CINLayoutConfig::FRONT_LOGO_WEIGHT +
        result.photoScore      * CINLayoutConfig::FRONT_PHOTO_WEIGHT +
        result.headerScore     * CINLayoutConfig::FRONT_HEADER_WEIGHT +
        result.idNumberScore   * CINLayoutConfig::FRONT_ID_WEIGHT +
        result.brightnessScore * CINLayoutConfig::FRONT_BRIGHTNESS_WEIGHT;

    result.valid = (result.score >= CINLayoutConfig::FRONT_VALID_THRESHOLD);

    LOGI("═══════════════════════════════════════════════════════════════════");
    LOGI("FRONT LAYOUT VALIDATION: %s  (score=%.3f, threshold=%.2f)",
         result.valid ? "PASS" : "FAIL", result.score,
         CINLayoutConfig::FRONT_VALID_THRESHOLD);
    LOGI("───────────────────────────────────────────────────────────────────");
    LOGI("  Flag=%.3f×%.2f  Logo=%.3f×%.2f  Photo=%.3f×%.2f",
         result.flagScore,   CINLayoutConfig::FRONT_FLAG_WEIGHT,
         result.logoScore,   CINLayoutConfig::FRONT_LOGO_WEIGHT,
         result.photoScore,  CINLayoutConfig::FRONT_PHOTO_WEIGHT);
    LOGI("  Header=%.3f×%.2f  ID=%.3f×%.2f  Bright=%.3f×%.2f",
         result.headerScore,     CINLayoutConfig::FRONT_HEADER_WEIGHT,
         result.idNumberScore,   CINLayoutConfig::FRONT_ID_WEIGHT,
         result.brightnessScore, CINLayoutConfig::FRONT_BRIGHTNESS_WEIGHT);
    LOGI("═══════════════════════════════════════════════════════════════════");
    // Stage D diagnostic log (FRONT)
    LOGD_CIN("LAYOUT photo=%.2f flag=%.2f logo=%.2f id=%.2f bright=%.2f score=%.2f valid=%d",
             result.photoScore, result.flagScore, result.logoScore,
             result.idNumberScore, result.brightnessScore, result.score,
             result.valid ? 1 : 0);
    return result;
}

// ============================================================================
//  validateBack
// ============================================================================

BackLayoutResult OfficialCINValidator::validateBack(const cv::Mat& warpedImg) {
    BackLayoutResult result = {};
    result.valid = false;
    result.score = 0.f;

    if (warpedImg.empty()) {
        LOGE("validateBack: empty image");
        return result;
    }

    if (warpedImg.cols != CINLayoutConfig::EXPECTED_WIDTH ||
        warpedImg.rows != CINLayoutConfig::EXPECTED_HEIGHT) {
        LOGE("validateBack: unexpected size %dx%d", warpedImg.cols, warpedImg.rows);
        return result;
    }

    cv::Mat gray = preprocess(warpedImg);
    if (gray.empty()) return result;

    // ── Evaluate every zone ──────────────────────────────────────────
    result.fingerprintScore = evaluateFingerprintZone(gray);
    result.barcodeScore     = evaluateBarcodeZone(gray);
    result.stampScore       = evaluateStampZone(gray);
    result.textScore        = evaluateBackTextZone(gray);
    result.brightnessScore  = evaluateBrightness(gray);

    // ── Per-zone minimum floors (hard reject) ──────────────────────
    if (result.fingerprintScore < CINLayoutConfig::BACK_FP_FLOOR) {
        LOGW("BACK FLOOR REJECT: fingerprintScore=%.3f < %.2f",
             result.fingerprintScore, CINLayoutConfig::BACK_FP_FLOOR);
        result.valid = false;
        result.score = 0.f;
        return result;
    }
    if (result.barcodeScore < CINLayoutConfig::BACK_BC_FLOOR) {
        LOGW("BACK FLOOR REJECT: barcodeScore=%.3f < %.2f",
             result.barcodeScore, CINLayoutConfig::BACK_BC_FLOOR);
        result.valid = false;
        result.score = 0.f;
        return result;
    }

    // ── Weighted total ───────────────────────────────────────────────────
    result.score =
        result.fingerprintScore * CINLayoutConfig::BACK_FP_WEIGHT +
        result.barcodeScore     * CINLayoutConfig::BACK_BC_WEIGHT +
        result.stampScore       * CINLayoutConfig::BACK_STAMP_WEIGHT +
        result.textScore        * CINLayoutConfig::BACK_TEXT_WEIGHT +
        result.brightnessScore  * CINLayoutConfig::BACK_BRIGHTNESS_WEIGHT;

    // ── Cross-zone consistency: fingerprint must have more edge density than text ──
    {
        cv::Mat fpROI = extractROI(gray,
            CINLayoutConfig::FP_X1, CINLayoutConfig::FP_Y1,
            CINLayoutConfig::FP_X2, CINLayoutConfig::FP_Y2);
        cv::Mat textROI = extractROI(gray,
            CINLayoutConfig::BTEXT_X1, CINLayoutConfig::BTEXT_Y1,
            CINLayoutConfig::BTEXT_X2, CINLayoutConfig::BTEXT_Y2);
        if (!fpROI.empty() && !textROI.empty()) {
            float fpEdge   = computeEdgeDensityCanny(fpROI);
            float textEdge = computeEdgeDensityCanny(textROI);
            if (fpEdge <= textEdge) {
                result.score *= 0.90f;  // 10% penalty
                LOGI("BACK cross-zone penalty: fpEdge=%.4f <= textEdge=%.4f → score*=0.90",
                     fpEdge, textEdge);
            }
        }
    }

    result.valid = (result.score >= CINLayoutConfig::BACK_VALID_THRESHOLD);

    LOGI("═══════════════════════════════════════════════════════════════════");
    LOGI("BACK LAYOUT VALIDATION: %s  (score=%.3f, threshold=%.2f)",
         result.valid ? "PASS" : "FAIL", result.score,
         CINLayoutConfig::BACK_VALID_THRESHOLD);
    LOGI("───────────────────────────────────────────────────────────────────");
    LOGI("  Fingerprint=%.3f×%.2f  Barcode=%.3f×%.2f  Stamp=%.3f×%.2f",
         result.fingerprintScore, CINLayoutConfig::BACK_FP_WEIGHT,
         result.barcodeScore,     CINLayoutConfig::BACK_BC_WEIGHT,
         result.stampScore,       CINLayoutConfig::BACK_STAMP_WEIGHT);
    LOGI("  Text=%.3f×%.2f  Bright=%.3f×%.2f",
         result.textScore,       CINLayoutConfig::BACK_TEXT_WEIGHT,
         result.brightnessScore, CINLayoutConfig::BACK_BRIGHTNESS_WEIGHT);
    LOGI("═══════════════════════════════════════════════════════════════════");

    // Stage D diagnostic log (BACK)
    LOGD_CIN("LAYOUT fp=%.2f barcode=%.2f stamp=%.2f text=%.2f bright=%.2f score=%.2f valid=%d",
             result.fingerprintScore, result.barcodeScore, result.stampScore,
             result.textScore, result.brightnessScore, result.score,
             result.valid ? 1 : 0);

    return result;
}

} // namespace validation
