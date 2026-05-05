/**
 * useCardDetection Hook
 * Custom React hook for real-time card detection with VisionCamera
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { detectCard } from '../frameProcessor/detectCard';
import cardDetectorModule from '../native/CardDetectorModule';
import type {
  CardDetectionResult,
  CardDetectionConfig,
  Point2D,
} from '../types/cardDetection';

/**
 * Hook options
 */
interface UseCardDetectionOptions {
  /** Enable/disable detection */
  enabled?: boolean;
  
  /** Detection configuration */
  config?: Partial<CardDetectionConfig>;
  
  /** Callback when card is detected */
  onCardDetected?: (result: CardDetectionResult) => void;
  
  /** Throttle detection updates (ms) */
  throttleMs?: number;
  
  /** Overlay-guided detection bounds (normalized 0-1) */
  overlayBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  
  /** Enable overlay-guided detection */
  useOverlay?: boolean;
  
  /** Use ROI cropping when overlay is enabled */
  useROICropping?: boolean;
}

/**
 * Hook return type
 */
interface UseCardDetectionReturn {
  /** Current detection result */
  detectionResult: CardDetectionResult | null;
  
  /** Whether detector is ready */
  isReady: boolean;
  
  /** Frame processor for VisionCamera */
  frameProcessor: ReturnType<typeof useFrameProcessor>;
  
  /** Scaled corners for overlay (relative to screen) */
  scaledCorners: Point2D[];
  
  /** Reset detection state */
  reset: () => void;
  
  /** Update configuration */
  updateConfig: (config: Partial<CardDetectionConfig>) => Promise<void>;
}

/**
 * Custom hook for card detection
 */
export function useCardDetection(
  options: UseCardDetectionOptions = {}
): UseCardDetectionReturn {
  const {
    enabled = true,
    config,
    onCardDetected,
    throttleMs = 100,
    overlayBounds = null,
    useOverlay = false,
    useROICropping = true,
  } = options;

  // State
  const [detectionResult, setDetectionResult] = useState<CardDetectionResult | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [scaledCorners, setScaledCorners] = useState<Point2D[]>([]);

  // Refs
  const lastUpdateRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const lastValidResultRef = useRef<CardDetectionResult | null>(null);
  const lastValidTimeRef = useRef<number>(0);
  const holdTimeMs = 500; // Keep showing overlay for 500ms after losing detection

  /**
   * Initialize detector on mount
   */
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        await cardDetectorModule.initialize();
        await cardDetectorModule.setConfig(config ?? {});
        
        if (mountedRef.current) {
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize card detector:', error);
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      cardDetectorModule.release().catch(console.error);
    };
  }, []);

  /**
   * Update config when it changes
   */
  useEffect(() => {
    if (isReady) {
      cardDetectorModule.setConfig(config ?? {}).catch(console.error);
    }
  }, [config, isReady]);

  /**
   * Update overlay bounds when they change
   */
  useEffect(() => {
    if (isReady) {
      cardDetectorModule
        .setOverlay(useOverlay, overlayBounds, useROICropping)
        .catch(console.error);
    }
  }, [isReady, useOverlay, overlayBounds, useROICropping]);

  /**
   * Handle detection result from worklet
   * Uses "sticky" detection - keeps overlay visible for holdTimeMs after losing detection
   */
  const handleDetectionResult = useCallback(
    (result: CardDetectionResult) => {
      if (!mountedRef.current) return;

      // Throttle updates
      const now = Date.now();
      if (now - lastUpdateRef.current < throttleMs) {
        return;
      }
      lastUpdateRef.current = now;

      // If current result is valid, update immediately
      if (result.isValid && result.corners.length === 4) {
        lastValidResultRef.current = result;
        lastValidTimeRef.current = now;
        setDetectionResult(result);
        setScaledCorners(result.corners as Point2D[]);
        onCardDetected?.(result);
      } else {
        // Not valid - but check if we should still show the last valid result (sticky)
        const timeSinceLastValid = now - lastValidTimeRef.current;
        if (lastValidResultRef.current && timeSinceLastValid < holdTimeMs) {
          // Keep showing the last valid result
          setDetectionResult(lastValidResultRef.current);
          setScaledCorners(lastValidResultRef.current.corners as Point2D[]);
        } else {
          // Clear the overlay
          lastValidResultRef.current = null;
          setDetectionResult(result);
          setScaledCorners([]);
        }
      }
    },
    [onCardDetected, throttleMs]
  );

  const handleDetectionResultOnJS = Worklets.createRunOnJS(handleDetectionResult);

  /**
   * Frame processor for VisionCamera
   */
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      
      if (!enabled) {
        return;
      }

      // Detect card in frame
      const result = detectCard(frame);

      // Send to JS thread
      handleDetectionResultOnJS(result);
    },
    [enabled, handleDetectionResultOnJS]
  );

  /**
   * Reset detection state
   */
  const reset = useCallback(() => {
    setDetectionResult(null);
    setScaledCorners([]);
  }, []);

  /**
   * Update configuration
   */
  const updateConfig = useCallback(
    async (newConfig: Partial<CardDetectionConfig>) => {
      if (isReady) {
        await cardDetectorModule.setConfig(newConfig);
      }
    },
    [isReady]
  );

  return {
    detectionResult,
    isReady,
    frameProcessor,
    scaledCorners,
    reset,
    updateConfig,
  };
}

export default useCardDetection;
