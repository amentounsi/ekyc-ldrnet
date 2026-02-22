/**
 * CardDetectorJNI.cpp
 * JNI Bridge for Card Detection module
 * 
 * This file provides the JNI interface between Java/Kotlin and C++ CardDetector
 */

#include <jni.h>
#include <android/log.h>
#include <android/bitmap.h>
#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include "CardDetector.h"
#include <string>
#include <memory>

#define LOG_TAG "CardDetectorJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Global CardDetector instance for reuse across frames
static std::unique_ptr<CardDetection::CardDetector> g_detector = nullptr;

extern "C" {

/**
 * Initialize the CardDetector
 */
JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeInit(
    JNIEnv* env,
    jclass clazz
) {
    if (g_detector == nullptr) {
        g_detector = std::make_unique<CardDetection::CardDetector>();
        LOGI("CardDetector initialized");
    }
}

/**
 * Release the CardDetector
 */
JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeRelease(
    JNIEnv* env,
    jclass clazz
) {
    g_detector.reset();
    LOGI("CardDetector released");
}

/**
 * Update detection configuration
 */
JNIEXPORT void JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeSetConfig(
    JNIEnv* env,
    jclass clazz,
    jint cannyLow,
    jint cannyHigh,
    jint blurSize,
    jfloat minArea,
    jfloat maxArea,
    jfloat targetRatio,
    jfloat ratioTolerance
) {
    if (g_detector == nullptr) {
        LOGE("CardDetector not initialized");
        return;
    }
    
    CardDetection::DetectionConfig config;
    config.cannyLowThreshold = cannyLow;
    config.cannyHighThreshold = cannyHigh;
    config.blurKernelSize = blurSize;
    config.minAreaRatio = minArea;
    config.maxAreaRatio = maxArea;
    config.targetAspectRatio = targetRatio;
    config.aspectRatioTolerance = ratioTolerance;
    
    g_detector->setConfig(config);
    LOGI("CardDetector config updated");
}

/**
 * Detect card from YUV frame data (from VisionCamera)
 * 
 * @param yBuffer Y plane data
 * @param uBuffer U plane data  
 * @param vBuffer V plane data
 * @param width Frame width
 * @param height Frame height
 * @param yRowStride Y plane row stride
 * @param uvRowStride UV plane row stride
 * @param uvPixelStride UV pixel stride
 * @return float array: [isValid, confidence, x0, y0, x1, y1, x2, y2, x3, y3]
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeDetectFromYUV(
    JNIEnv* env,
    jclass clazz,
    jobject yBuffer,
    jobject uBuffer,
    jobject vBuffer,
    jint width,
    jint height,
    jint yRowStride,
    jint uvRowStride,
    jint uvPixelStride
) {
    // Create result array
    jfloatArray result = env->NewFloatArray(10);
    float resultData[10] = {0};
    
    if (g_detector == nullptr) {
        LOGE("CardDetector not initialized");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Get buffer pointers
    uint8_t* yData = static_cast<uint8_t*>(env->GetDirectBufferAddress(yBuffer));
    
    if (yData == nullptr) {
        LOGE("Failed to get Y buffer address");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Create grayscale Mat directly from Y plane (more efficient)
    cv::Mat yMat(height, width, CV_8UC1);
    
    // Copy Y data considering row stride
    if (yRowStride == width) {
        // Contiguous data, direct copy
        memcpy(yMat.data, yData, width * height);
    } else {
        // Non-contiguous, copy row by row
        for (int row = 0; row < height; row++) {
            memcpy(yMat.ptr(row), yData + row * yRowStride, width);
        }
    }
    
    // Convert grayscale to BGR for consistent processing
    cv::Mat bgrMat;
    cv::cvtColor(yMat, bgrMat, cv::COLOR_GRAY2BGR);
    
    // Detect card
    CardDetection::CardDetectionResult detectionResult = g_detector->detectCard(bgrMat);
    
    // Fill result array
    resultData[0] = detectionResult.isValid ? 1.0f : 0.0f;
    resultData[1] = detectionResult.confidence;
    
    if (detectionResult.isValid) {
        resultData[2] = detectionResult.corners[0].x;
        resultData[3] = detectionResult.corners[0].y;
        resultData[4] = detectionResult.corners[1].x;
        resultData[5] = detectionResult.corners[1].y;
        resultData[6] = detectionResult.corners[2].x;
        resultData[7] = detectionResult.corners[2].y;
        resultData[8] = detectionResult.corners[3].x;
        resultData[9] = detectionResult.corners[3].y;
    }
    
    env->SetFloatArrayRegion(result, 0, 10, resultData);
    return result;
}

/**
 * Detect card from RGBA bitmap
 * 
 * @param bitmap Android Bitmap object
 * @return float array: [isValid, confidence, x0, y0, x1, y1, x2, y2, x3, y3]
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeDetectFromBitmap(
    JNIEnv* env,
    jclass clazz,
    jobject bitmap
) {
    // Create result array
    jfloatArray result = env->NewFloatArray(10);
    float resultData[10] = {0};
    
    if (g_detector == nullptr) {
        LOGE("CardDetector not initialized");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Get bitmap info
    AndroidBitmapInfo bitmapInfo;
    if (AndroidBitmap_getInfo(env, bitmap, &bitmapInfo) != ANDROID_BITMAP_RESULT_SUCCESS) {
        LOGE("Failed to get bitmap info");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Lock bitmap pixels
    void* pixels = nullptr;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) {
        LOGE("Failed to lock bitmap pixels");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Create cv::Mat from bitmap data
    cv::Mat rgbaMat(bitmapInfo.height, bitmapInfo.width, CV_8UC4, pixels);
    
    // Convert to BGR
    cv::Mat bgrMat;
    cv::cvtColor(rgbaMat, bgrMat, cv::COLOR_RGBA2BGR);
    
    // Detect card
    CardDetection::CardDetectionResult detectionResult = g_detector->detectCard(bgrMat);
    
    // Unlock bitmap
    AndroidBitmap_unlockPixels(env, bitmap);
    
    // Fill result array
    resultData[0] = detectionResult.isValid ? 1.0f : 0.0f;
    resultData[1] = detectionResult.confidence;
    
    if (detectionResult.isValid) {
        resultData[2] = detectionResult.corners[0].x;
        resultData[3] = detectionResult.corners[0].y;
        resultData[4] = detectionResult.corners[1].x;
        resultData[5] = detectionResult.corners[1].y;
        resultData[6] = detectionResult.corners[2].x;
        resultData[7] = detectionResult.corners[2].y;
        resultData[8] = detectionResult.corners[3].x;
        resultData[9] = detectionResult.corners[3].y;
    }
    
    env->SetFloatArrayRegion(result, 0, 10, resultData);
    return result;
}

/**
 * Process frame from byte array (grayscale)
 * Optimized for VisionCamera frame processor
 */
JNIEXPORT jfloatArray JNICALL
Java_com_pfeprojet_carddetector_CardDetectorJNI_nativeDetectFromGrayscale(
    JNIEnv* env,
    jclass clazz,
    jbyteArray data,
    jint width,
    jint height
) {
    // Create result array
    jfloatArray result = env->NewFloatArray(10);
    float resultData[10] = {0};
    
    if (g_detector == nullptr) {
        LOGE("CardDetector not initialized");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Get byte array data
    jbyte* byteData = env->GetByteArrayElements(data, nullptr);
    if (byteData == nullptr) {
        LOGE("Failed to get byte array elements");
        env->SetFloatArrayRegion(result, 0, 10, resultData);
        return result;
    }
    
    // Create grayscale Mat
    cv::Mat grayMat(height, width, CV_8UC1, reinterpret_cast<uint8_t*>(byteData));
    
    // Convert to BGR for consistent processing
    cv::Mat bgrMat;
    cv::cvtColor(grayMat, bgrMat, cv::COLOR_GRAY2BGR);
    
    // Detect card
    CardDetection::CardDetectionResult detectionResult = g_detector->detectCard(bgrMat);
    
    // Release byte array
    env->ReleaseByteArrayElements(data, byteData, JNI_ABORT);
    
    // Fill result array
    resultData[0] = detectionResult.isValid ? 1.0f : 0.0f;
    resultData[1] = detectionResult.confidence;
    
    if (detectionResult.isValid) {
        resultData[2] = detectionResult.corners[0].x;
        resultData[3] = detectionResult.corners[0].y;
        resultData[4] = detectionResult.corners[1].x;
        resultData[5] = detectionResult.corners[1].y;
        resultData[6] = detectionResult.corners[2].x;
        resultData[7] = detectionResult.corners[2].y;
        resultData[8] = detectionResult.corners[3].x;
        resultData[9] = detectionResult.corners[3].y;
    }
    
    env->SetFloatArrayRegion(result, 0, 10, resultData);
    return result;
}

} // extern "C"
