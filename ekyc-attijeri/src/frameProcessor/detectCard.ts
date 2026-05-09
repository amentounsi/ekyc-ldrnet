/**
 * detectCard — FastAPI stub
 * The real detection now happens server-side via FastAPI + LDRNet.
 * This file is kept as a no-op to avoid breaking any import that references it.
 * It is no longer called in the frame processor.
 */

import type { CardDetectionResult } from '../types/cardDetection';

export function detectCard(_frame: any): CardDetectionResult {
  'worklet';
  // No-op: detection is now handled by FastAPI in useCardDetection.ts
  return {
    isValid: false,
    corners: [],
    error: 'Use FastAPI detection instead',
  };
}

export default detectCard;
