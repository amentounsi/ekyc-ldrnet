/**
 * Type definitions for Card Detection module
 * Tunisian ID Card (CIN) detection types
 */

/**
 * Represents a 2D point with x and y coordinates
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Result of card detection from a single frame
 */
export interface CardDetectionResult {
  /** Whether a valid card was detected */
  isValid: boolean;
  
  /** Detection confidence (0-1) */
  confidence?: number;
  
  /** 
   * Four corners of detected card in order:
   * [top-left, top-right, bottom-right, bottom-left]
   */
  corners: [Point2D, Point2D, Point2D, Point2D] | [];
  
  /** Frame width in pixels */
  frameWidth?: number;
  
  /** Frame height in pixels */
  frameHeight?: number;
  
  /** Frame orientation */
  orientation?: string;
  
  /** Error message if detection failed */
  error?: string;
}

/**
 * Configuration for card detection algorithm
 */
export interface CardDetectionConfig {
  /** Canny edge detection low threshold (default: 50) */
  cannyLowThreshold: number;
  
  /** Canny edge detection high threshold (default: 150) */
  cannyHighThreshold: number;
  
  /** Gaussian blur kernel size (default: 5) */
  blurKernelSize: number;
  
  /** Minimum area ratio 0-1 (default: 0.20) */
  minAreaRatio: number;
  
  /** Maximum area ratio 0-1 (default: 0.85) */
  maxAreaRatio: number;
  
  /** Target aspect ratio for ID-1 card (default: 1.586) */
  targetAspectRatio: number;
  
  /** Aspect ratio tolerance 0-1 (default: 0.10) */
  aspectRatioTolerance: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_DETECTION_CONFIG: CardDetectionConfig = {
  cannyLowThreshold: 50,
  cannyHighThreshold: 150,
  blurKernelSize: 5,
  minAreaRatio: 0.20,
  maxAreaRatio: 0.85,
  targetAspectRatio: 1.586, // ID-1 standard: 85.6mm / 53.98mm
  aspectRatioTolerance: 0.10,
};

/**
 * Overlay styles for different detection states
 */
export interface OverlayStyle {
  /** Stroke color for valid detection */
  validColor: string;
  
  /** Stroke color for invalid detection */
  invalidColor: string;
  
  /** Stroke width */
  strokeWidth: number;
  
  /** Fill color (with opacity) */
  fillColor: string;
  
  /** Corner radius for rounded corners */
  cornerRadius?: number;
}

/**
 * Default overlay styles
 */
export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  validColor: '#00FF00', // Green
  invalidColor: '#FF0000', // Red
  strokeWidth: 3,
  fillColor: 'rgba(0, 255, 0, 0.1)',
  cornerRadius: 8,
};

/**
 * Camera configuration for card scanning
 */
export interface CameraConfig {
  /** Camera device position */
  position: 'back' | 'front';
  
  /** Frame processor FPS (default: 30) */
  fps: number;
  
  /** Enable flash/torch */
  torch: 'on' | 'off';
  
  /** Photo quality preset */
  preset: 'high' | 'medium' | 'low';
}

/**
 * Default camera configuration
 */
export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  position: 'back',
  fps: 30,
  torch: 'off',
  preset: 'high',
};

/**
 * Module constants from native code
 */
export interface CardDetectorConstants {
  ID1_ASPECT_RATIO: number;
  DEFAULT_MIN_AREA: number;
  DEFAULT_MAX_AREA: number;
  DEFAULT_RATIO_TOLERANCE: number;
}
