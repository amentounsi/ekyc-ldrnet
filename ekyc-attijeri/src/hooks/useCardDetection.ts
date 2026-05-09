/**
 * useCardDetection — FastAPI + LDRNet version
 *
 * Detection is done server-side via FastAPI /detect_and_warp.
 * The frame processor is a no-op (camera renders but no per-frame C++ detection).
 * triggerDetection() takes a photo, sends it to FastAPI, and returns the
 * perspective-corrected 1000×630 warped image as base64.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import cardDetectorModule from '../native/CardDetectorModule';
import type {
  CardDetectionResult,
  CardDetectionConfig,
  Point2D,
} from '../types/cardDetection';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const FASTAPI_URL = 'http://192.168.1.16:8000';
// ─────────────────────────────────────────────────────────────────────────────

interface UseCardDetectionOptions {
  enabled?: boolean;
  config?: Partial<CardDetectionConfig>;
  onCardDetected?: (result: CardDetectionResult) => void;
  throttleMs?: number;
  overlayBounds?: { x: number; y: number; width: number; height: number } | null;
  useOverlay?: boolean;
  useROICropping?: boolean;
}

interface UseCardDetectionReturn {
  detectionResult: CardDetectionResult | null;
  isReady: boolean;
  frameProcessor: ReturnType<typeof useFrameProcessor>;
  scaledCorners: Point2D[];
  reset: () => void;
  updateConfig: (config: Partial<CardDetectionConfig>) => Promise<void>;
  triggerDetection: (cameraRef: React.RefObject<any>) => Promise<CardDetectionResult | null>;
  isDetecting: boolean;
}

export function useCardDetection(
  options: UseCardDetectionOptions = {}
): UseCardDetectionReturn {
  const { enabled = true, config, onCardDetected } = options;

  const [detectionResult, setDetectionResult] = useState<CardDetectionResult | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [scaledCorners, setScaledCorners] = useState<Point2D[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    cardDetectorModule
      .initialize()
      .then(() => {
        if (mountedRef.current) setIsReady(true);
      })
      .catch((err) => {
        console.warn('[useCardDetection] Native init warning (non-fatal):', err);
        if (mountedRef.current) setIsReady(true);
      });

    return () => {
      mountedRef.current = false;
      cardDetectorModule.release().catch(() => {});
    };
  }, []);

  // No-op frame processor
  const noop = useCallback((_result: CardDetectionResult) => {}, []);
  const noopOnJS = Worklets.createRunOnJS(noop);

  const frameProcessor = useFrameProcessor(
    (_frame) => {
      'worklet';
    },
    [enabled, noopOnJS]
  );

  // ── FastAPI /detect_and_warp: takes photo, detects + warps server-side ────
  const triggerDetection = useCallback(
    async (cameraRef: React.RefObject<any>): Promise<CardDetectionResult | null> => {
      if (!cameraRef.current) {
        console.warn('[FastAPI] Camera ref not available');
        return null;
      }

      setIsDetecting(true);

      try {
        const photo = await cameraRef.current.takePhoto({
          qualityPrioritization: 'balanced',
          flash: 'off',
          enableShutterSound: false,
        });

        const formData = new FormData();
        formData.append('file', {
          uri: `file://${photo.path}`,
          type: 'image/jpeg',
          name: 'frame.jpg',
        } as any);

        let response: Response | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await fetch(`${FASTAPI_URL}/detect_and_warp`, {
              method: 'POST',
              body: formData,
              headers: { Accept: 'application/json' },
            });
            break;
          } catch (netErr) {
            if (attempt === 1) throw netErr;
            await new Promise(r => setTimeout(r, 800));
          }
        }

        if (!response!.ok) {
          throw new Error(`FastAPI error: ${response!.status} ${response!.statusText}`);
        }

        const data = await response!.json();
        const isValid = data.success === true;

        const result: CardDetectionResult = {
          isValid,
          corners: [],
          confidence: isValid ? 0.9 : 0.0,
          frameWidth: data.width ?? 1000,
          frameHeight: data.height ?? 630,
          debug: {
            edgeWhitePixels: 0,
            totalContours: 0,
            topNContours: 0,
            candidateQuads: 0,
            bestScore: isValid ? 0.9 : 0.0,
            rejectedByArea: 0,
            rejectedByApprox: 0,
            rejectedByAspect: 0,
            rejectedByEdgeDensity: 0,
            largestAreaRatio: 0,
            hasWarpedImage: isValid,
            isBlurry: false,
            blurScore: 100,
          },
        };

        if (mountedRef.current) {
          setDetectionResult(result);
          if (result.isValid) onCardDetected?.(result);
        }

        // Attach warped image and side classification
        if (isValid && data.base64) {
          (result as any)._warpedBase64    = data.base64;
          (result as any)._warpedWidth     = data.width  ?? 1000;
          (result as any)._warpedHeight    = data.height ?? 630;
          (result as any)._detectedSide    = data.side ?? 'unknown';
          (result as any)._sideConfidence  = data.side_confidence ?? 0.0;
          (result as any)._isCin           = data.is_cin !== false;
        }

        return result;
      } catch (error: any) {
        console.error('[FastAPI] Detection failed:', error);
        const errorResult: CardDetectionResult = {
          isValid: false,
          corners: [],
          error: error?.message ?? 'FastAPI detection failed',
        };
        if (mountedRef.current) {
          setDetectionResult(errorResult);
          setScaledCorners([]);
        }
        return errorResult;
      } finally {
        if (mountedRef.current) setIsDetecting(false);
      }
    },
    [onCardDetected]
  );

  const reset = useCallback(() => {
    setDetectionResult(null);
    setScaledCorners([]);
  }, []);

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
    triggerDetection,
    isDetecting,
  };
}

export default useCardDetection;
