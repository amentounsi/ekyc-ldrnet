/**
 * BarcodeService - TypeScript wrapper for native ZXing barcode scanner
 * Phase C: Barcode scanning for Tunisian CIN
 */

import { NativeModules } from 'react-native';
import type { BarcodeScanResult, CINBarcodeData } from '../types/barcode';

const { BarcodeScanner } = NativeModules;

/**
 * Service for scanning barcodes from captured images
 */
export class BarcodeService {
  /**
   * Scan barcode from base64-encoded image
   * @param base64Image Base64 string (with or without data URI prefix)
   * @returns Scan result with parsed CIN data if found
   */
  static async scanFromBase64(base64Image: string): Promise<BarcodeScanResult> {
    try {
      if (!BarcodeScanner) {
        console.error('[BarcodeService] Native module not available');
        return {
          found: false,
          error: 'BarcodeScanner native module not available',
        };
      }

      const result = await BarcodeScanner.scanFromBase64(base64Image);
      console.log('[BarcodeService] Scan result:', result);
      return result;
    } catch (error: any) {
      console.error('[BarcodeService] Scan failed:', error);
      return {
        found: false,
        error: error?.message || 'Unknown error during barcode scan',
      };
    }
  }

  /**
   * Check if the native barcode scanner is available
   */
  static isAvailable(): boolean {
    return !!BarcodeScanner;
  }
}

export default BarcodeService;
