/**
 * CardWarper.cpp
 * 
 * Implémentation du module de normalisation perspective.
 * Transforme un quadrilatère détecté en image rectangulaire fixe 1000×630 px.
 */

#include "CardWarper.h"
#include <opencv2/imgproc.hpp>
#include <algorithm>
#include <cmath>
#include <set>
#include <cfloat>
#include <android/log.h>

#define LOG_TAG "CardWarper"

// Performance: Disable verbose debug logging in production
#define WARPER_VERBOSE_LOG 0

#if WARPER_VERBOSE_LOG
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#else
#define LOGD(...) ((void)0)  // No-op when disabled
#endif

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Diagnostic tag for pipeline testing (adb logcat | grep CIN)
#define LOGD_CIN(...) __android_log_print(ANDROID_LOG_DEBUG, "CIN", __VA_ARGS__)

namespace warp {

// ============================================================================
// Constructeurs
// ============================================================================

CardWarper::CardWarper() : config_() {
    LOGD("CardWarper initialized with default config: %dx%d", 
         config_.outputWidth, config_.outputHeight);
}

CardWarper::CardWarper(const WarpConfig& config) : config_(config) {
    LOGD("CardWarper initialized with custom config: %dx%d", 
         config_.outputWidth, config_.outputHeight);
}

// ============================================================================
// Fonction principale: warp()
// ============================================================================

WarpResult CardWarper::warp(const cv::Mat& frame, 
                            const std::vector<cv::Point2f>& quadPoints) {
    WarpResult result;
    result.success = false;
    result.gammaApplied = false;
    result.gammaUsed = 1.0f;
    result.meanLuminance = 0.f;
    
    // Validation des entrées
    if (frame.empty()) {
        LOGE("warp: Input frame is empty");
        return result;
    }
    
    if (quadPoints.size() != 4) {
        LOGE("warp: Expected 4 points, got %zu", quadPoints.size());
        return result;
    }
    
    // Étape 1: Trier les coins dans l'ordre TL, TR, BR, BL
    result.sortedCorners = sortCorners(quadPoints);
    
    if (result.sortedCorners.size() != 4) {
        LOGE("warp: Corner sorting failed");
        return result;
    }
    
    LOGD("Sorted corners: TL(%.1f,%.1f) TR(%.1f,%.1f) BR(%.1f,%.1f) BL(%.1f,%.1f)",
         result.sortedCorners[0].x, result.sortedCorners[0].y,
         result.sortedCorners[1].x, result.sortedCorners[1].y,
         result.sortedCorners[2].x, result.sortedCorners[2].y,
         result.sortedCorners[3].x, result.sortedCorners[3].y);
    
    // Étape 2: Définir les points destination
    std::vector<cv::Point2f> dstPoints = {
        cv::Point2f(0.f, 0.f),                                           // TL
        cv::Point2f(static_cast<float>(config_.outputWidth - 1), 0.f),   // TR
        cv::Point2f(static_cast<float>(config_.outputWidth - 1), 
                    static_cast<float>(config_.outputHeight - 1)),        // BR
        cv::Point2f(0.f, static_cast<float>(config_.outputHeight - 1))   // BL
    };
    
    // Étape 3: Calculer la matrice d'homographie
    cv::Mat M = cv::getPerspectiveTransform(result.sortedCorners, dstPoints);
    
    if (M.empty()) {
        LOGE("warp: getPerspectiveTransform failed");
        return result;
    }
    
    // Étape 4: Appliquer la transformation perspective
    cv::Mat warped;
    cv::warpPerspective(
        frame,
        warped,
        M,
        cv::Size(config_.outputWidth, config_.outputHeight),
        cv::INTER_LINEAR,
        cv::BORDER_REPLICATE
    );
    
    if (warped.empty()) {
        LOGE("warp: warpPerspective returned empty image");
        return result;
    }
    
    // Vérifier dimensions de sortie
    if (warped.cols != config_.outputWidth || warped.rows != config_.outputHeight) {
        LOGE("warp: Unexpected output size %dx%d (expected %dx%d)",
             warped.cols, warped.rows, config_.outputWidth, config_.outputHeight);
        return result;
    }
    
    LOGD("Warp successful: %dx%d", warped.cols, warped.rows);
    
    // Étape 5: Calcul luminance et correction gamma optionnelle
    result.meanLuminance = computeMeanLuminance(warped);
    LOGD("Mean luminance: %.1f", result.meanLuminance);
    
    if (config_.gammaEnabled) {
        float gamma = 1.0f;
        
        if (result.meanLuminance < config_.gammaMeanMin) {
            // Image trop sombre → éclaircir (gamma < 1)
            gamma = 1.0f / config_.gammaValue;
            LOGD("Applying brightening gamma: %.2f (mean=%.1f < %.1f)", 
                 gamma, result.meanLuminance, config_.gammaMeanMin);
        } else if (result.meanLuminance > config_.gammaMeanMax) {
            // Image trop claire → assombrir (gamma > 1)
            gamma = config_.gammaValue;
            LOGD("Applying darkening gamma: %.2f (mean=%.1f > %.1f)", 
                 gamma, result.meanLuminance, config_.gammaMeanMax);
        }
        
        if (std::abs(gamma - 1.0f) > 0.01f) {
            warped = applyGamma(warped, gamma);
            result.gammaApplied = true;
            result.gammaUsed = gamma;
            
            // Recalculer luminance après correction
            result.meanLuminance = computeMeanLuminance(warped);
            LOGD("After gamma correction, mean luminance: %.1f", result.meanLuminance);
        }
    }
    
    result.warpedImage = warped;
    result.success = true;

    // Stage B diagnostic: warp verification
    {
        cv::Mat warpedGrayDiag;
        if (warped.channels() == 1) {
            warpedGrayDiag = warped;
        } else {
            cv::cvtColor(warped, warpedGrayDiag, cv::COLOR_BGR2GRAY);
        }
        cv::Scalar meanVal, stdVal;
        cv::meanStdDev(warpedGrayDiag, meanVal, stdVal);
        LOGD_CIN("WARP size=%dx%d mean=%.1f std=%.1f",
                 warpedGrayDiag.cols, warpedGrayDiag.rows,
                 meanVal[0], stdVal[0]);
    }

    return result;
}

// ============================================================================
// Version simplifiée
// ============================================================================

cv::Mat CardWarper::warpSimple(const cv::Mat& frame, 
                               const std::vector<cv::Point2f>& quadPoints) {
    WarpResult result = warp(frame, quadPoints);
    return result.success ? result.warpedImage : cv::Mat();
}

// ============================================================================
// Tri des coins: TL, TR, BR, BL
// ============================================================================

std::vector<cv::Point2f> CardWarper::sortCorners(const std::vector<cv::Point2f>& pts) {
    if (pts.size() != 4) {
        LOGE("sortCorners: Expected 4 points, got %zu", pts.size());
        return {};
    }
    
    std::vector<cv::Point2f> sorted(4);
    
    // Méthode robuste: utiliser somme et différence des coordonnées
    // TL → min(x + y)  : coin le plus proche de l'origine
    // BR → max(x + y)  : coin le plus éloigné de l'origine
    // TR → min(y - x)  : coin en haut à droite
    // BL → max(y - x)  : coin en bas à gauche
    
    float minSum = FLT_MAX, maxSum = -FLT_MAX;
    float minDiff = FLT_MAX, maxDiff = -FLT_MAX;
    int tlIdx = 0, brIdx = 0, trIdx = 0, blIdx = 0;
    
    for (int i = 0; i < 4; i++) {
        float sum = pts[i].x + pts[i].y;
        float diff = pts[i].y - pts[i].x;
        
        if (sum < minSum) {
            minSum = sum;
            tlIdx = i;
        }
        if (sum > maxSum) {
            maxSum = sum;
            brIdx = i;
        }
        if (diff < minDiff) {
            minDiff = diff;
            trIdx = i;
        }
        if (diff > maxDiff) {
            maxDiff = diff;
            blIdx = i;
        }
    }
    
    // Vérifier qu'on a 4 indices distincts
    // En cas de perspective très forte, les indices peuvent se chevaucher
    // Dans ce cas, utiliser une seconde méthode basée sur le centroïde
    
    std::set<int> indices = {tlIdx, trIdx, brIdx, blIdx};
    
    if (indices.size() != 4) {
        LOGW("sortCorners: Ambiguous corners detected, using centroid method");
        
        // Calculer centroïde
        float cx = 0.f, cy = 0.f;
        for (const auto& p : pts) {
            cx += p.x;
            cy += p.y;
        }
        cx /= 4.f;
        cy /= 4.f;
        
        // Classer chaque point selon quadrant relatif au centroïde
        std::vector<std::pair<int, cv::Point2f>> classified;
        for (int i = 0; i < 4; i++) {
            classified.push_back({i, pts[i]});
        }
        
        // Trier par angle autour du centroïde
        std::sort(classified.begin(), classified.end(), 
            [cx, cy](const std::pair<int, cv::Point2f>& a, 
                     const std::pair<int, cv::Point2f>& b) {
                float angleA = std::atan2(a.second.y - cy, a.second.x - cx);
                float angleB = std::atan2(b.second.y - cy, b.second.x - cx);
                return angleA < angleB;
            });
        
        // Trouver le coin top-left (celui avec le plus petit x+y parmi les triés)
        int startIdx = 0;
        float minSumClassified = FLT_MAX;
        for (int i = 0; i < 4; i++) {
            float s = classified[i].second.x + classified[i].second.y;
            if (s < minSumClassified) {
                minSumClassified = s;
                startIdx = i;
            }
        }
        
        // Réordonner à partir de TL dans le sens horaire
        sorted[0] = classified[startIdx].second;           // TL
        sorted[1] = classified[(startIdx + 1) % 4].second; // TR
        sorted[2] = classified[(startIdx + 2) % 4].second; // BR
        sorted[3] = classified[(startIdx + 3) % 4].second; // BL
    } else {
        sorted[0] = pts[tlIdx]; // TL
        sorted[1] = pts[trIdx]; // TR
        sorted[2] = pts[brIdx]; // BR
        sorted[3] = pts[blIdx]; // BL
    }
    
    return sorted;
}

// ============================================================================
// Correction Gamma via LUT
// ============================================================================

cv::Mat CardWarper::applyGamma(const cv::Mat& img, float gamma) {
    if (img.empty() || gamma <= 0.f) {
        return img.clone();
    }
    
    // Créer LUT
    cv::Mat lut(1, 256, CV_8UC1);
    float invGamma = 1.0f / gamma;
    
    for (int i = 0; i < 256; i++) {
        float normalized = static_cast<float>(i) / 255.f;
        float corrected = std::pow(normalized, invGamma);
        lut.at<uchar>(0, i) = static_cast<uchar>(
            std::clamp(corrected * 255.f, 0.f, 255.f)
        );
    }
    
    // Appliquer LUT
    cv::Mat result;
    
    if (img.channels() == 1) {
        cv::LUT(img, lut, result);
    } else if (img.channels() == 3 || img.channels() == 4) {
        // Convertir en HSV, appliquer gamma sur V, reconvertir
        cv::Mat hsv;
        cv::cvtColor(img, hsv, cv::COLOR_BGR2HSV);
        
        std::vector<cv::Mat> channels;
        cv::split(hsv, channels);
        
        cv::LUT(channels[2], lut, channels[2]); // V channel
        
        cv::merge(channels, hsv);
        cv::cvtColor(hsv, result, cv::COLOR_HSV2BGR);
    } else {
        result = img.clone();
    }
    
    return result;
}

// ============================================================================
// Calcul luminance moyenne
// ============================================================================

float CardWarper::computeMeanLuminance(const cv::Mat& img) {
    if (img.empty()) {
        return 0.f;
    }
    
    cv::Mat gray;
    
    if (img.channels() == 1) {
        gray = img;
    } else if (img.channels() == 3) {
        cv::cvtColor(img, gray, cv::COLOR_BGR2GRAY);
    } else if (img.channels() == 4) {
        cv::cvtColor(img, gray, cv::COLOR_BGRA2GRAY);
    } else {
        return 0.f;
    }
    
    cv::Scalar mean = cv::mean(gray);
    return static_cast<float>(mean[0]);
}

// ============================================================================
// Mise à jour LUT gamma (optimisation pour usage répété)
// ============================================================================

void CardWarper::updateGammaLUT(float gamma) {
    if (std::abs(gamma - lastGamma_) < 0.001f && !gammaLUT_.empty()) {
        return; // LUT déjà à jour
    }
    
    gammaLUT_ = cv::Mat(1, 256, CV_8UC1);
    float invGamma = 1.0f / gamma;
    
    for (int i = 0; i < 256; i++) {
        float normalized = static_cast<float>(i) / 255.f;
        float corrected = std::pow(normalized, invGamma);
        gammaLUT_.at<uchar>(0, i) = static_cast<uchar>(
            std::clamp(corrected * 255.f, 0.f, 255.f)
        );
    }
    
    lastGamma_ = gamma;
}

} // namespace warp
