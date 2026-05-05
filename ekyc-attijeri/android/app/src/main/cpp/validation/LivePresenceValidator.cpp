/**
 * LivePresenceValidator.cpp
 *
 * Clean implementation — Interaction-Based Liveness Protocol.
 *
 * All passive detectors (T7, T8, T10, T11) and their associated buffers
 * (brightness history, FFT history, temporal noise, texture thresholds) have
 * been removed.  The file compiles from a clean baseline.
 *
 * Three-stage pipeline:
 *   1) Stabilization  — 10-frame quad-corner variance gate.
 *   2) Tilt challenge — collect 30-40 highlight centroids.
 *   3) Verification   — cumulative centroid displacement > 40 px → LIVE.
 */

#include "LivePresenceValidator.h"

#include <opencv2/imgproc.hpp>
#include <opencv2/core.hpp>
#include <cmath>
#include <algorithm>
#include <android/log.h>

#define LOG_TAG "LivePresence"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGD_CIN(...) __android_log_print(ANDROID_LOG_DEBUG, "CIN", __VA_ARGS__)

namespace validation {

/* ================================================================== */
/*  performFullReset  (internal)                                       */
/* ================================================================== */

void LivePresenceValidator::performFullReset() {
    m_state              = PresenceState::WAIT_FOR_CARD;
    m_detectorLostFrames = 0;
    m_quadHistory.clear();
    m_highlightCentroids.clear();
    m_bootstrapAreas.clear();
    m_challengeFrames    = 0;
    m_totalPushed        = 0;
    m_refArea            = 0.f;
    m_refAreaLocked      = false;
    m_bootstrapFrames    = 0;
    m_contourFrames      = 0;
    m_totalBlobArea      = 0.f;
    m_totalPeakRatio     = 0.f;
    m_totalSatFraction   = 0.f;
    m_totalCompactness   = 0.f;
    LOGD("full reset — all buffers cleared");
}

/* ================================================================== */
/*  reset  (public — may be called by Java/JNI at any time)           */
/* ================================================================== */

void LivePresenceValidator::reset() {
    if (m_state == PresenceState::BOOTSTRAP   ||
        m_state == PresenceState::STABILIZING ||
        m_state == PresenceState::CHALLENGE)
    {
        ++m_detectorLostFrames;
        if (m_detectorLostFrames < DETECTOR_GRACE_FRAMES) {
            LOGD("reset ignored (protocol in progress, lostFrames=%d/%d)",
                 m_detectorLostFrames, DETECTOR_GRACE_FRAMES);
            return;
        }
        LOGD("detector lost for %d frames — performing full reset",
             m_detectorLostFrames);
    }
    performFullReset();
}

/* ================================================================== */
/*  pushFrame                                                          */
/* ================================================================== */

void LivePresenceValidator::pushFrame(const cv::Mat& rawGray,
                                      const cv::Mat& warped,
                                      const std::vector<cv::Point2f>& quad) {
    if (rawGray.empty() || warped.empty() || quad.size() != 4) return;
    if (m_state == PresenceState::DECISION) return;  // wait for external reset

    // Valid frame received — clear detection-loss grace counter
    m_detectorLostFrames = 0;
    ++m_totalPushed;

    const float area   = quadArea(quad);
    const float aspect = quadAspect(quad);

    /* ---- WAIT_FOR_CARD → BOOTSTRAP ---- */
    if (m_state == PresenceState::WAIT_FOR_CARD) {
        m_state = PresenceState::BOOTSTRAP;
        LOGD("state -> BOOTSTRAP");
    }

    /* ---- BOOTSTRAP phase: lock reference area ---- */
    if (m_state == PresenceState::BOOTSTRAP) {
        if (!m_refAreaLocked) {
            ++m_bootstrapFrames;
            if (aspect > CARD_ASPECT_MIN && aspect < CARD_ASPECT_MAX) {
                m_bootstrapAreas.push_back(area);
                LOGD("bootstrap candidate: area=%.1f aspect=%.2f (frame %d, %d collected)",
                     area, aspect, m_bootstrapFrames,
                     static_cast<int>(m_bootstrapAreas.size()));
            }
            if (m_bootstrapFrames >= BOOTSTRAP_FRAMES) {
                if (!m_bootstrapAreas.empty()) {
                    std::sort(m_bootstrapAreas.begin(), m_bootstrapAreas.end());
                    const size_t mid = m_bootstrapAreas.size() / 2;
                    m_refArea       = m_bootstrapAreas[mid];
                    m_refAreaLocked = true;
                    m_state         = PresenceState::STABILIZING;
                    LOGD("refArea LOCKED (median of %d areas): %.1f -> state -> STABILIZING",
                         static_cast<int>(m_bootstrapAreas.size()), m_refArea);
                } else {
                    m_bootstrapFrames = 0;
                    m_bootstrapAreas.clear();
                    LOGD("bootstrap FAILED: no valid aspect quad — retrying");
                }
            }
        } else {
            // refArea was preserved through a grace window — skip straight ahead
            m_state = PresenceState::STABILIZING;
            LOGD("refArea already locked (%.1f) -> state -> STABILIZING", m_refArea);
        }
        return;
    }

    /* ---- STABILIZING phase ---- */
    if (m_state == PresenceState::STABILIZING) {
        if (area < m_refArea * 0.6f || area > m_refArea * 1.6f) {
            LOGD("quad REJECTED area=%.1f refArea=%.1f ratio=%.2f (STABILIZING)",
                 area, m_refArea, area / m_refArea);
            return;
        }
        m_quadHistory.push_back(quad);
        while (static_cast<int>(m_quadHistory.size()) > STABILITY_WINDOW)
            m_quadHistory.pop_front();

        if (isCardStable()) {
            m_state           = PresenceState::CHALLENGE;
            m_challengeFrames = 0;
            m_highlightCentroids.clear();
            LOGD("challenge STARTED (card stable, frame %d)", m_totalPushed);
        }
        return;
    }

    /* ---- CHALLENGE phase ---- */
    if (m_state == PresenceState::CHALLENGE) {
        if (m_challengeFrames >= CHALLENGE_MAX_FRAMES) {
            m_state = PresenceState::DECISION;
            LOGD("state -> DECISION (max frames reached)");
            return;
        }

        ++m_challengeFrames;

        cv::Point2f centroid;
        float       blobArea = 0.f;
        float       peakRatio = 0.f, satFraction = 0.f, compactness = 0.f;
        if (extractHighlightCentroid(warped, centroid, blobArea,
                                     peakRatio, satFraction, compactness)) {
            m_highlightCentroids.push_back(centroid);
            if (blobArea > 0.f) {
                ++m_contourFrames;
                m_totalBlobArea    += blobArea;
                m_totalPeakRatio   += peakRatio;
                m_totalSatFraction += satFraction;
                m_totalCompactness += compactness;
            }
            LOGD("frame %d  centroid=(%.1f,%.1f) blob=%.1f peakR=%.2f sat=%.3f compact=%.4f",
                 m_totalPushed, centroid.x, centroid.y, blobArea,
                 peakRatio, satFraction, compactness);
        }

        if (m_challengeFrames >= CHALLENGE_MIN_FRAMES) {
            m_state = PresenceState::DECISION;
            LOGD("state -> DECISION (min frames reached, centroids=%d)",
                 static_cast<int>(m_highlightCentroids.size()));
        }
        return;
    }
}

/* ================================================================== */
/*  evaluate                                                           */
/* ================================================================== */

PresenceResult LivePresenceValidator::evaluate() const {
    PresenceResult res;
    res.frameCount = m_totalPushed;

    if (m_state == PresenceState::WAIT_FOR_CARD ||
        m_state == PresenceState::BOOTSTRAP) {
        LOGD("evaluate: waiting for card (%d quads in history)",
             static_cast<int>(m_quadHistory.size()));
        return res;
    }

    if (m_state == PresenceState::STABILIZING) {
        LOGD("evaluate: stabilizing (%d / %d quads)",
             static_cast<int>(m_quadHistory.size()), STABILITY_WINDOW);
        return res;
    }

    if (m_state == PresenceState::CHALLENGE) {
        LOGD("evaluate: collecting tilt frames (%d / %d)",
             m_challengeFrames, CHALLENGE_MIN_FRAMES);
        return res;
    }

    /* m_state == DECISION — emit result */

    /* ---- Stage 3: Decision ---- */
    const float totalMotion  = computeHighlightMotion();

    // Blob quality check: real card highlights are small concentrated spots.
    // Screen cards either never find real contours (all fallback, contourFrames low)
    // or find large diffuse blobs (avgBlobArea high). Either way blobOk = false.
    const int   minContourFrames = static_cast<int>(CHALLENGE_MIN_FRAMES * HIGHLIGHT_MIN_CONTOUR_FRAC);
    const float avgBlobArea      = (m_contourFrames > 0)
                                   ? m_totalBlobArea / static_cast<float>(m_contourFrames)
                                   : 0.f;
    const bool  blobOk = (m_contourFrames >= minContourFrames) &&
                         (avgBlobArea < HIGHLIGHT_BLOB_MAX_AREA);

    const bool  isLive = (totalMotion > HIGHLIGHT_MOTION_THRESHOLD) && blobOk;

    LOGD("blobCheck: contourFrames=%d/%d avgBlobArea=%.1f maxAllowed=%.1f blobOk=%d",
         m_contourFrames, minContourFrames, avgBlobArea,
         HIGHLIGHT_BLOB_MAX_AREA, blobOk ? 1 : 0);

    /* Fill result */
    res.live            = isLive;
    res.spoofDetected   = !isLive;
    res.highlightMotion = totalMotion;

    /* Scores for JNI compatibility */
    res.highlightScore  = std::min(totalMotion / HIGHLIGHT_MOTION_THRESHOLD, 1.f);
    res.totalScore      = res.highlightScore;

    /* All legacy boolean detectors remain disabled */
    res.screenFFT      = false;
    res.subpixelGrid   = false;
    res.paperPrint     = false;
    res.temporalStable = false;
    res.textureWeak    = false;
    res.fftStationary  = false;

    /* Route debug values through existing JNI log fields */
    res.dbgEnergy     = totalMotion;
    res.dbgTextureStd = 0.f;
    res.dbgFftDiff    = 0.f;
    res.dbgVotes      = isLive ? 0 : 1;

    LOGD("LIVENESS highlightMotion=%.2f blobOk=%d isLive=%d centroids=%d challengeFrames=%d",
         totalMotion, blobOk ? 1 : 0, isLive ? 1 : 0,
         static_cast<int>(m_highlightCentroids.size()), m_challengeFrames);

    // Intensity instrumentation summary
    const float meanPeakRatio   = (m_contourFrames > 0) ? m_totalPeakRatio   / m_contourFrames : 0.f;
    const float meanSatFraction = (m_contourFrames > 0) ? m_totalSatFraction / m_contourFrames : 0.f;
    const float meanCompactness = (m_contourFrames > 0) ? m_totalCompactness / m_contourFrames : 0.f;
    LOGD("INTENSITY motion=%.2f peakRatio=%.2f satFrac=%.3f compact=%.4f contourFrames=%d",
         totalMotion, meanPeakRatio, meanSatFraction, meanCompactness, m_contourFrames);

    LOGD_CIN("LIVENESS motion=%.2f peakRatio=%.2f satFrac=%.3f compact=%.4f isLive=%d",
             totalMotion, meanPeakRatio, meanSatFraction, meanCompactness, isLive ? 1 : 0);

    return res;
}

/* ================================================================== */
/*  isCardStable                                                       */
/* ================================================================== */

bool LivePresenceValidator::isCardStable() const {
    if (static_cast<int>(m_quadHistory.size()) < STABILITY_WINDOW)
        return false;

    float totalVar = 0.f;

    for (int c = 0; c < 4; ++c) {
        float sumX = 0.f, sumY = 0.f;
        for (const auto& q : m_quadHistory) {
            sumX += q[c].x;
            sumY += q[c].y;
        }
        const float n    = static_cast<float>(m_quadHistory.size());
        const float meanX = sumX / n;
        const float meanY = sumY / n;

        float varX = 0.f, varY = 0.f;
        for (const auto& q : m_quadHistory) {
            float dx = q[c].x - meanX;
            float dy = q[c].y - meanY;
            varX += dx * dx;
            varY += dy * dy;
        }
        totalVar += (varX + varY) / n;   // combined variance for this corner
    }

    const float meanCornerVar     = totalVar / 4.f;
    // Adaptive threshold: pixel variance scales with card area in the frame.
    // CORNER_VAR_THRESHOLD is the baseline for a ~10000-area card.
    // At larger card areas (card held closer) the same physical tremor maps
    // to proportionally more pixels, so we scale the threshold accordingly.
    const float adaptiveThreshold = std::max(CORNER_VAR_THRESHOLD, m_refArea * 0.004f);
    LOGD("isCardStable: var=%.2f threshold=%.2f refArea=%.0f -> %s",
         meanCornerVar, adaptiveThreshold, m_refArea,
         meanCornerVar < adaptiveThreshold ? "STABLE" : "unstable");
    return meanCornerVar < adaptiveThreshold;
}

/* ================================================================== */
/*  extractHighlightCentroid                                           */
/* ================================================================== */

bool LivePresenceValidator::extractHighlightCentroid(
        const cv::Mat& warpedGray, cv::Point2f& outCentroid, float& outBlobArea,
        float& outPeakRatio, float& outSatFraction, float& outCompactness) const {
    outBlobArea    = 0.f;
    outPeakRatio   = 0.f;
    outSatFraction = 0.f;
    outCompactness = 0.f;

    if (warpedGray.empty()) return false;

    /* Fix 3: wider ROI — covers 20-80% width, 20-80% height */
    cv::Rect roi = getMaterialROI(warpedGray);
    cv::Mat  patch = warpedGray(roi);

    /* Compute ROI median for peak ratio (done before top-hat) */
    std::vector<uchar> patchPixels(patch.begin<uchar>(), patch.end<uchar>());
    std::nth_element(patchPixels.begin(),
                     patchPixels.begin() + patchPixels.size() / 2,
                     patchPixels.end());
    const float roiMedian = static_cast<float>(patchPixels[patchPixels.size() / 2]);

    /* Fix 4: larger 15x15 kernel catches wider specular highlights */
    cv::Mat kernel = cv::getStructuringElement(
        cv::MORPH_RECT, cv::Size(TOPHAT_KERNEL_SIZE, TOPHAT_KERNEL_SIZE));
    cv::Mat tophat;
    cv::morphologyEx(patch, tophat, cv::MORPH_TOPHAT, kernel);

    /* Fix 2: adaptive threshold = mean + 1.5 * stddev of the top-hat result */
    cv::Scalar mean, stddev;
    cv::meanStdDev(tophat, mean, stddev);
    const double adaptiveThresh = mean[0] + 1.5 * stddev[0];
    cv::Mat bright;
    cv::threshold(tophat, bright, adaptiveThresh, 255, cv::THRESH_BINARY);

    /* Try contour-based centroid first */
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(bright, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    if (!contours.empty()) {
        int    bestIdx  = -1;
        double bestArea = 0.0;
        for (int i = 0; i < static_cast<int>(contours.size()); ++i) {
            double a = cv::contourArea(contours[i]);
            if (a > bestArea) { bestArea = a; bestIdx = i; }
        }
        if (bestIdx >= 0 && bestArea > 0.0) {
            cv::Moments mu = cv::moments(contours[bestIdx]);
            if (std::abs(mu.m00) >= 1e-6) {
                outCentroid.x = static_cast<float>(mu.m10 / mu.m00) + static_cast<float>(roi.x);
                outCentroid.y = static_cast<float>(mu.m01 / mu.m00) + static_cast<float>(roi.y);
                outBlobArea   = static_cast<float>(bestArea);

                // --- Intensity instrumentation ---
                // Peak intensity ratio: max pixel in blob region / ROI median
                cv::Rect blobBBox = cv::boundingRect(contours[bestIdx]);
                double peakVal;
                cv::minMaxLoc(patch(blobBBox), nullptr, &peakVal);
                outPeakRatio = (roiMedian > 1.f)
                    ? static_cast<float>(peakVal) / roiMedian
                    : 0.f;

                // Saturation fraction: pixels >= 240 inside the blob mask
                cv::Mat blobMask = cv::Mat::zeros(patch.size(), CV_8UC1);
                cv::drawContours(blobMask, contours, bestIdx, cv::Scalar(255), cv::FILLED);
                cv::Mat blobPixels;
                patch.copyTo(blobPixels, blobMask);
                int saturated = cv::countNonZero(blobPixels >= 240);
                outSatFraction = (bestArea > 0.0)
                    ? static_cast<float>(saturated) / static_cast<float>(bestArea)
                    : 0.f;

                // Compactness: area / perimeter²
                double perimeter = cv::arcLength(contours[bestIdx], true);
                outCompactness = (perimeter > 1.0)
                    ? static_cast<float>(bestArea / (perimeter * perimeter))
                    : 0.f;

                return true;
            }
        }
    }

    /* Fix 5: fallback — use the brightest pixel as the centroid (all metrics stay 0) */
    double minVal, maxVal;
    cv::Point maxLoc;
    cv::minMaxLoc(patch, &minVal, &maxVal, nullptr, &maxLoc);
    outCentroid.x = static_cast<float>(maxLoc.x + roi.x);
    outCentroid.y = static_cast<float>(maxLoc.y + roi.y);
    LOGD("centroid fallback: brightest pixel=(%.1f, %.1f) val=%.1f",
         outCentroid.x, outCentroid.y, static_cast<float>(maxVal));
    return true;
}

/* ================================================================== */
/*  computeHighlightMotion                                             */
/* ================================================================== */

float LivePresenceValidator::computeHighlightMotion() const {
    if (m_highlightCentroids.size() < 2) return 0.f;

    float total = 0.f;
    for (size_t i = 1; i < m_highlightCentroids.size(); ++i) {
        float dx = m_highlightCentroids[i].x - m_highlightCentroids[i - 1].x;
        float dy = m_highlightCentroids[i].y - m_highlightCentroids[i - 1].y;
        total += std::sqrt(dx * dx + dy * dy);
    }
    return total;
}

/* ================================================================== */
/*  getMaterialROI                                                     */
/* ================================================================== */

cv::Rect LivePresenceValidator::getMaterialROI(const cv::Mat& img) {
    int w = img.cols;
    int h = img.rows;
    /* Central band of the card: avoids photo (left), text (right/bottom),
       barcode, and edge artifacts. */
    /* Fix 3: expanded ROI — 20-80% width, 20-80% height */
    return cv::Rect(static_cast<int>(w * 0.20f),
                    static_cast<int>(h * 0.20f),
                    static_cast<int>(w * 0.60f),
                    static_cast<int>(h * 0.60f));
}

/* ================================================================== */
/*  quadAspect  (bounding-box width / height)                         */
/* ================================================================== */

float LivePresenceValidator::quadAspect(const std::vector<cv::Point2f>& pts) {
    if (pts.size() != 4) return 0.f;
    float minX = pts[0].x, maxX = pts[0].x;
    float minY = pts[0].y, maxY = pts[0].y;
    for (const auto& p : pts) {
        minX = std::min(minX, p.x);
        maxX = std::max(maxX, p.x);
        minY = std::min(minY, p.y);
        maxY = std::max(maxY, p.y);
    }
    const float h = maxY - minY;
    return (h < 1.f) ? 0.f : (maxX - minX) / h;
}

/* ================================================================== */
/*  quadArea  (shoelace formula)                                       */
/* ================================================================== */

float LivePresenceValidator::quadArea(const std::vector<cv::Point2f>& pts) {
    if (pts.size() != 4) return 0.f;
    float area = 0.f;
    for (int i = 0; i < 4; ++i) {
        int j = (i + 1) % 4;
        area += pts[i].x * pts[j].y;
        area -= pts[j].x * pts[i].y;
    }
    return std::abs(area) * 0.5f;
}

} // namespace validation
