/**
 * CINScreen — Orchestrates CIN card scanning + result review
 * Flow: intro → guide_front → scanning_front → guide_back → scanning_back → processing → result
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, StatusBar, BackHandler } from 'react-native';
import { CameraScreen as CINScanScreen } from './CINScanScreen';
import { ResultScreen as CINResultScreen } from './CINResultScreen';
import { CINIntroScreen } from './CINIntroScreen';
import { CINGuideFrontScreen } from './CINGuideFrontScreen';
import { CINGuideBackScreen } from './CINGuideBackScreen';
import { CINProcessingScreen } from './CINProcessingScreen';
import { ValidationResult } from '../services/validationService';
import type { CINBarcodeData } from '../types/barcode';

/**
 * Internal sub-screens
 */
type CINSubScreen =
  | 'intro'
  | 'guide_front'
  | 'scanning_front'
  | 'guide_back'
  | 'scanning_back'
  | 'processing'
  | 'result';

/**
 * Captured scan data
 */
interface ScanResult {
  frontImage: { base64: string; width: number; height: number } | null;
  backImage: { base64: string; width: number; height: number } | null;
  facePhoto: { base64: string; width: number; height: number } | null;
  barcodeData: CINBarcodeData | null;
}

/**
 * CINScreen Component
 */
export function CINScreen({ navigation }: any) {
  const [subScreen, setSubScreen] = useState<CINSubScreen>('intro');

  const [scanResult, setScanResult] = useState<ScanResult>({
    frontImage: null,
    backImage: null,
    facePhoto: null,
    barcodeData: null,
  });

  // Stores front image + face photo after scanning_front, before scanning_back
  const [capturedFrontData, setCapturedFrontData] = useState<{
    frontImage: { base64: string; width: number; height: number };
    facePhoto: { base64: string; width: number; height: number } | null;
  } | null>(null);

  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // ── Android BackHandler ────────────────────────────────────────────────────
  useEffect(() => {
    const backMap: Partial<Record<CINSubScreen, CINSubScreen | null>> = {
      guide_front:    'intro',
      scanning_front: 'guide_front',
      guide_back:     'guide_front',
      scanning_back:  'guide_back',
      processing:     null,   // blocked during processing
      result:         null,   // handled by onRescan
    };
    const backAction = () => {
      const prev = backMap[subScreen];
      if (prev !== undefined) {
        if (prev) setSubScreen(prev);
        return true;
      }
      return false; // intro → let React Navigation handle
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => handler.remove();
  }, [subScreen]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleIntroStart = useCallback(() => setSubScreen('guide_front'), []);

  const handleGuideFrontProceed = useCallback(() => setSubScreen('scanning_front'), []);

  const handleGuideBackProceed = useCallback(() => setSubScreen('scanning_back'), []);

  /** Called by scanning_front CINScanScreen when front side is captured */
  const handleFrontCaptured = useCallback((
    frontImage: { base64: string; width: number; height: number },
    facePhoto: { base64: string; width: number; height: number } | null,
  ) => {
    setCapturedFrontData({ frontImage, facePhoto });
    setSubScreen('guide_back');
  }, []);

  /** Called by scanning_back CINScanScreen when both sides + barcode are ready */
  const handleScanComplete = useCallback((
    frontImage: { base64: string; width: number; height: number },
    backImage:  { base64: string; width: number; height: number },
    facePhoto:  { base64: string; width: number; height: number } | null,
    barcodeData: CINBarcodeData | null,
  ) => {
    setScanResult({ frontImage, backImage, facePhoto, barcodeData });
    setSubScreen('processing');
  }, []);

  /** Called by CINProcessingScreen when validation is done */
  const handleProcessingComplete = useCallback((validationResult: ValidationResult, scannedBarcodeData: CINBarcodeData | null) => {
    // Store the barcode data returned from the processing screen's scan
    setScanResult(prev => ({ ...prev, barcodeData: scannedBarcodeData }));
    setValidation(validationResult);
    setSubScreen('result');
  }, []);

  const handleConfirm = useCallback(() => {
    navigation.navigate('Liveness', {
      cinData: {
        frontImage: scanResult.frontImage,
        backImage:  scanResult.backImage,
        facePhoto:  scanResult.facePhoto,
        barcodeData: scanResult.barcodeData,
      },
    });
  }, [navigation, scanResult]);

  const handleRescan = useCallback((_side: 'front' | 'back' | 'both') => {
    setScanResult({ frontImage: null, backImage: null, facePhoto: null, barcodeData: null });
    setCapturedFrontData(null);
    setValidation(null);
    setSubScreen('intro');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {subScreen === 'intro' && (
        <CINIntroScreen onStart={handleIntroStart} />
      )}

      {subScreen === 'guide_front' && (
        <CINGuideFrontScreen
          onProceed={handleGuideFrontProceed}
          onBack={() => setSubScreen('intro')}
        />
      )}

      {subScreen === 'scanning_front' && (
        <CINScanScreen
          key="front"
          cameraPosition="back"
          enableTorch={false}
          showDebugInfo={false}
          isVisible={true}
          expectedSideOverride="FRONT"
          onFrontCaptured={handleFrontCaptured}
        />
      )}

      {subScreen === 'guide_back' && (
        <CINGuideBackScreen
          onProceed={handleGuideBackProceed}
          onBack={() => setSubScreen('guide_front')}
        />
      )}

      {subScreen === 'scanning_back' && (
        <CINScanScreen
          key="back"
          cameraPosition="back"
          enableTorch={false}
          showDebugInfo={false}
          isVisible={true}
          expectedSideOverride="BACK"
          injectedFrontImage={capturedFrontData?.frontImage ?? null}
          onScanComplete={handleScanComplete}
        />
      )}

      {subScreen === 'processing' && (
        <CINProcessingScreen
          frontCaptured={true}
          backCaptured={true}
          frontImage={scanResult.frontImage}
          backImage={scanResult.backImage}
          barcodeData={scanResult.barcodeData}
          facePhoto={scanResult.facePhoto ?? capturedFrontData?.facePhoto ?? null}
          onComplete={handleProcessingComplete}
        />
      )}

      {subScreen === 'result' && validation && (
        <CINResultScreen
          frontImage={scanResult.frontImage}
          backImage={scanResult.backImage}
          facePhoto={scanResult.facePhoto ?? capturedFrontData?.facePhoto ?? null}
          barcodeData={scanResult.barcodeData}
          validation={validation}
          onConfirm={handleConfirm}
          onRescan={handleRescan}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

export default CINScreen;
