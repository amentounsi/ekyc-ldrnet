/**
 * Validation Service
 * Validates CIN scan results before showing to user
 */

import type { CINBarcodeData } from '../types/barcode';

/**
 * Captured image data
 */
export interface CapturedImage {
  base64: string;
  width: number;
  height: number;
}

/**
 * Face photo data (extracted from front)
 */
export interface FacePhotoData {
  base64: string;
  width: number;
  height: number;
}

/**
 * Complete scan data passed to validation
 */
export interface ScanData {
  frontImage: CapturedImage | null;
  backImage: CapturedImage | null;
  facePhoto: FacePhotoData | null;
  barcodeData: CINBarcodeData | null;
}

/**
 * Validation result returned by validateScan
 */
export interface ValidationResult {
  /** Front image captured and valid */
  isFrontValid: boolean;
  
  /** Back image captured and valid */
  isBackValid: boolean;
  
  /** Face photo extracted successfully */
  isFaceValid: boolean;
  
  /** Barcode scanned and parsed successfully */
  isBarcodeValid: boolean;
  
  /** All required fields present */
  isComplete: boolean;
  
  /** Overall scan is valid and can be shown */
  isValid: boolean;
  
  /** Specific errors for each component */
  errors: {
    front?: string;
    back?: string;
    face?: string;
    barcode?: string;
  };
  
  /** What needs to be rescanned */
  rescanRequired: {
    front: boolean;
    back: boolean;
  };
}

/**
 * Validates a CIN barcode for correct format
 * @param barcode Raw barcode string
 * @returns Whether barcode is valid 18-digit format
 */
export function isValidBarcodeFormat(barcode: string): boolean {
  if (!barcode || barcode.length !== 18) {
    return false;
  }
  // Should be all numeric
  return /^\d{18}$/.test(barcode);
}

/**
 * Validates that an image exists and has valid dimensions
 * @param image Captured image to validate
 * @returns Whether image is valid
 */
export function isValidImage(image: CapturedImage | null): boolean {
  if (!image) return false;
  if (!image.base64 || image.base64.length === 0) return false;
  if (image.width <= 0 || image.height <= 0) return false;
  return true;
}

/**
 * Validates the complete scan data
 * @param data Scan data to validate
 * @returns Validation result with detailed status
 */
export function validateScan(data: ScanData): ValidationResult {
  const errors: ValidationResult['errors'] = {};
  
  // Validate front image
  const isFrontValid = isValidImage(data.frontImage);
  if (!isFrontValid) {
    errors.front = 'Front image not captured';
  }
  
  // Validate back image
  const isBackValid = isValidImage(data.backImage);
  if (!isBackValid) {
    errors.back = 'Back image not captured';
  }
  
  // Validate face photo
  const isFaceValid = isValidImage(data.facePhoto as CapturedImage | null);
  if (!isFaceValid) {
    errors.face = 'Face photo could not be extracted';
  }
  
  // Validate barcode
  const isBarcodeValid = data.barcodeData !== null && 
                          data.barcodeData.isValid === true &&
                          isValidBarcodeFormat(data.barcodeData.rawData);
  if (!isBarcodeValid) {
    errors.barcode = 'Barcode could not be scanned';
  }
  
  // Check completeness (both images captured)
  const isComplete = isFrontValid && isBackValid;
  
  // Overall validity (all components valid)
  // For now: require images + barcode. Face is optional but encouraged.
  const isValid = isFrontValid && isBackValid && isBarcodeValid;
  
  // Determine what needs rescan
  const rescanRequired = {
    front: !isFrontValid || !isFaceValid,
    back: !isBackValid || !isBarcodeValid,
  };
  
  return {
    isFrontValid,
    isBackValid,
    isFaceValid,
    isBarcodeValid,
    isComplete,
    isValid,
    errors,
    rescanRequired,
  };
}

/**
 * Masks a CIN number for display (shows last 3 digits only)
 * @param cinNumber Full 8-digit CIN number
 * @returns Masked string like "*****826"
 */
export function maskCINNumber(cinNumber: string): string {
  if (!cinNumber || cinNumber.length < 3) {
    return cinNumber;
  }
  const visible = cinNumber.slice(-3);
  const masked = '*'.repeat(cinNumber.length - 3);
  return masked + visible;
}

/**
 * Formats a date from DDMMYY to DD/MM/YYYY
 * @param dateStr Date in DDMMYY format
 * @returns Formatted date string
 */
export function formatReleaseDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 6) {
    return dateStr;
  }
  const day = dateStr.substring(0, 2);
  const month = dateStr.substring(2, 4);
  const year = dateStr.substring(4, 6);
  // Assume 20xx for years 00-50, 19xx for 51-99
  const fullYear = parseInt(year, 10) <= 50 ? `20${year}` : `19${year}`;
  return `${day}/${month}/${fullYear}`;
}

/**
 * Determines the primary error to show to user
 * @param result Validation result
 * @returns User-friendly error message and action
 */
export function getPrimaryError(result: ValidationResult): {
  message: string;
  action: 'rescan_front' | 'rescan_back' | 'rescan_both' | null;
} | null {
  if (result.isValid) {
    return null;
  }
  
  // Priority: barcode > face > images
  if (!result.isBarcodeValid && result.isFrontValid) {
    return {
      message: 'Barcode could not be scanned. Please rescan the back of your card.',
      action: 'rescan_back',
    };
  }
  
  if (!result.isFaceValid && result.isFrontValid) {
    return {
      message: 'Photo could not be detected. Please rescan the front of your card.',
      action: 'rescan_front',
    };
  }
  
  if (!result.isFrontValid && !result.isBackValid) {
    return {
      message: 'Both sides need to be scanned.',
      action: 'rescan_both',
    };
  }
  
  if (!result.isFrontValid) {
    return {
      message: 'Front side not captured properly.',
      action: 'rescan_front',
    };
  }
  
  if (!result.isBackValid) {
    return {
      message: 'Back side not captured properly.',
      action: 'rescan_back',
    };
  }
  
  return null;
}

export default {
  validateScan,
  isValidBarcodeFormat,
  isValidImage,
  maskCINNumber,
  formatReleaseDate,
  getPrimaryError,
};
