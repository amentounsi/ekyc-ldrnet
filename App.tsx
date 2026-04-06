/**
 * App.tsx
 * Main entry point for the React Native CIN Scanner app
 * Attijari Bank branded production-ready scanner
 */

import React, { useState, useCallback, useRef } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View } from 'react-native';
import CameraScreen from './src/screens/CameraScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ResultScreen from './src/screens/ResultScreen';
import { WarpTestScreen } from './src/screens/WarpTestScreen';
import { validateScan, ValidationResult } from './src/services/validationService';
import { Colors } from './src/constants/theme';
import type { CardDetectionResult } from './src/types/cardDetection';
import type { CINBarcodeData } from './src/types/barcode';

/**
 * Application screens
 */
type AppScreen = 'onboarding' | 'camera' | 'result' | 'warpTest';

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
 * Main App component
 */
const App: React.FC = () => {
  // Navigation state
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('onboarding');
  
  // Scan result data
  const [scanResult, setScanResult] = useState<ScanResult>({
    frontImage: null,
    backImage: null,
    facePhoto: null,
    barcodeData: null,
  });
  
  // Validation result
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  
  // Rescan mode (which side to rescan)
  const [rescanMode, setRescanMode] = useState<'front' | 'back' | null>(null);
  
  // Reference to reset camera
  const cameraResetRef = useRef<(() => void) | null>(null);

  /**
   * Handle starting scan from onboarding
   */
  const handleStartScanning = useCallback(() => {
    // Reset scan data
    setScanResult({
      frontImage: null,
      backImage: null,
      facePhoto: null,
      barcodeData: null,
    });
    setRescanMode(null);
    setCurrentScreen('camera');
  }, []);

  /**
   * Handle card detection callback (for debugging)
   */
  const handleCardDetected = useCallback((result: CardDetectionResult) => {
    // Debug logging only in dev mode
    if (__DEV__) {
      console.log('[App] Card detected:', {
        isValid: result.isValid,
        confidence: result.confidence,
      });
    }
  }, []);

  /**
   * Handle scan completion from CameraScreen
   */
  const handleScanComplete = useCallback((
    frontImage: { base64: string; width: number; height: number },
    backImage: { base64: string; width: number; height: number },
    facePhoto: { base64: string; width: number; height: number } | null,
    barcodeData: CINBarcodeData | null
  ) => {
    // Store scan results
    const newScanResult: ScanResult = {
      frontImage,
      backImage,
      facePhoto,
      barcodeData,
    };
    setScanResult(newScanResult);
    
    // Validate the scan
    const validationResult = validateScan(newScanResult);
    setValidation(validationResult);
    
    // Navigate to result screen
    setCurrentScreen('result');
  }, []);

  /**
   * Handle confirm from result screen
   */
  const handleConfirm = useCallback(() => {
    // In a real app, this would send data to backend
    console.log('[App] Scan confirmed:', scanResult);
    
    // For now, go back to onboarding
    setCurrentScreen('onboarding');
    setScanResult({
      frontImage: null,
      backImage: null,
      facePhoto: null,
      barcodeData: null,
    });
  }, [scanResult]);

  /**
   * Handle rescan request from result screen
   */
  const handleRescan = useCallback((side: 'front' | 'back' | 'both') => {
    if (side === 'both') {
      // Full rescan
      setScanResult({
        frontImage: null,
        backImage: null,
        facePhoto: null,
        barcodeData: null,
      });
      setRescanMode(null);
    } else {
      // Partial rescan - keep the valid side
      setRescanMode(side);
    }
    setCurrentScreen('camera');
  }, []);

  /**
   * Open warp test (debug)
   */
  const openWarpTest = useCallback(() => {
    setCurrentScreen('warpTest');
  }, []);

  /**
   * Go back from warp test
   */
  const goBackFromWarpTest = useCallback(() => {
    setCurrentScreen('camera');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={Colors.background} 
        translucent 
      />
      
      {/* Onboarding Screen */}
      {currentScreen === 'onboarding' && (
        <OnboardingScreen onStartScanning={handleStartScanning} />
      )}
      
      {/* Camera Screen - keep mounted when needed */}
      <View style={[
        styles.screenContainer, 
        currentScreen !== 'camera' && styles.hidden
      ]}>
        <CameraScreen
          cameraPosition="back"
          enableTorch={false}
          onCardDetected={handleCardDetected}
          showDebugInfo={__DEV__}
          onOpenWarpTest={openWarpTest}
          isVisible={currentScreen === 'camera'}
          onCaptureComplete={(frontImage, backImage) => {
            // This will be called from CameraScreen
            // We need to also get facePhoto and barcodeData
          }}
        />
      </View>
      
      {/* Result Screen */}
      {currentScreen === 'result' && validation && (
        <ResultScreen
          frontImage={scanResult.frontImage}
          backImage={scanResult.backImage}
          facePhoto={scanResult.facePhoto}
          barcodeData={scanResult.barcodeData}
          validation={validation}
          onConfirm={handleConfirm}
          onRescan={handleRescan}
        />
      )}
      
      {/* Warp Test Screen (debug) */}
      {currentScreen === 'warpTest' && (
        <View style={styles.screenContainer}>
          <WarpTestScreen onBack={goBackFromWarpTest} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
});

export default App;
