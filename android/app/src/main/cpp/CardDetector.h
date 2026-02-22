/**
 * CardDetector.h
 * Header file for Tunisian ID Card (CIN) detection using OpenCV
 * 
 * This module provides real-time detection of ID cards in camera frames
 * using edge detection and contour analysis.
 */

#ifndef CARD_DETECTOR_H
#define CARD_DETECTOR_H

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>
#include <array>

namespace CardDetection {

/**
 * Represents a 2D point with x and y coordinates
 */
struct Point2D {
    float x;
    float y;
    
    Point2D() : x(0), y(0) {}
    Point2D(float x, float y) : x(x), y(y) {}
};

/**
 * Result structure for card detection
 * Contains validation status and corner points
 */
struct CardDetectionResult {
    bool isValid;
    std::array<Point2D, 4> corners; // top-left, top-right, bottom-right, bottom-left
    float confidence;
    
    CardDetectionResult() : isValid(false), confidence(0.0f) {
        corners.fill(Point2D());
    }
};

/**
 * Configuration parameters for card detection
 */
struct DetectionConfig {
    // Canny edge detection thresholds (used in multi-strategy detection)
    int cannyLowThreshold = 50;
    int cannyHighThreshold = 150;
    
    // Gaussian blur kernel size
    int blurKernelSize = 5;
    
    // Area constraints (percentage of image area)
    float minAreaRatio = 0.01f;   // 1% of frame - allow smaller cards
    float maxAreaRatio = 0.90f;   // 90% of frame
    
    // ID-1 card aspect ratio (85.6mm x 53.98mm)
    float targetAspectRatio = 1.586f;
    float aspectRatioTolerance = 0.45f; // ±45% tolerance
    
    // Contour approximation epsilon factor
    float approxEpsilonFactor = 0.04f;
    
    // Minimum contour area in pixels
    int minContourArea = 3000;
};

/**
 * Main CardDetector class
 * Handles all detection logic using OpenCV
 */
class CardDetector {
public:
    CardDetector();
    explicit CardDetector(const DetectionConfig& config);
    ~CardDetector();
    
    /**
     * Detect card in a given frame
     * @param frame Input BGR or BGRA image
     * @return CardDetectionResult with validation status and corners
     */
    CardDetectionResult detectCard(const cv::Mat& frame);
    
    /**
     * Update detection configuration
     * @param config New configuration parameters
     */
    void setConfig(const DetectionConfig& config);
    
    /**
     * Get current configuration
     * @return Current DetectionConfig
     */
    DetectionConfig getConfig() const;

private:
    DetectionConfig config_;
    
    // Reusable matrices to avoid allocation per frame
    cv::Mat grayFrame_;
    cv::Mat blurredFrame_;
    cv::Mat edgesFrame_;
    
    /**
     * Preprocess frame: convert to grayscale, blur, and edge detection
     * @param frame Input frame
     * @param edges Output edge image
     */
    void preprocessFrame(const cv::Mat& frame, cv::Mat& edges);
    
    /**
     * Find quadrilateral contours in edge image
     * @param edges Edge image
     * @param imageArea Total image area
     * @return Vector of potential quadrilateral contours
     */
    std::vector<std::vector<cv::Point>> findQuadrilaterals(
        const cv::Mat& edges, 
        double imageArea
    );
    
    /**
     * Validate a quadrilateral against geometric constraints
     * @param quad Quadrilateral vertices
     * @param imageArea Total image area
     * @param imageWidth Image width
     * @param imageHeight Image height
     * @return true if valid card-like quadrilateral
     */
    bool validateQuadrilateral(
        const std::vector<cv::Point>& quad,
        double imageArea,
        int imageWidth,
        int imageHeight
    );
    
    /**
     * Check if quadrilateral is convex
     * @param quad Quadrilateral vertices
     * @return true if convex
     */
    bool isConvex(const std::vector<cv::Point>& quad);
    
    /**
     * Check if all points are within image bounds
     * @param quad Quadrilateral vertices
     * @param width Image width
     * @param height Image height
     * @return true if all points within bounds
     */
    bool pointsWithinBounds(
        const std::vector<cv::Point>& quad,
        int width,
        int height
    );
    
    /**
     * Calculate aspect ratio of quadrilateral
     * @param quad Quadrilateral vertices (sorted)
     * @return Aspect ratio (width/height)
     */
    float calculateAspectRatio(const std::vector<cv::Point>& quad);
    
    /**
     * Sort corners in order: top-left, top-right, bottom-right, bottom-left
     * @param quad Input quadrilateral vertices
     * @return Sorted array of corners
     */
    std::array<Point2D, 4> sortCorners(const std::vector<cv::Point>& quad);
    
    /**
     * Calculate Euclidean distance between two points
     * @param p1 First point
     * @param p2 Second point
     * @return Distance
     */
    float distance(const cv::Point& p1, const cv::Point& p2);
};

} // namespace CardDetection

#endif // CARD_DETECTOR_H
