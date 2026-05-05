/**
 * Type definitions for Card Detection module
 * Tunisian ID Card (CIN) detection types
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Debug info forwarded from native */
export interface DetectionDebugInfo {
  edgeWhitePixels: number;
  totalContours: number;
  topNContours: number;
  candidateQuads: number;
  bestScore: number;
  rejectedByArea: number;
  rejectedByApprox: number;
  rejectedByAspect: number;
  rejectedByEdgeDensity: number;
  largestAreaRatio: number;
  /** Warp info */
  hasWarpedImage?: boolean;
  warpedLuminance?: number;
  warpedGamma?: number;
  /** CIN confirmation (red corner validation passed) */
  isCINConfirmed?: boolean;
  /** Blur detection (Phase B.5) */
  blurScore?: number;  // Laplacian variance - higher = sharper
  isBlurry?: boolean;  // True if blurScore < threshold (100)
  /** Screen detection (Anti-Spoof) */
  screenConfidence?: number;  // 0.0 = real card, 1.0 = definitely screen
  isScreenDisplay?: boolean;  // True if screen detected
}

/** Result of card detection from a single frame */
export interface CardDetectionResult {
  isValid: boolean;
  confidence?: number;
  /** NEW: True if red corners validated (confirmed Tunisian CIN) */
  isCINConfirmed?: boolean;
  corners: [Point2D, Point2D, Point2D, Point2D] | [];
  frameWidth?: number;
  frameHeight?: number;
  orientation?: string;
  error?: string;
  debug?: DetectionDebugInfo;
}

/** Configuration for card detection algorithm (mirrors DetectionConfig in C++) */
export interface CardDetectionConfig {
  cannyLowThreshold: number;
  cannyHighThreshold: number;
  blurKernelSize: number;
  minAreaRatio: number;
  maxAreaRatio: number;
  targetAspectRatio: number;
  aspectRatioTolerance: number;
}

/** Default configuration – matches CardDetector.h */
export const DEFAULT_DETECTION_CONFIG: CardDetectionConfig = {
  cannyLowThreshold: 50,
  cannyHighThreshold: 150,
  blurKernelSize: 5,
  minAreaRatio: 0.02,
  maxAreaRatio: 0.85,
  targetAspectRatio: 1.586,
  aspectRatioTolerance: 0.35,
};

/** Constants exposed by Turbo module */
export interface CardDetectorConstants {
  ID1_ASPECT_RATIO: number;
  DEFAULT_MIN_AREA: number;
  DEFAULT_MAX_AREA: number;
  DEFAULT_RATIO_TOLERANCE: number;
}

/** Overlay styles */
export interface OverlayStyle {
  validColor: string;
  invalidColor: string;
  strokeWidth: number;
  fillColor: string;
  cornerRadius?: number;
}
