/**
 * Barcode types for Tunisian CIN scanning
 * Phase C: ZXing-based barcode scanning
 */

/**
 * Parsed barcode data from Tunisian CIN
 * Format: 18 characters total
 */
export interface CINBarcodeData {
  /** Raw 18-character barcode string */
  rawData: string;
  
  /** CIN Number (8 digits) - chars 1-8 */
  cinNumber: string;
  
  /** Left number printed beside barcode (2 digits) - chars 9-10 */
  leftNumber: string;
  
  /** Right number printed beside barcode (2 digits) - chars 11-12 */
  rightNumber: string;
  
  /** Release date in DDMMYY format - chars 13-18 */
  releaseDate: string;
  
  /** Release date formatted as DD/MM/YY */
  releaseDateFormatted: string;
  
  /** Whether the barcode data is valid (18 numeric chars) */
  isValid: boolean;
  
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Result of barcode scanning operation
 */
export interface BarcodeScanResult {
  /** Whether a barcode was found */
  found: boolean;
  
  /** Barcode format (PDF_417, CODE_128, etc.) */
  format?: string;
  
  /** Raw barcode content */
  rawValue?: string;
  
  /** Parsed CIN data (if valid format) */
  parsed?: CINBarcodeData;
  
  /** Error message if scan failed */
  error?: string;
}

/**
 * Native BarcodeScanner module interface
 */
export interface BarcodeScannerNativeModule {
  /** Scan barcode from base64 image */
  scanFromBase64(base64Image: string): Promise<BarcodeScanResult>;
}
