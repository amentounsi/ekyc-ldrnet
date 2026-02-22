/**
 * CardDetector.cpp
 * Implementation of Tunisian ID Card (CIN) detection using OpenCV
 * 
 * Algorithm:
 * 1. Preprocess: Grayscale -> Gaussian Blur -> Canny Edge Detection
 * 2. Find contours and approximate to polygons
 * 3. Filter quadrilaterals by area, aspect ratio, convexity
 * 4. Sort corners and return result
 */

#include "CardDetector.h"
#include <algorithm>
#include <cmath>
#include <android/log.h>

#define LOG_TAG "CardDetector"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

namespace CardDetection {

CardDetector::CardDetector() : config_(DetectionConfig()) {}

CardDetector::CardDetector(const DetectionConfig& config) : config_(config) {}

CardDetector::~CardDetector() = default;

void CardDetector::setConfig(const DetectionConfig& config) {
    config_ = config;
}

DetectionConfig CardDetector::getConfig() const {
    return config_;
}

CardDetectionResult CardDetector::detectCard(const cv::Mat& frame) {
    CardDetectionResult result;
    
    if (frame.empty()) {
        LOGD("detectCard: frame is empty");
        return result;
    }
    
    const int imageWidth = frame.cols;
    const int imageHeight = frame.rows;
    const double imageArea = static_cast<double>(imageWidth * imageHeight);
    
    LOGD("detectCard: frame %dx%d, area=%.0f", imageWidth, imageHeight, imageArea);
    
    // Step 1: Preprocess the frame
    preprocessFrame(frame, edgesFrame_);
    
    // Step 2: Find quadrilateral contours
    std::vector<std::vector<cv::Point>> quads = findQuadrilaterals(edgesFrame_, imageArea);
    
    LOGD("detectCard: found %zu quadrilaterals", quads.size());
    
    if (quads.empty()) {
        return result;
    }
    
    // Step 3: Find the best valid quadrilateral
    double bestArea = 0;
    std::vector<cv::Point> bestQuad;
    int validCount = 0;
    
    for (const auto& quad : quads) {
        if (validateQuadrilateral(quad, imageArea, imageWidth, imageHeight)) {
            validCount++;
            double area = cv::contourArea(quad);
            if (area > bestArea) {
                bestArea = area;
                bestQuad = quad;
            }
        }
    }
    
    LOGD("detectCard: %d valid quads, bestArea=%.0f (%.2f%%)", validCount, bestArea, bestArea / imageArea * 100.0);
    
    if (bestQuad.empty()) {
        return result;
    }
    
    // Step 4: Sort corners and create result
    result.isValid = true;
    result.corners = sortCorners(bestQuad);
    result.confidence = static_cast<float>(bestArea / imageArea);
    
    LOGI("detectCard: DETECTED confidence=%.2f", result.confidence);
    
    return result;
}

void CardDetector::preprocessFrame(const cv::Mat& frame, cv::Mat& edges) {
    // Convert to grayscale
    if (frame.channels() == 4) {
        cv::cvtColor(frame, grayFrame_, cv::COLOR_BGRA2GRAY);
    } else if (frame.channels() == 3) {
        cv::cvtColor(frame, grayFrame_, cv::COLOR_BGR2GRAY);
    } else {
        grayFrame_ = frame.clone();
    }
    
    // Apply CLAHE for better contrast on card edges
    cv::Ptr<cv::CLAHE> clahe = cv::createCLAHE(2.0, cv::Size(8, 8));
    cv::Mat enhanced;
    clahe->apply(grayFrame_, enhanced);
    
    // Gaussian blur to reduce noise
    cv::GaussianBlur(enhanced, blurredFrame_, cv::Size(5, 5), 0);
    
    // Calculate adaptive Canny thresholds based on image statistics
    cv::Scalar mean, stddev;
    cv::meanStdDev(blurredFrame_, mean, stddev);
    double sigma = stddev[0];
    int lower = static_cast<int>(std::max(0.0, mean[0] - sigma));
    int upper = static_cast<int>(std::min(255.0, mean[0] + sigma));
    
    // Apply Canny edge detection
    cv::Canny(blurredFrame_, edges, lower, upper);
    
    // Morphological closing to connect broken edges
    cv::Mat kernel = cv::getStructuringElement(cv::MORPH_RECT, cv::Size(3, 3));
    cv::morphologyEx(edges, edges, cv::MORPH_CLOSE, kernel);
    
    // Dilate to connect nearby edges
    cv::dilate(edges, edges, kernel, cv::Point(-1, -1), 2);
}

std::vector<std::vector<cv::Point>> CardDetector::findQuadrilaterals(
    const cv::Mat& edges, 
    double imageArea
) {
    std::vector<std::vector<cv::Point>> quadrilaterals;
    std::vector<std::vector<cv::Point>> contours;
    
    // Find external contours
    cv::findContours(
        edges.clone(),
        contours, 
        cv::RETR_EXTERNAL, 
        cv::CHAIN_APPROX_SIMPLE
    );
    
    LOGD("findQuadrilaterals: found %zu total contours", contours.size());
    
    if (contours.empty()) {
        return quadrilaterals;
    }
    
    // Sort contours by area (descending)
    std::sort(contours.begin(), contours.end(), [](const auto& a, const auto& b) {
        return cv::contourArea(a) > cv::contourArea(b);
    });
    
    int skippedSmall = 0, skippedArea = 0, skippedShape = 0;
    
    // Process top 15 largest contours
    size_t maxToProcess = std::min(contours.size(), size_t(15));
    
    for (size_t i = 0; i < maxToProcess; i++) {
        const auto& contour = contours[i];
        double area = cv::contourArea(contour);
        double areaRatio = area / imageArea;
        
        if (i == 0) {
            LOGD("findQuadrilaterals: largest contour area=%.0f (%.2f%% of frame)", area, areaRatio * 100);
        }
        
        // Skip small contours
        if (area < config_.minContourArea) {
            skippedSmall++;
            continue;
        }
        
        // Skip contours outside area range
        if (areaRatio < config_.minAreaRatio || areaRatio > config_.maxAreaRatio) {
            skippedArea++;
            continue;
        }
        
        // Strategy 1: Try polygon approximation with various epsilons
        std::vector<cv::Point> bestApprox;
        double bestScore = -1;
        
        for (double epsFactor = 0.01; epsFactor <= 0.08; epsFactor += 0.005) {
            std::vector<cv::Point> approx;
            double epsilon = epsFactor * cv::arcLength(contour, true);
            cv::approxPolyDP(contour, approx, epsilon, true);
            
            if (approx.size() == 4 && cv::isContourConvex(approx)) {
                double approxArea = cv::contourArea(approx);
                if (approxArea > bestScore) {
                    bestScore = approxArea;
                    bestApprox = approx;
                }
            }
        }
        
        // Strategy 2: Use convex hull
        if (bestApprox.empty()) {
            std::vector<cv::Point> hull;
            cv::convexHull(contour, hull);
            
            for (double epsFactor = 0.015; epsFactor <= 0.06; epsFactor += 0.005) {
                std::vector<cv::Point> approx;
                double epsilon = epsFactor * cv::arcLength(hull, true);
                cv::approxPolyDP(hull, approx, epsilon, true);
                
                if (approx.size() == 4 && cv::isContourConvex(approx)) {
                    double approxArea = cv::contourArea(approx);
                    if (approxArea > bestScore) {
                        bestScore = approxArea;
                        bestApprox = approx;
                    }
                }
            }
        }
        
        // Strategy 3: Use minAreaRect as fallback for large contours
        if (bestApprox.empty() && areaRatio > 0.02) {
            cv::RotatedRect rect = cv::minAreaRect(contour);
            cv::Point2f corners[4];
            rect.points(corners);
            
            bestApprox.clear();
            for (int j = 0; j < 4; j++) {
                bestApprox.push_back(cv::Point(static_cast<int>(corners[j].x), 
                                               static_cast<int>(corners[j].y)));
            }
            bestScore = rect.size.width * rect.size.height;
            LOGD("findQuadrilaterals: using minAreaRect for contour %zu, area=%.0f", i, bestScore);
        }
        
        if (!bestApprox.empty()) {
            quadrilaterals.push_back(bestApprox);
            LOGD("findQuadrilaterals: found quad with area=%.0f (%.2f%% of frame)", 
                 bestScore, (bestScore / imageArea) * 100);
        } else {
            skippedShape++;
        }
    }
    
    LOGD("findQuadrilaterals: skipped small=%d, area=%d, shape=%d; kept %zu quads",
         skippedSmall, skippedArea, skippedShape, quadrilaterals.size());
    
    return quadrilaterals;
}

bool CardDetector::validateQuadrilateral(
    const std::vector<cv::Point>& quad,
    double imageArea,
    int imageWidth,
    int imageHeight
) {
    if (quad.size() != 4) {
        return false;
    }
    
    // Check convexity
    if (!isConvex(quad)) {
        LOGD("validateQuad: rejected - not convex");
        return false;
    }
    
    // Check if points are within image bounds
    if (!pointsWithinBounds(quad, imageWidth, imageHeight)) {
        LOGD("validateQuad: rejected - out of bounds");
        return false;
    }
    
    // Check area constraints
    double area = cv::contourArea(quad);
    double areaRatio = area / imageArea;
    
    if (areaRatio < config_.minAreaRatio || areaRatio > config_.maxAreaRatio) {
        LOGD("validateQuad: rejected - areaRatio=%.3f (min=%.3f, max=%.3f)",
             areaRatio, config_.minAreaRatio, config_.maxAreaRatio);
        return false;
    }
    
    // Check aspect ratio (accept both landscape and portrait orientations)
    float aspectRatio = calculateAspectRatio(quad);
    if (aspectRatio <= 0.0f || config_.targetAspectRatio <= 0.0f) {
        return false;
    }

    const float target = config_.targetAspectRatio;
    const float targetRotated = 1.0f / target;
    const float relErrorLandscape = std::abs(aspectRatio - target) / target;
    const float relErrorPortrait = std::abs(aspectRatio - targetRotated) / targetRotated;

    if (std::min(relErrorLandscape, relErrorPortrait) > config_.aspectRatioTolerance) {
        LOGD("validateQuad: rejected - aspectRatio=%.3f (target=%.3f, tol=%.3f, errL=%.3f, errP=%.3f)",
             aspectRatio, target, config_.aspectRatioTolerance, relErrorLandscape, relErrorPortrait);
        return false;
    }
    
    return true;
}

bool CardDetector::isConvex(const std::vector<cv::Point>& quad) {
    return cv::isContourConvex(quad);
}

bool CardDetector::pointsWithinBounds(
    const std::vector<cv::Point>& quad,
    int width,
    int height
) {
    for (const auto& point : quad) {
        if (point.x < 0 || point.x >= width || 
            point.y < 0 || point.y >= height) {
            return false;
        }
    }
    return true;
}

float CardDetector::calculateAspectRatio(const std::vector<cv::Point>& quad) {
    // Sort points to get consistent ordering
    std::vector<cv::Point> sorted = quad;
    
    // Calculate centroid
    cv::Point centroid(0, 0);
    for (const auto& p : sorted) {
        centroid.x += p.x;
        centroid.y += p.y;
    }
    centroid.x /= 4;
    centroid.y /= 4;
    
    // Separate into top and bottom points
    std::vector<cv::Point> top, bottom;
    for (const auto& p : sorted) {
        if (p.y < centroid.y) {
            top.push_back(p);
        } else {
            bottom.push_back(p);
        }
    }
    
    // Ensure we have 2 top and 2 bottom points
    if (top.size() != 2 || bottom.size() != 2) {
        // Fallback to bounding rect ratio
        cv::Rect boundingRect = cv::boundingRect(quad);
        return static_cast<float>(boundingRect.width) / static_cast<float>(boundingRect.height);
    }
    
    // Sort top points by x (left to right)
    if (top[0].x > top[1].x) std::swap(top[0], top[1]);
    // Sort bottom points by x (left to right)
    if (bottom[0].x > bottom[1].x) std::swap(bottom[0], bottom[1]);
    
    // Calculate average width (top edge + bottom edge) / 2
    float topWidth = distance(top[0], top[1]);
    float bottomWidth = distance(bottom[0], bottom[1]);
    float avgWidth = (topWidth + bottomWidth) / 2.0f;
    
    // Calculate average height (left edge + right edge) / 2
    float leftHeight = distance(top[0], bottom[0]);
    float rightHeight = distance(top[1], bottom[1]);
    float avgHeight = (leftHeight + rightHeight) / 2.0f;
    
    if (avgHeight == 0) {
        return 0;
    }
    
    return avgWidth / avgHeight;
}

std::array<Point2D, 4> CardDetector::sortCorners(const std::vector<cv::Point>& quad) {
    std::array<Point2D, 4> corners;
    
    if (quad.size() != 4) {
        return corners;
    }
    
    // Calculate centroid
    float centroidX = 0, centroidY = 0;
    for (const auto& p : quad) {
        centroidX += p.x;
        centroidY += p.y;
    }
    centroidX /= 4;
    centroidY /= 4;
    
    // Classify points relative to centroid
    std::vector<cv::Point> topLeft, topRight, bottomRight, bottomLeft;
    
    for (const auto& p : quad) {
        if (p.x < centroidX && p.y < centroidY) {
            topLeft.push_back(p);
        } else if (p.x >= centroidX && p.y < centroidY) {
            topRight.push_back(p);
        } else if (p.x >= centroidX && p.y >= centroidY) {
            bottomRight.push_back(p);
        } else {
            bottomLeft.push_back(p);
        }
    }
    
    // Alternative sorting using sum and difference
    std::vector<std::pair<int, int>> sumDiff; // (sum, diff) for each point
    for (int i = 0; i < 4; i++) {
        sumDiff.push_back({quad[i].x + quad[i].y, quad[i].x - quad[i].y});
    }
    
    // Find indices for each corner
    int topLeftIdx = 0, topRightIdx = 0, bottomRightIdx = 0, bottomLeftIdx = 0;
    int minSum = INT_MAX, maxSum = INT_MIN;
    int minDiff = INT_MAX, maxDiff = INT_MIN;
    
    for (int i = 0; i < 4; i++) {
        int sum = sumDiff[i].first;
        int diff = sumDiff[i].second;
        
        if (sum < minSum) {
            minSum = sum;
            topLeftIdx = i;
        }
        if (sum > maxSum) {
            maxSum = sum;
            bottomRightIdx = i;
        }
        if (diff < minDiff) {
            minDiff = diff;
            bottomLeftIdx = i;
        }
        if (diff > maxDiff) {
            maxDiff = diff;
            topRightIdx = i;
        }
    }
    
    // Assign corners in order: top-left, top-right, bottom-right, bottom-left
    corners[0] = Point2D(static_cast<float>(quad[topLeftIdx].x), 
                         static_cast<float>(quad[topLeftIdx].y));
    corners[1] = Point2D(static_cast<float>(quad[topRightIdx].x), 
                         static_cast<float>(quad[topRightIdx].y));
    corners[2] = Point2D(static_cast<float>(quad[bottomRightIdx].x), 
                         static_cast<float>(quad[bottomRightIdx].y));
    corners[3] = Point2D(static_cast<float>(quad[bottomLeftIdx].x), 
                         static_cast<float>(quad[bottomLeftIdx].y));
    
    return corners;
}

float CardDetector::distance(const cv::Point& p1, const cv::Point& p2) {
    float dx = static_cast<float>(p2.x - p1.x);
    float dy = static_cast<float>(p2.y - p1.y);
    return std::sqrt(dx * dx + dy * dy);
}

} // namespace CardDetection
