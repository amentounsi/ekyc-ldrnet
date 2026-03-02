/**
 * Native Module Bridge for Card Detector
 * Provides TypeScript interface to native CardDetectorModule
 */

import { NativeModules, Platform } from 'react-native';
import type { CardDetectionConfig, CardDetectorConstants } from '../types/cardDetection';

const LINKING_ERROR =
  `The package 'CardDetectorModule' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

/**
 * Native CardDetector module interface
 */
interface CardDetectorNativeModule {
  initialize(): Promise<boolean>;
  release(): Promise<boolean>;
  setConfig(
    cannyLow: number,
    cannyHigh: number,
    blurSize: number,
    minArea: number,
    maxArea: number,
    targetRatio: number,
    ratioTolerance: number
  ): Promise<boolean>;
  setOverlay(
    enabled: boolean,
    x: number,
    y: number,
    width: number,
    height: number,
    useROICropping: boolean
  ): Promise<boolean>;
  setScanMode(mode: string): Promise<boolean>;
  isInitialized(): Promise<boolean>;
  getConstants(): CardDetectorConstants;
}

/**
 * Get native module with error handling
 */
const CardDetectorNative: CardDetectorNativeModule = NativeModules.CardDetectorModule
  ? NativeModules.CardDetectorModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

/**
 * CardDetectorModule class
 * Wrapper for native module with TypeScript support
 */
class CardDetectorModule {
  private _isInitialized: boolean = false;

  /**
   * Initialize the card detector
   * Must be called before using detection
   */
  async initialize(): Promise<boolean> {
    if (this._isInitialized) {
      return true;
    }

    try {
      const result = await CardDetectorNative.initialize();
      this._isInitialized = result;
      return result;
    } catch (error) {
      console.error('Failed to initialize CardDetector:', error);
      throw error;
    }
  }

  /**
   * Release native resources
   */
  async release(): Promise<boolean> {
    if (!this._isInitialized) {
      return true;
    }

    try {
      const result = await CardDetectorNative.release();
      this._isInitialized = false;
      return result;
    } catch (error) {
      console.error('Failed to release CardDetector:', error);
      throw error;
    }
  }

  /**
   * Update detection configuration
   */
  async setConfig(config: Partial<CardDetectionConfig>): Promise<boolean> {
    const defaults = {
      cannyLowThreshold: 50,
      cannyHighThreshold: 150,
      blurKernelSize: 5,
      minAreaRatio: 0.015,
      maxAreaRatio: 0.85,
      targetAspectRatio: 1.586,
      aspectRatioTolerance: 0.28,
    };

    const mergedConfig = { ...defaults, ...config };

    try {
      return await CardDetectorNative.setConfig(
        mergedConfig.cannyLowThreshold,
        mergedConfig.cannyHighThreshold,
        mergedConfig.blurKernelSize,
        mergedConfig.minAreaRatio,
        mergedConfig.maxAreaRatio,
        mergedConfig.targetAspectRatio,
        mergedConfig.aspectRatioTolerance
      );
    } catch (error) {
      console.error('Failed to set CardDetector config:', error);
      throw error;
    }
  }

  /**
   * Set overlay-guided detection bounds
   * @param enabled - Enable overlay-guided detection
   * @param bounds - Normalized overlay bounds (0-1)
   * @param useROICropping - Crop frame to ROI before detection
   */
  async setOverlay(
    enabled: boolean,
    bounds: { x: number; y: number; width: number; height: number } | null = null,
    useROICropping: boolean = true
  ): Promise<boolean> {
    const x = enabled && bounds ? bounds.x : 0;
    const y = enabled && bounds ? bounds.y : 0;
    const width = enabled && bounds ? bounds.width : 0;
    const height = enabled && bounds ? bounds.height : 0;

    try {
      return await CardDetectorNative.setOverlay(
        enabled,
        x,
        y,
        width,
        height,
        useROICropping
      );
    } catch (error) {
      console.error('Failed to set CardDetector overlay:', error);
      throw error;
    }
  }

  /**
   * Set scan mode for card detection
   * @param mode - 'FRONT' (requires red flag) or 'BACK' (no red flag needed)
   */
  async setScanMode(mode: 'FRONT' | 'BACK'): Promise<boolean> {
    try {
      return await CardDetectorNative.setScanMode(mode);
    } catch (error) {
      console.error('Failed to set scan mode:', error);
      throw error;
    }
  }

  /**
   * Check if detector is initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      return await CardDetectorNative.isInitialized();
    } catch {
      return false;
    }
  }

  /**
   * Get module constants
   */
  getConstants(): CardDetectorConstants {
    return CardDetectorNative.getConstants?.() ?? {
      ID1_ASPECT_RATIO: 1.586,
      DEFAULT_MIN_AREA: 0.005,
      DEFAULT_MAX_AREA: 0.95,
      DEFAULT_RATIO_TOLERANCE: 0.50,
    };
  }
}

// Export singleton instance
export const cardDetectorModule = new CardDetectorModule();
export default cardDetectorModule;
