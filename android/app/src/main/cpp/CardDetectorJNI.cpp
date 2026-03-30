
/**
 * CardDetectorJNI.cpp
 * JNI bridge – exposes C++ CardDetector and CardWarper to Java/Kotlin
 *
 * Return format (float[24]):
 *   [0]  isValid          (1.0 / 0.0)
 *   [1]  confidence       (0..1)
 *   [2..9]  corners x0,y0 … x3,y3
 *   [10] edgeWhitePixels
 *   [11] totalContours
 *   [12] candidateQuads
 *   [13] bestScore
 *   [14] topNContours
 *   [15] rejectedByArea
 *   [16] rejectedByApprox
 *   [17] rejectedByAspect
 *   [18] largestContourAreaRatio
 *   [19] rejectedByEdgeDensity
 *   [20] temporalValidCount
 *   [21] hasWarpedImage   (1.0 / 0.0)
 *   [22] warpedLuminance  (0-255)
 *   [23] warpedGamma      (gamma used)
 */

#include <jni.h>
#include <android/log.h>
#include <android/bitmap.h>
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include "CardDetector.h"
#include "warp/CardWarper.h"
#include "validation/CardSideClassifier.h"
#include "validation/OfficialCINValidator.h"
#include "validation/LivePresenceValidator.h"
#include <memory>

#define LOG_TAG "CardDetectorJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static constexpr int RESULT_LEN = 24;
static std::unique_ptr<CardDetection::CardDetector> g_detector = nullptr;
static std::unique_ptr<warp::CardWarper> g_warper = nullptr;
static std::unique_ptr<validation::CardSideClassifier> g_sideClassifier = nullptr;
static std::unique_ptr<validation::OfficialCINValidator> g_cinValidator = nullptr;
static std::unique_ptr<validation::LivePresenceValidator> g_presenceValidator = nullptr;

// ══════════════════════════════════════════════════════════════════════════════
// TEMPORARY DISABLE: LivePresenceValidator (DATE: 2026-03-25)
//
// The anti-spoof/liveness module is BYPASSED due to instability in detection.
// All LivePresenceValidator code is preserved for future reactivation.
//
// Reactivation steps:
// 1. Set ENABLE_LIVENESS = true
// 2. Remove bypass condition from React Native (CameraScreen.tsx line ~731)
// 3. Validate performance with real CIN cards
// ══════════════════════════════════════════════════════════════════════════════
static constexpr bool ENABLE_LIVENESS = false;

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-CAPTURE STATE MACHINE (Recto → Verso Flow)
//
// State transitions:
//   WAIT_FRONT → (capture front) → WAIT_BACK → (capture back) → FINISHED
//
// The system automatically transitions between states.
// No manual input required from the user.
// ══════════════════════════════════════════════════════════════════════════════
enum class CaptureState {
    WAIT_FRONT = 0,      // Waiting to capture front (recto)
    WAIT_BACK = 1,       // Front captured, waiting to capture back (verso)
    FINISHED = 2         // Both sides captured
};

static CaptureState g_captureState = CaptureState::WAIT_FRONT;
static cv::Mat g_capturedFrontImage;   // Stored recto (1000x630 grayscale)
static cv::Mat g_capturedBackImage;    // Stored verso (1000x630 grayscale)
static bool g_hasCapturedFront = false;
static bool g_hasCapturedBack = false;

// Last warped image storage
static cv::Mat g_lastWarpedImage;     // Grayscale warped image (1000x630)
static bool g_hasWarpedImage = false;
static float g_warpedLuminance = 0.f;
static float g_warpedGamma = 1.f;

// Raw gray + quad for presence validation (Phase 4)
static cv::Mat g_lastRawGray;                       // full-res rotated gray
static std::vector<cv::Point2f> g_lastQuadCorners;  // 4 corners in raw gray coords
static bool g_hasQuadCorners = false;

// Fill the 24-float result array from a CardDetectionResult
static void fillResult(float* out, const CardDetection::CardDetectionResult& r) {
    out[0] = r.isValid ? 1.f : 0.f;
    out[1] = r.confidence;
    if (r.isValid) {
        for (int i = 0; i < 4; i++) {
            out[2 + i * 2]     = r.corners[i].x;
            out[2 + i * 2 + 1] = r.corners[i].y;
        }
    }
    out[10] = static_cast<float>(r.debug.edgeWhitePixels);
    out[11] = static_cast<float>(r.debug.totalContours);
    out[12] = static_cast<float>(r.debug.candidateQuads);
    out[13] = r.debug.bestScore;
    out[14] = static_cast<float>(r.debug.topNContours);
    out[15] = static_cast<float>(r.debug.rejectedByArea);
    out[16] = static_cast<float>(r.debug.rejectedByApprox);
    out[17] = static_cast<float>(r.debug.rejectedByAspect);
    out[18] = r.debug.largestContourAreaRatio;
    out[19] = static_cast<float>(r.debug.rejectedByEdgeDensity);
    out[20] = static_cast<float>(r.debug.temporalValidCount);
    // Warp info (filled by caller after warp)
    out[21] = g_hasWarpedImage ? 1.f : 0.f;
    out[22] = g_warpedLuminance;
    out[23] = g_warpedGamma;
}

extern "C" {

JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeInit(JNIEnv*, jclass) {
    if (!g_detector) {
        g_detector = std::make_unique<CardDetection::CardDetector>();
        LOGI("CardDetector initialised");
    }
    if (!g_warper) {
        g_warper = std::make_unique<warp::CardWarper>();
        LOGI("CardWarper initialised");
    }
}

JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeRelease(JNIEnv*, jclass) {
    g_detector.reset();
    g_warper.reset();
    g_lastWarpedImage.release();
    g_hasWarpedImage = false;
    LOGI("CardDetector and CardWarper released");
}

JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeSetConfig(
    JNIEnv*, jclass,
    jint cannyLow, jint cannyHigh, jint blurSize,
    jfloat minArea, jfloat maxArea,
    jfloat targetRatio, jfloat ratioTolerance)
{
    if (!g_detector) { LOGE("not initialised"); return; }

    CardDetection::DetectionConfig cfg;
    // cannyLow/High are now adaptive (ignored); blurSize maps to gaussianBlurSize
    (void)cannyLow; (void)cannyHigh;
    cfg.gaussianBlurSize   = (blurSize > 0 && blurSize <= 15) ? blurSize : 5;
    cfg.minAreaRatio       = minArea;
    cfg.maxAreaRatio       = maxArea;
    cfg.targetAspectRatio  = targetRatio;
    cfg.aspectRatioTolerance = ratioTolerance;
    g_detector->setConfig(cfg);
    LOGI("config updated");
}

JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeSetOverlay(
    JNIEnv*, jclass,
    jboolean enabled,
    jfloat x, jfloat y, jfloat width, jfloat height,
    jboolean useROICropping)
{
    if (!g_detector) { LOGE("not initialised"); return; }

    CardDetection::DetectionConfig cfg = g_detector->getConfig();
    cfg.overlay.enabled = enabled;
    cfg.overlay.x = x;
    cfg.overlay.y = y;
    cfg.overlay.width = width;
    cfg.overlay.height = height;
    cfg.useROICropping = useROICropping;
    
    g_detector->setConfig(cfg);
    LOGI("overlay config: enabled=%d [%.3f,%.3f %.3fx%.3f] useROI=%d",
         enabled, x, y, width, height, useROICropping);
}

// ── Set scan mode (FRONT requires red flag, BACK does not) ──

JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeSetScanMode(
    JNIEnv*, jclass,
    jint mode)
{
    if (!g_detector) { LOGE("not initialised"); return; }
    
    CardDetection::DetectionConfig cfg = g_detector->getConfig();
    
    // mode: 0 = FRONT (require red flag), 1 = BACK (no red flag needed)
    if (mode == 1) {
        // BACK mode: disable red validation
        cfg.redValidationEnabled = false;
        LOGI("Scan mode: BACK (red validation DISABLED)");
    } else {
        // FRONT mode (default): require red flag
        cfg.redValidationEnabled = true;
        LOGI("Scan mode: FRONT (red validation ENABLED)");
    }
    
    g_detector->setConfig(cfg);
}

// ── Detect from YUV (VisionCamera path) ──

JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeDetectFromYUV(
    JNIEnv* env, jclass,
    jobject yBuffer, jobject uBuffer, jobject vBuffer,
    jint width, jint height,
    jint yRowStride, jint uvRowStride, jint uvPixelStride,
    jint rotationDegrees)
{
    jfloatArray jresult = env->NewFloatArray(RESULT_LEN);
    float data[RESULT_LEN] = {};

    if (!g_detector) {
        LOGE("not initialised");
        env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
        return jresult;
    }

    auto* yData = static_cast<uint8_t*>(env->GetDirectBufferAddress(yBuffer));
    if (!yData) {
        LOGE("null Y buffer");
        env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
        return jresult;
    }

    // ── Build grayscale Mat from Y plane (with stride handling) ──
    cv::Mat yMat(height, width, CV_8UC1);
    if (yRowStride == width) {
        memcpy(yMat.data, yData, width * height);
    } else {
        for (int r = 0; r < height; r++)
            memcpy(yMat.ptr(r), yData + r * yRowStride, width);
    }

    // ── Apply rotation to align raw sensor frame with screen orientation ──
    // Camera sensor is landscape; rotation corrects for phone portrait mode.
    cv::Mat grayRotated;
    switch (rotationDegrees) {
        case 90:
            cv::rotate(yMat, grayRotated, cv::ROTATE_90_CLOCKWISE);
            break;
        case 180:
            cv::rotate(yMat, grayRotated, cv::ROTATE_180);
            break;
        case 270:
            cv::rotate(yMat, grayRotated, cv::ROTATE_90_COUNTERCLOCKWISE);
            break;
        default:
            grayRotated = yMat;  // 0° — no copy
            break;
    }
    // Silenced per-frame log to prevent logcat buffer flood
    // LOGI("nativeDetectFromYUV: %dx%d rot=%d → %dx%d",
    //      width, height, rotationDegrees, grayRotated.cols, grayRotated.rows);

    // ── Build Cr (V-plane) Mat for red validation ──
    // Android YUV_420_888: V plane = Cr channel, half resolution.
    cv::Mat crRotated;
    auto* vData = vBuffer ? static_cast<uint8_t*>(env->GetDirectBufferAddress(vBuffer)) : nullptr;
    if (vData) {
        int uvW = width  / 2;
        int uvH = height / 2;
        cv::Mat crMat(uvH, uvW, CV_8UC1);

        if (uvPixelStride == 1) {
            // Planar (I420/YV12)
            for (int r = 0; r < uvH; r++)
                memcpy(crMat.ptr(r), vData + r * uvRowStride, uvW);
        } else {
            // Semi-planar (NV21 / NV12): V bytes interleaved, stride >= uvW*2
            for (int r = 0; r < uvH; r++)
                for (int c = 0; c < uvW; c++)
                    crMat.at<uchar>(r, c) = vData[r * uvRowStride + c * uvPixelStride];
        }

        // Rotate Cr to match gray rotation
        switch (rotationDegrees) {
            case 90:  cv::rotate(crMat, crRotated, cv::ROTATE_90_CLOCKWISE);        break;
            case 180: cv::rotate(crMat, crRotated, cv::ROTATE_180);                 break;
            case 270: cv::rotate(crMat, crRotated, cv::ROTATE_90_COUNTERCLOCKWISE); break;
            default:  crRotated = crMat;                                             break;
        }
    }

    // ── Run detection (pass gray directly — no BGR conversion needed) ──
    g_detector->setCrMat(crRotated);
    auto result = g_detector->detectCard(grayRotated);
    
    // ── Warp if detection is valid ──
    // IMPORTANT: Do NOT clear warp/quad flags unconditionally.
    // Presence validator samples every ~400ms; clearing every 100ms frame
    // creates temporal starvation. Only invalidate when detection truly fails.
    
    if (result.isValid && result.corners.size() == 4 && g_warper) {
        // Corners from CardDetector are already in pixel coordinates - don't multiply!
        std::vector<cv::Point2f> quadPoints;
        for (const auto& corner : result.corners) {
            quadPoints.push_back(cv::Point2f(corner.x, corner.y));
        }
        
        // Perform warp
        warp::WarpResult warpResult = g_warper->warp(grayRotated, quadPoints);
        
        if (warpResult.success) {
            g_lastWarpedImage = warpResult.warpedImage.clone();
            g_hasWarpedImage = true;
            g_warpedLuminance = warpResult.meanLuminance;
            g_warpedGamma = warpResult.gammaUsed;
            
            // Store raw gray + quad for Phase 4 presence validation
            g_lastRawGray = grayRotated.clone();
            g_lastQuadCorners = quadPoints;
            g_hasQuadCorners = true;
            
            // Silenced per-frame warp log to prevent flood
            // LOGI("Warp SUCCESS: %dx%d, luminance=%.1f, gamma=%.2f",
            //      g_lastWarpedImage.cols, g_lastWarpedImage.rows,
            //      g_warpedLuminance, g_warpedGamma);
        }
    } else {
        // Detection truly lost — now clear persistent state
        g_hasWarpedImage = false;
        g_warpedLuminance = 0.f;
        g_warpedGamma = 1.f;
        g_hasQuadCorners = false;
    }
    
    fillResult(data, result);

    env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
    return jresult;
}

// ── Detect from Bitmap ──

JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeDetectFromBitmap(
    JNIEnv* env, jclass, jobject bitmap)
{
    jfloatArray jresult = env->NewFloatArray(RESULT_LEN);
    float data[RESULT_LEN] = {};

    if (!g_detector) {
        env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
        return jresult;
    }

    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS) {
        env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
        return jresult;
    }

    void* pixels = nullptr;
    AndroidBitmap_lockPixels(env, bitmap, &pixels);

    cv::Mat rgba(info.height, info.width, CV_8UC4, pixels);
    cv::Mat bgr;
    cv::cvtColor(rgba, bgr, cv::COLOR_RGBA2BGR);
    AndroidBitmap_unlockPixels(env, bitmap);

    auto result = g_detector->detectCard(bgr);
    fillResult(data, result);

    env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
    return jresult;
}

// ── Detect from grayscale byte[] ──

JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeDetectFromGrayscale(
    JNIEnv* env, jclass,
    jbyteArray jdata, jint width, jint height)
{
    jfloatArray jresult = env->NewFloatArray(RESULT_LEN);
    float data[RESULT_LEN] = {};

    if (!g_detector) {
        env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
        return jresult;
    }

    jbyte* raw = env->GetByteArrayElements(jdata, nullptr);
    cv::Mat gray(height, width, CV_8UC1, reinterpret_cast<uint8_t*>(raw));
    cv::Mat bgr;
    cv::cvtColor(gray, bgr, cv::COLOR_GRAY2BGR);
    env->ReleaseByteArrayElements(jdata, raw, JNI_ABORT);

    auto result = g_detector->detectCard(bgr);
    fillResult(data, result);

    env->SetFloatArrayRegion(jresult, 0, RESULT_LEN, data);
    return jresult;
}

// ── Get warped image as byte array (RGBA format) ──

JNIEXPORT jbyteArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeGetWarpedImage(JNIEnv* env, jclass) {
    if (!g_hasWarpedImage || g_lastWarpedImage.empty()) {
        LOGI("No warped image available");
        return nullptr;
    }
    
    // Ensure the image is continuous
    cv::Mat grayImage = g_lastWarpedImage.isContinuous() ? 
                        g_lastWarpedImage : g_lastWarpedImage.clone();
    
    // Convert grayscale to RGBA manually for Android Bitmap compatibility
    // Android ARGB_8888 with copyPixelsFromBuffer expects RGBA byte order
    int width = grayImage.cols;
    int height = grayImage.rows;
    int size = width * height * 4;
    
    std::vector<uint8_t> rgbaData(size);
    const uint8_t* grayPtr = grayImage.data;
    
    for (int i = 0; i < width * height; i++) {
        uint8_t gray = grayPtr[i];
        rgbaData[i * 4 + 0] = gray;  // R
        rgbaData[i * 4 + 1] = gray;  // G
        rgbaData[i * 4 + 2] = gray;  // B
        rgbaData[i * 4 + 3] = 255;   // A
    }
    
    jbyteArray result = env->NewByteArray(size);
    env->SetByteArrayRegion(result, 0, size, reinterpret_cast<jbyte*>(rgbaData.data()));
    
    LOGI("Returning warped image: %dx%d, size=%d bytes", width, height, size);
    
    return result;
}

// ── Get warped image dimensions ──

JNIEXPORT jintArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeGetWarpedImageDimensions(JNIEnv* env, jclass) {
    jintArray result = env->NewIntArray(2);
    int dims[2] = {0, 0};
    
    if (g_hasWarpedImage && !g_lastWarpedImage.empty()) {
        dims[0] = g_lastWarpedImage.cols;  // width = 1000
        dims[1] = g_lastWarpedImage.rows;  // height = 630
    }
    
    env->SetIntArrayRegion(result, 0, 2, dims);
    return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2: Card Side Classification (FRONT / BACK / UNKNOWN)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Classify the last warped image as FRONT, BACK, or UNKNOWN
 * 
 * Return format (float[12]):
 *   [0] side           (0=FRONT, 1=BACK, 2=UNKNOWN)
 *   [1] confidence     (0..1)
 *   [2] flagDetected   (0 or 1)
 *   [3] flagRedRatio   (0..1)
 *   [4] photoTextureDetected (0 or 1)
 *   [5] photoStddev    (0..255)
 *   [6] barcodeDetected (0 or 1)
 *   [7] barcodeEdgeDensity (0..1)
 *   [8] fingerprintDetected (0 or 1)
 *   [9] fingerprintStddev (0..255)
 *   [10] meanBrightness (0..255)
 *   [11] brightEnough   (0 or 1)
 *   [12] mrzDetected    (0 or 1)
 *   [13] mrzEdgeDensity (0..1)
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeClassifyCardSide(JNIEnv* env, jclass) {
    static constexpr int CLASSIFY_RESULT_LEN = 14;
    jfloatArray jresult = env->NewFloatArray(CLASSIFY_RESULT_LEN);
    float data[CLASSIFY_RESULT_LEN] = {};
    
    // Initialize classifier if needed
    if (!g_sideClassifier) {
        g_sideClassifier = std::make_unique<validation::CardSideClassifier>();
        LOGI("CardSideClassifier initialized");
    }
    
    // Check if warped image is available
    if (!g_hasWarpedImage || g_lastWarpedImage.empty()) {
        LOGE("nativeClassifyCardSide: No warped image available");
        env->SetFloatArrayRegion(jresult, 0, CLASSIFY_RESULT_LEN, data);
        return jresult;
    }
    
    // Verify dimensions
    if (g_lastWarpedImage.cols != 1000 || g_lastWarpedImage.rows != 630) {
        LOGE("nativeClassifyCardSide: Invalid warped image size %dx%d",
             g_lastWarpedImage.cols, g_lastWarpedImage.rows);
        env->SetFloatArrayRegion(jresult, 0, CLASSIFY_RESULT_LEN, data);
        return jresult;
    }
    
    // Perform classification
    validation::SideClassificationResult result = 
        g_sideClassifier->classifyWithDetails(g_lastWarpedImage);
    
    // Pack result into float array
    data[0] = static_cast<float>(static_cast<int>(result.side));  // 0=FRONT, 1=BACK, 2=UNKNOWN
    data[1] = result.confidence;
    data[2] = result.flagDetected ? 1.f : 0.f;
    data[3] = result.flagRedRatio;
    data[4] = result.photoTextureDetected ? 1.f : 0.f;
    data[5] = result.photoStddev;
    data[6] = result.barcodeDetected ? 1.f : 0.f;
    data[7] = result.barcodeEdgeDensity;
    data[8] = result.fingerprintDetected ? 1.f : 0.f;
    data[9] = result.fingerprintStddev;
    data[10] = result.meanBrightness;
    data[11] = result.brightEnough ? 1.f : 0.f;
    data[12] = result.mrzDetected ? 1.f : 0.f;
    data[13] = result.mrzEdgeDensity;
    
    LOGI("Classification result: side=%s confidence=%.2f mrz=%s",
         validation::CardSideClassifier::sideToString(result.side),
         result.confidence,
         result.mrzDetected ? "YES" : "no");
    
    env->SetFloatArrayRegion(jresult, 0, CLASSIFY_RESULT_LEN, data);
    return jresult;
}

/**
 * Validate layout of the last warped image against official CIN structure.
 * Must call classifyCardSide first to know which side.
 *
 * @param sideInt  0 = FRONT,  1 = BACK
 *
 * Return format (float[8]):
 *   [0] valid         (1.0 / 0.0)
 *   [1] score         (0..1)
 *   [2] zone1Score    (0..1)
 *   [3] zone2Score    (0..1)
 *   [4] zone3Score    (0..1)
 *   [5] zone4Score    (0..1)
 *   [6] zone5Score    (0..1)
 *   [7] zone6Score    (0..1)   — only used for FRONT; 0 for BACK
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeValidateLayout(
        JNIEnv* env, jclass, jint sideInt) {
    static constexpr int LAYOUT_RESULT_LEN = 8;
    jfloatArray jresult = env->NewFloatArray(LAYOUT_RESULT_LEN);
    float data[LAYOUT_RESULT_LEN] = {};

    // Initialize validator if needed
    if (!g_cinValidator) {
        g_cinValidator = std::make_unique<validation::OfficialCINValidator>();
        LOGI("OfficialCINValidator initialized");
    }

    // Check if warped image is available
    if (!g_hasWarpedImage || g_lastWarpedImage.empty()) {
        LOGE("nativeValidateLayout: No warped image available");
        env->SetFloatArrayRegion(jresult, 0, LAYOUT_RESULT_LEN, data);
        return jresult;
    }

    if (g_lastWarpedImage.cols != 1000 || g_lastWarpedImage.rows != 630) {
        LOGE("nativeValidateLayout: Invalid warped image size %dx%d",
             g_lastWarpedImage.cols, g_lastWarpedImage.rows);
        env->SetFloatArrayRegion(jresult, 0, LAYOUT_RESULT_LEN, data);
        return jresult;
    }

    if (sideInt == 0) {
        // FRONT
        validation::FrontLayoutResult r = g_cinValidator->validateFront(g_lastWarpedImage);
        data[0] = r.valid ? 1.f : 0.f;
        data[1] = r.score;
        data[2] = r.flagScore;
        data[3] = r.logoScore;
        data[4] = r.photoScore;
        data[5] = r.headerScore;
        data[6] = r.idNumberScore;
        data[7] = r.brightnessScore;
        LOGI("Layout validation FRONT: %s score=%.3f", r.valid ? "PASS" : "FAIL", r.score);
    } else {
        // BACK
        validation::BackLayoutResult r = g_cinValidator->validateBack(g_lastWarpedImage);
        data[0] = r.valid ? 1.f : 0.f;
        data[1] = r.score;
        data[2] = r.fingerprintScore;
        data[3] = r.barcodeScore;
        data[4] = r.stampScore;
        data[5] = r.textScore;
        data[6] = r.brightnessScore;
        data[7] = 0.f;  // unused for BACK
        LOGI("Layout validation BACK: %s score=%.3f", r.valid ? "PASS" : "FAIL", r.score);
    }

    env->SetFloatArrayRegion(jresult, 0, LAYOUT_RESULT_LEN, data);
    return jresult;
}

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 4: Presence Validation (Anti-Spoof / Liveness)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Push the current raw gray frame, warped image, and quad corners
 * into the presence validator's ring buffer.
 * Call this once per detection cycle when layout is valid and side is locked.
 */
JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativePushPresenceFrame(JNIEnv*, jclass) {
    // BYPASS: Liveness disabled — do nothing
    if (!ENABLE_LIVENESS) {
        LOGI(">>> nativePushPresenceFrame BYPASSED (liveness disabled)");
        return;
    }

    LOGI(">>> nativePushPresenceFrame CALLED  warp=%d quad=%d rawGray=%s",
         g_hasWarpedImage ? 1 : 0,
         g_hasQuadCorners ? 1 : 0,
         g_lastRawGray.empty() ? "EMPTY" : "OK");

    if (!g_presenceValidator) {
        g_presenceValidator = std::make_unique<validation::LivePresenceValidator>();
        LOGI("LivePresenceValidator initialized");
    }

    if (!g_hasWarpedImage || !g_hasQuadCorners) {
        LOGE("nativePushPresenceFrame: SKIPPED — no warped image or quad corners");
        return;
    }

    g_presenceValidator->pushFrame(g_lastRawGray, g_lastWarpedImage, g_lastQuadCorners);
    LOGI(">>> nativePushPresenceFrame DONE");
}

/**
 * Evaluate liveness from buffered frames.
 *
 * Return format (float[12]):
 *   [0] live             (1.0 / 0.0)
 *   [1] totalScore       (0..1)
 *   [2] homographyScore  (0..1)
 *   [3] highlightScore   (0..1)
 *   [4] approachScore    (0..1)
 *   [5] spoofDetected    (1.0 / 0.0)
 *   [6] screenFFT        (1.0 / 0.0)
 *   [7] subpixelGrid     (1.0 / 0.0)
 *   [8] paperPrint       (1.0 / 0.0)
 *   [9] temporalStable   (1.0 / 0.0)  — T8 corrected: low diff = screen
 *  [10] textureWeak      (1.0 / 0.0)  — T10: low spatial std = screen
 *  [11] fftStationary    (1.0 / 0.0)  — T11: identical FFT = screen
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeEvaluatePresence(JNIEnv* env, jclass) {
    static constexpr int PRESENCE_RESULT_LEN = 12;
    jfloatArray jresult = env->NewFloatArray(PRESENCE_RESULT_LEN);
    float data[PRESENCE_RESULT_LEN] = {};

    // BYPASS: Liveness disabled — return fake LIVE result
    if (!ENABLE_LIVENESS) {
        LOGI(">>> nativeEvaluatePresence BYPASSED (liveness disabled) — returning LIVE=true");
        data[0]  = 1.f;  // live = true
        data[1]  = 1.f;  // totalScore = 1.0 (perfect)
        data[2]  = 1.f;  // homographyScore = 1.0
        data[3]  = 1.f;  // highlightScore = 1.0
        data[4]  = 1.f;  // approachScore = 1.0
        data[5]  = 0.f;  // spoofDetected = false
        data[6]  = 0.f;  // screenFFT = false
        data[7]  = 0.f;  // subpixelGrid = false
        data[8]  = 0.f;  // paperPrint = false
        data[9]  = 0.f;  // temporalStable = false
        data[10] = 0.f;  // textureWeak = false
        data[11] = 0.f;  // fftStationary = false

        env->SetFloatArrayRegion(jresult, 0, PRESENCE_RESULT_LEN, data);
        return jresult;
    }

    if (!g_presenceValidator) {
        g_presenceValidator = std::make_unique<validation::LivePresenceValidator>();
        LOGI("LivePresenceValidator initialized (on evaluate)");
    }

    validation::PresenceResult r = g_presenceValidator->evaluate();
    LOGI(">>> nativeEvaluatePresence: bufferSize=%d live=%d total=%.3f spoof=%d fft=%d subpx=%d paper=%d stable=%d texture=%d fftStat=%d votes=%d",
         r.frameCount, r.live ? 1 : 0, r.totalScore,
         r.spoofDetected ? 1 : 0, r.screenFFT ? 1 : 0,
         r.subpixelGrid ? 1 : 0, r.paperPrint ? 1 : 0,
         r.temporalStable ? 1 : 0, r.textureWeak ? 1 : 0,
         r.fftStationary ? 1 : 0, r.dbgVotes);

    data[0]  = r.live ? 1.f : 0.f;
    data[1]  = r.totalScore;
    data[2]  = r.homographyScore;
    data[3]  = r.highlightScore;
    data[4]  = r.approachScore;
    data[5]  = r.spoofDetected   ? 1.f : 0.f;
    data[6]  = r.screenFFT       ? 1.f : 0.f;
    data[7]  = r.subpixelGrid    ? 1.f : 0.f;
    data[8]  = r.paperPrint      ? 1.f : 0.f;
    data[9]  = r.temporalStable  ? 1.f : 0.f;
    data[10] = r.textureWeak     ? 1.f : 0.f;
    data[11] = r.fftStationary   ? 1.f : 0.f;

    env->SetFloatArrayRegion(jresult, 0, PRESENCE_RESULT_LEN, data);
    return jresult;
}

/**
 * Reset the presence validator's ring buffer.
 * Call on side switch, detection loss, or after capture.
 */
JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeResetPresence(JNIEnv*, jclass) {
    // BYPASS: Liveness disabled — do nothing
    if (!ENABLE_LIVENESS) {
        LOGI(">>> nativeResetPresence BYPASSED (liveness disabled)");
        return;
    }

    LOGI(">>> nativeResetPresence CALLED");
    if (!g_presenceValidator) {
        g_presenceValidator = std::make_unique<validation::LivePresenceValidator>();
    }
    g_presenceValidator->reset();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-CAPTURE: State Machine Methods (Recto → Verso Flow)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get the current capture state.
 * Returns: 0 = WAIT_FRONT, 1 = WAIT_BACK, 2 = FINISHED
 */
JNIEXPORT jint JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeGetCaptureState(JNIEnv*, jclass) {
    return static_cast<jint>(g_captureState);
}

/**
 * Reset the capture sequence to start fresh.
 * Clears both captured images and resets to WAIT_FRONT state.
 * Also resets detector to FRONT mode.
 */
JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeResetCaptureSequence(JNIEnv*, jclass) {
    LOGI(">>> nativeResetCaptureSequence: Resetting to WAIT_FRONT");

    g_captureState = CaptureState::WAIT_FRONT;
    g_capturedFrontImage.release();
    g_capturedBackImage.release();
    g_hasCapturedFront = false;
    g_hasCapturedBack = false;

    // Reset detector to FRONT mode (requires red flag)
    if (g_detector) {
        CardDetection::DetectionConfig cfg = g_detector->getConfig();
        cfg.redValidationEnabled = true;
        g_detector->setConfig(cfg);

        // Reset temporal state for clean start
        g_detector->resetTemporalState();

        LOGI("Detector reset to FRONT mode (red validation ENABLED)");
    }
}

/**
 * Attempt to auto-capture based on current state and detected side.
 *
 * @param detectedSide  0 = FRONT, 1 = BACK, 2 = UNKNOWN (from classifier)
 * @param layoutValid   1 = layout passed validation, 0 = failed
 *
 * Returns (float[4]):
 *   [0] captured       (1.0 if capture occurred, 0.0 if not)
 *   [1] newState       (0 = WAIT_FRONT, 1 = WAIT_BACK, 2 = FINISHED)
 *   [2] frontReady     (1.0 if front image available)
 *   [3] backReady      (1.0 if back image available)
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeAutoCapture(
        JNIEnv* env, jclass,
        jint detectedSide,
        jint layoutValid) {

    static constexpr int AUTOCAP_RESULT_LEN = 4;
    jfloatArray jresult = env->NewFloatArray(AUTOCAP_RESULT_LEN);
    float data[AUTOCAP_RESULT_LEN] = {};

    bool captured = false;

    // Only proceed if layout is valid
    if (layoutValid == 1 && g_hasWarpedImage && !g_lastWarpedImage.empty()) {

        // STATE: WAIT_FRONT — expect FRONT side (detectedSide == 0)
        if (g_captureState == CaptureState::WAIT_FRONT && detectedSide == 0) {
            // Capture front
            g_capturedFrontImage = g_lastWarpedImage.clone();
            g_hasCapturedFront = true;
            captured = true;

            LOGI(">>> AUTO-CAPTURE: FRONT captured! Transitioning to WAIT_BACK");

            // Transition to WAIT_BACK
            g_captureState = CaptureState::WAIT_BACK;

            // Switch detector to BACK mode (no red flag required)
            if (g_detector) {
                CardDetection::DetectionConfig cfg = g_detector->getConfig();
                cfg.redValidationEnabled = false;
                g_detector->setConfig(cfg);

                // Reset temporal state for fresh BACK detection
                g_detector->resetTemporalState();

                LOGI("Detector switched to BACK mode (red validation DISABLED)");
            }

            // Clear current detection state to force re-detection of back side
            g_hasWarpedImage = false;
            g_hasQuadCorners = false;
        }
        // STATE: WAIT_BACK — expect BACK side (detectedSide == 1)
        else if (g_captureState == CaptureState::WAIT_BACK && detectedSide == 1) {
            // Capture back
            g_capturedBackImage = g_lastWarpedImage.clone();
            g_hasCapturedBack = true;
            captured = true;

            LOGI(">>> AUTO-CAPTURE: BACK captured! Transitioning to FINISHED");

            // Transition to FINISHED
            g_captureState = CaptureState::FINISHED;
        }
    }

    data[0] = captured ? 1.f : 0.f;
    data[1] = static_cast<float>(static_cast<int>(g_captureState));
    data[2] = g_hasCapturedFront ? 1.f : 0.f;
    data[3] = g_hasCapturedBack ? 1.f : 0.f;

    env->SetFloatArrayRegion(jresult, 0, AUTOCAP_RESULT_LEN, data);
    return jresult;
}

/**
 * Get the captured FRONT (recto) image as RGBA byte array.
 * Returns nullptr if not captured yet.
 */
JNIEXPORT jbyteArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeGetCapturedFront(JNIEnv* env, jclass) {
    if (!g_hasCapturedFront || g_capturedFrontImage.empty()) {
        LOGI("nativeGetCapturedFront: No front image captured yet");
        return nullptr;
    }

    cv::Mat grayImage = g_capturedFrontImage.isContinuous() ?
                        g_capturedFrontImage : g_capturedFrontImage.clone();

    int width = grayImage.cols;
    int height = grayImage.rows;
    int size = width * height * 4;

    std::vector<uint8_t> rgbaData(size);
    const uint8_t* grayPtr = grayImage.data;

    for (int i = 0; i < width * height; i++) {
        uint8_t gray = grayPtr[i];
        rgbaData[i * 4 + 0] = gray;  // R
        rgbaData[i * 4 + 1] = gray;  // G
        rgbaData[i * 4 + 2] = gray;  // B
        rgbaData[i * 4 + 3] = 255;   // A
    }

    jbyteArray result = env->NewByteArray(size);
    env->SetByteArrayRegion(result, 0, size, reinterpret_cast<jbyte*>(rgbaData.data()));

    LOGI("Returning captured FRONT image: %dx%d", width, height);
    return result;
}

/**
 * Get the captured BACK (verso) image as RGBA byte array.
 * Returns nullptr if not captured yet.
 */
JNIEXPORT jbyteArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeGetCapturedBack(JNIEnv* env, jclass) {
    if (!g_hasCapturedBack || g_capturedBackImage.empty()) {
        LOGI("nativeGetCapturedBack: No back image captured yet");
        return nullptr;
    }

    cv::Mat grayImage = g_capturedBackImage.isContinuous() ?
                        g_capturedBackImage : g_capturedBackImage.clone();

    int width = grayImage.cols;
    int height = grayImage.rows;
    int size = width * height * 4;

    std::vector<uint8_t> rgbaData(size);
    const uint8_t* grayPtr = grayImage.data;

    for (int i = 0; i < width * height; i++) {
        uint8_t gray = grayPtr[i];
        rgbaData[i * 4 + 0] = gray;  // R
        rgbaData[i * 4 + 1] = gray;  // G
        rgbaData[i * 4 + 2] = gray;  // B
        rgbaData[i * 4 + 3] = 255;   // A
    }

    jbyteArray result = env->NewByteArray(size);
    env->SetByteArrayRegion(result, 0, size, reinterpret_cast<jbyte*>(rgbaData.data()));

    LOGI("Returning captured BACK image: %dx%d", width, height);
    return result;
}

} // extern "C"
