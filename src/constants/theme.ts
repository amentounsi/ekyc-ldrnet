/**
 * Attijari Bank Theme Constants
 * Production-ready design system for CIN Scanner
 */

/**
 * Color palette - Attijari Bank branding
 */
export const Colors = {
  // Primary brand colors
  primary: '#E30613',        // Attijari Red
  primaryDark: '#A0000F',    // Darker red for pressed states
  primaryLight: '#FF4444',   // Lighter red for highlights
  
  // Accent colors
  accent: '#F5A623',         // Attijari Orange/Gold
  accentDark: '#D4920E',     // Darker gold
  
  // Background colors
  background: '#121212',     // Dark background
  backgroundLight: '#1E1E1E', // Card background
  backgroundElevated: '#2A2A2A', // Elevated surfaces
  
  // Text colors
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  
  // Semantic colors
  success: '#00C853',        // Green - only for success states
  warning: '#FFAB00',        // Amber - for warnings
  error: '#FF3D00',          // Orange-red - for errors
  
  // Frame colors (based on confidence)
  frameDefault: '#E30613',   // Primary red
  frameWarning: '#FFAB00',   // Yellow when quality issues
  frameSuccess: '#00C853',   // Green when ready to capture
  
  // Overlay colors
  overlayDark: 'rgba(0, 0, 0, 0.85)',
  overlayMedium: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Border colors
  border: '#333333',
  borderLight: '#444444',
} as const;

/**
 * Typography scale
 */
export const Typography = {
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    xxxl: 28,
    display: 36,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

/**
 * Spacing scale (4px base unit)
 */
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/**
 * Border radius scale
 */
export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  round: 9999,
} as const;

/**
 * Shadow definitions
 */
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  glow: {
    shadowColor: '#E30613',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
} as const;

/**
 * Animation durations
 */
export const Animations = {
  fast: 200,
  normal: 300,
  slow: 500,
  flip: 800,
  pulse: 1500,
  scanLine: 2000,
} as const;

/**
 * Card frame dimensions - ID-1 standard (ISO/IEC 7810)
 */
export const CardDimensions = {
  aspectRatio: 1.586,  // Width / Height (85.6mm / 53.98mm)
  framePadding: 40,
  
  // Zone positions (normalized 0-1, relative to card)
  recto: {
    flagZone: { x: 0.05, y: 0.08, width: 0.18, height: 0.22 },
    emblemZone: { x: 0.77, y: 0.08, width: 0.18, height: 0.22 },
    photoZone: { x: 0.05, y: 0.32, width: 0.32, height: 0.58 },
  },
  verso: {
    fingerprintZone: { x: 0.62, y: 0.18, width: 0.28, height: 0.42 },
    barcodeZone: { x: 0.08, y: 0.78, width: 0.84, height: 0.18 },
  },
} as const;

/**
 * Detection thresholds
 */
export const DetectionThresholds = {
  confidenceLow: 0.5,
  confidenceMedium: 0.8,
  confidenceHigh: 0.85,
  blurThreshold: 0.5,
  lightingThreshold: 0.5,
  alignmentThreshold: 0.5,
  detectionTimeoutMs: 5000,
  stableFrameCount: 5,
} as const;

/**
 * App strings
 */
export const Strings = {
  onboarding: {
    title: 'Scan Your CIN Card',
    subtitle: 'Position your Tunisian national ID card for verification',
    requirement1: 'Use your real physical card',
    requirement2: 'Ensure good lighting',
    requirement3: 'Hold the card steady',
    warning: 'Only real Tunisian CIN cards are accepted',
    startButton: 'Start Scanning',
  },
  scanning: {
    stepFront: 'STEP 1 / 2',
    stepBack: 'STEP 2 / 2',
    placeFront: 'Position Front Side (Recto)',
    placeBack: 'Position Back Side (Verso)',
    frontCaptured: 'Front captured!',
    holdSteady: 'Hold steady...',
    capturing: 'Capturing...',
    tooBlurry: 'Too blurry — hold steady',
    lowLighting: 'Increase lighting',
    alignCard: 'Align card in frame',
    wrongSideFront: 'Wrong side — show FRONT',
    wrongSideBack: 'Wrong side — show BACK',
    flipCard: 'Flip to back side',
    perfect: 'Perfect — hold still',
  },
  timeout: {
    title: 'No Card Detected',
    message: 'Make sure you are using a real Tunisian CIN card',
    tip1: 'Hold card flat in the frame',
    tip2: 'Ensure good lighting',
  },
  result: {
    title: 'Scan Complete',
    subtitle: 'Your ID card has been successfully scanned',
    cinLabel: 'CIN Number',
    dateLabel: 'Issue Date',
    confirmButton: 'Confirm',
    rescanButton: 'Scan Again',
  },
  errors: {
    noBarcode: 'Barcode Not Detected',
    noFace: 'Photo Not Detected',
    rescanBack: 'Rescan Back Side',
    rescanFront: 'Rescan Front Side',
    barcodeMessage: 'The barcode on the back could not be scanned.',
    faceMessage: 'The photo on the front could not be detected.',
  },
} as const;

export const Theme = {
  colors: Colors,
  typography: Typography,
  spacing: Spacing,
  borderRadius: BorderRadius,
  shadows: Shadows,
  animations: Animations,
  card: CardDimensions,
  detection: DetectionThresholds,
  strings: Strings,
} as const;

export default Theme;
