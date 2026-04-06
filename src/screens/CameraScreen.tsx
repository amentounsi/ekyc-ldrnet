/**
 * CameraScreen Component
 * Main camera screen with real-time CIN card detection
 * Attijari Bank branded production scanner
 *
 * AUTO-CAPTURE FLOW:
 * STEP 1 → Capture FRONT (recto)
 * STEP 2 → Automatically switch to BACK (verso)
 * STEP 3 → Capture BACK + Scan barcode
 * STEP 4 → Navigate to ResultScreen
 *
 * No manual input required. State machine driven.
 */

import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Dimensions,
  StatusBar,
  Platform,
  PermissionsAndroid,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  NativeModules,
  Modal,
  ScrollView,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  CameraPosition,
} from 'react-native-vision-camera';
import { useCardDetection } from '../hooks/useCardDetection';
import CardOverlay, { calculateOverlayBounds } from '../components/CardOverlay';
import CINScanFrame from '../components/CINScanFrame';
import TimeoutReminder from '../components/TimeoutReminder';
import CaptureTransition from '../components/CaptureTransition';
import { useDetectionTimeout } from '../hooks/useDetectionTimeout';
import { Colors, Typography, Spacing, BorderRadius, Strings, DetectionThresholds } from '../constants/theme';
import type { CardDetectionResult } from '../types/cardDetection';
import type { CINBarcodeData } from '../types/barcode';
import BarcodeService from '../native/BarcodeService';

/**
 * Screen dimensions
 */
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Auto-capture state type
 */
type AutoCaptureState = 'WAIT_FRONT' | 'WAIT_BACK' | 'FINISHED';

/**
 * Camera screen props
 */
interface CameraScreenProps {
  /** Camera position */
  cameraPosition?: CameraPosition;

  /** Enable torch */
  enableTorch?: boolean;

  /** Callback when card is detected */
  onCardDetected?: (result: CardDetectionResult) => void;

  /** Show debug info */
  showDebugInfo?: boolean;

  /** Callback to open WarpTestScreen (debug) */
  onOpenWarpTest?: () => void;

  /** Whether the screen is visible (controls camera activation) */
  isVisible?: boolean;

  /** Callback when both sides are captured */
  onCaptureComplete?: (frontImage: { base64: string; width: number; height: number }, backImage: { base64: string; width: number; height: number }) => void;
}

/**
 * CameraScreen component
 */
export const CameraScreen: React.FC<CameraScreenProps> = ({
  cameraPosition = 'back',
  enableTorch = false,
  onCardDetected,
  showDebugInfo = true,
  onOpenWarpTest,
  isVisible = true,
  onCaptureComplete,
}) => {
  // Camera permission
  const { hasPermission, requestPermission } = useCameraPermission();

  // Camera device
  const device = useCameraDevice(cameraPosition);

  // State
  const [isActive, setIsActive] = useState(true);
  const [viewDimensions, setViewDimensions] = useState({
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  });

  // Sync isActive with isVisible prop
  useEffect(() => {
    setIsActive(isVisible);
  }, [isVisible]);

  // Camera ref
  const cameraRef = useRef<Camera>(null);

  // State for overlay bounds and configuration
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayBounds, setOverlayBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTO-CAPTURE STATE MACHINE
  // ══════════════════════════════════════════════════════════════════════════════
  const [autoCaptureState, setAutoCaptureState] = useState<AutoCaptureState>('WAIT_FRONT');
  const [capturedFrontImage, setCapturedFrontImage] = useState<{
    base64: string;
    width: number;
    height: number;
  } | null>(null);
  const [capturedBackImage, setCapturedBackImage] = useState<{
    base64: string;
    width: number;
    height: number;
  } | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const autoCaptureInProgressRef = useRef(false);
  const [facePhoto, setFacePhoto] = useState<{
    base64: string;
    width: number;
    height: number;
  } | null>(null);

  // Side classification state (used for auto-capture logic)
  const [classifiedSide, setClassifiedSide] = useState<'FRONT' | 'BACK' | 'UNKNOWN' | null>(null);
  const [layoutValid, setLayoutValid] = useState(false);
  const classifyingRef = useRef(false);
  const validateLayoutRef = useRef(false);
  
  // Blur detection state (Phase B.5)
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  
  // Barcode scanning state (Phase C)
  const [barcodeData, setBarcodeData] = useState<CINBarcodeData | null>(null);
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // Transition animation state
  const [transitionType, setTransitionType] = useState<'capture' | 'flip' | 'complete' | 'processing' | null>(null);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [transitionSide, setTransitionSide] = useState<'FRONT' | 'BACK'>('FRONT');

  // Derived: current expected side based on auto-capture state
  const expectedSide = useMemo(() => {
    return autoCaptureState === 'WAIT_FRONT' ? 'FRONT' : 'BACK';
  }, [autoCaptureState]);

  // Derived: side matches expected
  const sideMatches = useMemo(() => {
    return classifiedSide === expectedSide;
  }, [classifiedSide, expectedSide]);

  const { CardDetectorModule } = NativeModules;

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTO-CAPTURE: Initialize and reset capture sequence
  // ══════════════════════════════════════════════════════════════════════════════

  // Initialize capture sequence on mount
  useEffect(() => {
    const initCaptureSequence = async () => {
      try {
        await CardDetectorModule.resetCaptureSequence();
        console.log('[AUTO-CAPTURE] Sequence initialized to WAIT_FRONT');
      } catch (error) {
        console.error('[AUTO-CAPTURE] Failed to initialize:', error);
      }
    };
    initCaptureSequence();
  }, [CardDetectorModule]);

  // Reset function for starting over
  const resetCaptureSequence = useCallback(async () => {
    try {
      await CardDetectorModule.resetCaptureSequence();
      setAutoCaptureState('WAIT_FRONT');
      setCapturedFrontImage(null);
      setCapturedBackImage(null);
      setFacePhoto(null);
      setShowCompletionModal(false);
      setClassifiedSide(null);
      setLayoutValid(false);
      setQualityWarning(null);
      // Reset barcode state (Phase C)
      setBarcodeData(null);
      setBarcodeScanning(false);
      setBarcodeError(null);
      console.log('[AUTO-CAPTURE] Sequence reset to WAIT_FRONT');
    } catch (error) {
      console.error('[AUTO-CAPTURE] Failed to reset:', error);
    }
  }, [CardDetectorModule]);

  // Card detection hook
  const {
    detectionResult,
    isReady,
    frameProcessor,
    scaledCorners,
  } = useCardDetection({
    enabled: isActive && hasPermission && autoCaptureState !== 'FINISHED',
    onCardDetected,
    throttleMs: 100,
    useOverlay: overlayEnabled,
    overlayBounds,
    useROICropping: false,
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // CONFIDENCE SCORING SYSTEM
  // Converts detection signals to 0-1 scores for UI feedback
  // ══════════════════════════════════════════════════════════════════════════════
  
  // Calculate confidence from detection signals
  const confidence = useMemo(() => {
    if (!detectionResult?.isValid) return 0;
    
    const debug = detectionResult.debug;
    if (!debug) return 0.5;
    
    // Blur score: Convert Laplacian variance to 0-1
    // Higher variance = sharper image
    // Typical blur scores: <25 = very blurry, 25-50 = acceptable, >50 = sharp
    const blurScore = debug.blurScore 
      ? Math.min(1, Math.max(0, (debug.blurScore - 10) / 60))
      : 0.5;
    
    // Lighting score: Use warped luminance if available
    // Target: 80-180 is good, below 60 or above 220 is poor
    const luminance = debug.warpedLuminance || 128;
    const lightingScore = luminance >= 60 && luminance <= 220
      ? Math.min(1, 1 - Math.abs(luminance - 140) / 140)
      : 0.3;
    
    // Alignment score: Use detection confidence or default
    const alignmentScore = detectionResult.confidence || 0.7;
    
    // Combined confidence (weighted average)
    // Blur: 40%, Lighting: 30%, Alignment: 30%
    const combined = 
      (blurScore * 0.4) + 
      (lightingScore * 0.3) + 
      (alignmentScore * 0.3);
    
    // Boost if layout is valid and side matches
    const layoutBonus = layoutValid && sideMatches ? 0.1 : 0;
    
    return Math.min(1, combined + layoutBonus);
  }, [detectionResult, layoutValid, sideMatches]);

  // Detection timeout hook
  const { showReminder, dismissReminder } = useDetectionTimeout({
    isDetecting: detectionResult?.isValid || false,
    enabled: autoCaptureState !== 'FINISHED',
    timeoutMs: DetectionThresholds.detectionTimeoutMs,
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTO-CAPTURE: Classification + Layout Validation + Auto-capture logic
  // ══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const hasWarp = detectionResult?.debug?.hasWarpedImage;
    const isValid = detectionResult?.isValid;
    const isBlurry = detectionResult?.debug?.isBlurry;
    const blurScore = detectionResult?.debug?.blurScore;
    const isScreenDisplay = detectionResult?.debug?.isScreenDisplay;
    const screenConfidence = detectionResult?.debug?.screenConfidence;

    // Reset classification when detection lost
    if (!hasWarp || !isValid || !isReady || autoCaptureState === 'FINISHED') {
      if (classifiedSide !== null) {
        setClassifiedSide(null);
        setLayoutValid(false);
      }
      // Clear blur warning when detection lost
      if (qualityWarning !== null) {
        setQualityWarning(null);
      }
      return;
    }
    
    // Check blur and show warning (but don't block classification)
    if (isBlurry) {
      setQualityWarning(Strings.scanning.tooBlurry);
    } else if (qualityWarning !== null) {
      setQualityWarning(null);
    }

    // Auto-classify (throttled, non-blocking)
    if (classifyingRef.current) return;
    classifyingRef.current = true;

    // Classify side
    CardDetectorModule.classifyCardSide()
      .then(async (result: any) => {
        if (result && result.side) {
          setClassifiedSide(result.side);

          // Only validate layout if side matches expected
          if (result.side === expectedSide) {
            // Validate layout
            const layoutResult = await CardDetectorModule.validateLayout(expectedSide);
            const isLayoutValid = layoutResult?.valid === true;
            setLayoutValid(isLayoutValid);

            // AUTO-CAPTURE: If side matches AND layout valid AND not blurry, trigger capture
            const currentIsBlurry = detectionResult?.debug?.isBlurry;
            
            if (isLayoutValid && !currentIsBlurry && !autoCaptureInProgressRef.current) {
              autoCaptureInProgressRef.current = true;
              // Clear warning on successful capture attempt
              setQualityWarning(null);

              try {
                const captureResult = await CardDetectorModule.autoCapture(
                  result.side,
                  true // layoutValid
                );

                console.log('[AUTO-CAPTURE] Result:', captureResult);

                if (captureResult?.captured) {
                  // Update state based on which side was captured
                  if (captureResult.state === 'WAIT_BACK') {
                    // Front was just captured
                    const frontImg = await CardDetectorModule.getCapturedFront();
                    if (frontImg) {
                      setCapturedFrontImage(frontImg);
                      console.log('[AUTO-CAPTURE] FRONT captured successfully!');
                      
                      // Show flip animation directly
                      setTransitionSide('FRONT');
                      setTransitionType('flip');
                      setTransitionVisible(true);
                      
                      // Extract face photo from front image (in background)
                      CardDetectorModule.extractFacePhoto()
                        .then((face: any) => {
                          if (face) {
                            setFacePhoto(face);
                            console.log('[FACE] Face photo extracted:', face.width, 'x', face.height);
                          }
                        })
                        .catch((faceErr: any) => {
                          console.warn('[FACE] Failed to extract face:', faceErr);
                        });
                    }
                    
                    // Quick transition to back scanning
                    setTimeout(() => {
                      setTransitionVisible(false);
                      setAutoCaptureState('WAIT_BACK');
                      setClassifiedSide(null);
                      setLayoutValid(false);
                    }, 1000);
                  } else if (captureResult.state === 'FINISHED') {
                    // Back was just captured
                    const backImg = await CardDetectorModule.getCapturedBack();
                    if (backImg) {
                      setCapturedBackImage(backImg);
                      console.log('[AUTO-CAPTURE] BACK captured successfully!');
                      
                      // Show processing immediately (skip capture animation for back)
                      setTransitionSide('BACK');
                      setTransitionType('processing');
                      setTransitionVisible(true);
                      
                      // Scan barcode from back image (Phase C)
                      setBarcodeScanning(true);
                      setBarcodeError(null);
                      try {
                        console.log('[BARCODE] Starting scan...');
                        const scanResult = await BarcodeService.scanFromBase64(backImg.base64);
                        console.log('[BARCODE] Scan result:', scanResult);
                        
                        if (scanResult.found && scanResult.parsed) {
                          setBarcodeData(scanResult.parsed);
                          console.log('[BARCODE] Parsed data:', scanResult.parsed);
                        } else {
                          setBarcodeError(scanResult.error || 'Barcode not found');
                          console.log('[BARCODE] Not found:', scanResult.error);
                        }
                      } catch (barcodeErr: any) {
                        console.error('[BARCODE] Scan error:', barcodeErr);
                        setBarcodeError(barcodeErr?.message || 'Barcode scan failed');
                      } finally {
                        setBarcodeScanning(false);
                      }
                      
                      // Show complete animation briefly then finish
                      setTransitionType('complete');
                      
                      setTimeout(() => {
                        setTransitionVisible(false);
                        setAutoCaptureState('FINISHED');
                        setShowCompletionModal(true);
                      }, 800);
                    }
                  }
                }
              } catch (err) {
                console.error('[AUTO-CAPTURE] Error:', err);
              } finally {
                autoCaptureInProgressRef.current = false;
              }
            } else if (isLayoutValid && currentIsBlurry) {
              // Layout valid but image is blurry - show warning
              console.log('[AUTO-CAPTURE] Waiting for sharp image (blur score:', blurScore, ')');
            }
          } else {
            setLayoutValid(false);
          }
        }
      })
      .catch((err: any) => {
        console.error('[AUTO-CAPTURE] Classify error:', err);
      })
      .finally(() => {
        setTimeout(() => {
          classifyingRef.current = false;
        }, 200); // Faster classification for better UX
      });
  }, [
    detectionResult?.debug?.hasWarpedImage,
    detectionResult?.debug?.isBlurry,
    detectionResult?.debug?.blurScore,
    detectionResult?.debug?.isScreenDisplay,
    detectionResult?.debug?.screenConfidence,
    detectionResult?.isValid,
    isReady,
    expectedSide,
    autoCaptureState,
    CardDetectorModule,
    onCaptureComplete,
    capturedFrontImage,
    qualityWarning,
  ]);

  // Calculate and set overlay bounds once we have frame dimensions
  useEffect(() => {
    if (detectionResult?.frameWidth && detectionResult?.frameHeight && !overlayEnabled) {
      const bounds = calculateOverlayBounds(
        detectionResult.frameWidth,
        detectionResult.frameHeight,
        viewDimensions.width,
        viewDimensions.height,
        1.586, // CIN aspect ratio
        40     // padding
      );
      setOverlayBounds(bounds);
      setOverlayEnabled(true);
      console.log('Overlay bounds calculated:', bounds);
    }
  }, [detectionResult?.frameWidth, detectionResult?.frameHeight, viewDimensions, overlayEnabled]);

  /**
   * Request camera permission on mount
   */
  useEffect(() => {
    const requestCameraPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Permission',
              message: 'This app needs access to your camera to scan ID cards.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert(
              'Permission Required',
              'Camera permission is required to scan ID cards.'
            );
          }
        } catch (err) {
          console.error('Error requesting camera permission:', err);
        }
      } else {
        await requestPermission();
      }
    };

    if (!hasPermission) {
      requestCameraPermission();
    }
  }, [hasPermission, requestPermission]);

  /**
   * Handle view layout to get dimensions
   */
  const onLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setViewDimensions({ width, height });
  }, []);

  /**
   * Render loading state
   */
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00FF00" />
          <Text style={styles.loadingText}>Requesting camera permission...</Text>
        </View>
      </View>
    );
  }

  /**
   * Render no device state
   */
  if (device == null) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No camera device found</Text>
        </View>
      </View>
    );
  }

  /**
   * Render camera not ready state
   */
  if (!isReady) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00FF00" />
          <Text style={styles.loadingText}>Initializing card detector...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      
      {/* Camera */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
        torch={enableTorch ? 'on' : 'off'}
        pixelFormat="yuv"
        orientation="portrait"
      />
      
      {/* CIN Scan Frame with confidence-based coloring */}
      <CINScanFrame
        side={expectedSide}
        confidence={confidence}
        isDetected={detectionResult?.isValid || false}
        qualityWarning={qualityWarning || undefined}
        viewWidth={viewDimensions.width}
        viewHeight={viewDimensions.height}
      />
      
      {/* Detection Overlay - Shows detected card corners when valid */}
      {detectionResult?.isValid && detectionResult.corners.length === 4 && (
        <CardOverlay
          corners={detectionResult.corners}
          frameWidth={detectionResult.frameWidth || viewDimensions.width}
          frameHeight={detectionResult.frameHeight || viewDimensions.height}
          viewWidth={viewDimensions.width}
          viewHeight={viewDimensions.height}
          isValid={detectionResult.isValid}
          showCornerMarkers={true}
          showEdgeLines={true}
        />
      )}
      
      {/* Timeout Reminder */}
      <TimeoutReminder 
        visible={showReminder} 
        onDismiss={dismissReminder}
      />

      {/* Capture Transition Animation */}
      {transitionType && (
        <CaptureTransition
          type={transitionType}
          visible={transitionVisible}
          capturedSide={transitionSide}
          onComplete={() => setTransitionVisible(false)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════
          AUTO-CAPTURE: Guidance Banner
          Shows current step and instructions
          ══════════════════════════════════════════════════════════════════════════════ */}
      <View style={styles.guidanceBanner}>
        {autoCaptureState === 'WAIT_FRONT' && (
          <>
            <Text style={styles.guidanceStep}>{Strings.scanning.stepFront}</Text>
            <Text style={styles.guidanceIcon}>🪪</Text>
            <Text style={styles.guidanceTitle}>{Strings.scanning.placeFront}</Text>
            {!detectionResult?.isValid && (
              <Text style={styles.guidanceSub}>{Strings.scanning.alignCard}</Text>
            )}
            {detectionResult?.isValid && classifiedSide && classifiedSide !== 'FRONT' && (
              <Text style={[styles.guidanceSub, styles.guidanceWarning]}>
                {Strings.scanning.wrongSideFront}
              </Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'FRONT' && !layoutValid && (
              <Text style={styles.guidanceSub}>{Strings.scanning.holdSteady}</Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'FRONT' && layoutValid && !qualityWarning && (
              <Text style={[styles.guidanceSub, styles.guidanceSuccess]}>
                {Strings.scanning.capturing}
              </Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'FRONT' && layoutValid && qualityWarning && (
              <Text style={[styles.guidanceSub, styles.guidanceBlurWarning]}>
                📷 {qualityWarning}
              </Text>
            )}
          </>
        )}

        {autoCaptureState === 'WAIT_BACK' && (
          <>
            <Text style={styles.guidanceStep}>{Strings.scanning.stepBack}</Text>
            <Text style={styles.guidanceIcon}>🔄</Text>
            <Text style={styles.guidanceTitle}>{Strings.scanning.placeBack}</Text>
            <Text style={styles.guidanceCheckmark}>✅ {Strings.scanning.frontCaptured}</Text>
            {!detectionResult?.isValid && (
              <Text style={styles.guidanceSub}>{Strings.scanning.alignCard}</Text>
            )}
            {detectionResult?.isValid && classifiedSide && classifiedSide !== 'BACK' && (
              <Text style={[styles.guidanceSub, styles.guidanceWarning]}>
                {Strings.scanning.wrongSideBack}
              </Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'BACK' && !layoutValid && (
              <Text style={styles.guidanceSub}>{Strings.scanning.holdSteady}</Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'BACK' && layoutValid && !qualityWarning && (
              <Text style={[styles.guidanceSub, styles.guidanceSuccess]}>
                {Strings.scanning.capturing}
              </Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'BACK' && layoutValid && qualityWarning && (
              <Text style={[styles.guidanceSub, styles.guidanceBlurWarning]}>
                📷 {qualityWarning}
              </Text>
            )}
          </>
        )}

        {autoCaptureState === 'FINISHED' && (
          <>
            <Text style={styles.guidanceIcon}>🎉</Text>
            <Text style={styles.guidanceTitle}>{Strings.result.title}</Text>
            <Text style={styles.guidanceCheckmark}>✅ Both sides captured</Text>
          </>
        )}
      </View>

      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        <View style={[
          styles.progressDot,
          (autoCaptureState === 'WAIT_FRONT' || autoCaptureState === 'WAIT_BACK' || autoCaptureState === 'FINISHED') && styles.progressDotActive,
          (autoCaptureState === 'WAIT_BACK' || autoCaptureState === 'FINISHED') && styles.progressDotComplete,
        ]} />
        <View style={styles.progressLine} />
        <View style={[
          styles.progressDot,
          (autoCaptureState === 'WAIT_BACK' || autoCaptureState === 'FINISHED') && styles.progressDotActive,
          autoCaptureState === 'FINISHED' && styles.progressDotComplete,
        ]} />
      </View>
      
      {/* Debug Info */}
      {showDebugInfo && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>
            Detection: {detectionResult?.isValid ? 'VALID' : 'NONE'}
          </Text>
          <Text style={styles.debugText}>
            Frame: {detectionResult?.frameWidth}x{detectionResult?.frameHeight}
          </Text>
          {detectionResult?.debug && (
            <>
              <Text style={styles.debugSeparator}>── Auto-Capture ──</Text>
              <Text style={[styles.debugText, { color: '#00AAFF' }]}>
                State: {autoCaptureState}
              </Text>
              <Text style={styles.debugText}>
                Expected: {expectedSide} | Detected: {classifiedSide || '—'}
              </Text>
              <Text style={[styles.debugText, { color: sideMatches ? '#00FF00' : '#FF4444' }]}>
                Match: {sideMatches ? 'YES ✓' : 'NO ✗'} | Layout: {layoutValid ? 'VALID ✓' : 'INVALID'}
              </Text>
              {detectionResult.debug.hasWarpedImage && (
                <>
                  <Text style={styles.debugSeparator}>── Warp ──</Text>
                  <Text style={styles.debugText}>
                    Size: 1000×630 ✓
                  </Text>
                </>
              )}
              {/* Warp Test Button (Debug) */}
              {onOpenWarpTest && (
                <TouchableOpacity
                  style={styles.warpTestButton}
                  onPress={() => {
                    setTimeout(() => {
                      onOpenWarpTest();
                    }, 50);
                  }}
                >
                  <Text style={styles.warpTestButtonText}>🔍 Open Warp Test</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* Reset button (visible when not in WAIT_FRONT) */}
      {autoCaptureState !== 'WAIT_FRONT' && (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={resetCaptureSequence}
        >
          <Text style={styles.resetButtonText}>↺ Start Over</Text>
        </TouchableOpacity>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════
          COMPLETION MODAL: Shows both captured images
          ══════════════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showCompletionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.completionOverlay}>
          <ScrollView contentContainerStyle={styles.completionScrollContent}>
            <View style={styles.completionContainer}>
              <Text style={styles.completionTitle}>🎉 Capture Complete!</Text>
              <Text style={styles.completionSubtitle}>Both sides of CIN captured successfully</Text>

              {/* Front Image */}
              <View style={styles.capturedImageSection}>
                <Text style={styles.capturedImageLabel}>RECTO (Front)</Text>
                {capturedFrontImage && (
                  <View style={styles.capturedImageContainer}>
                    <Image
                      source={{ uri: `data:image/png;base64,${capturedFrontImage.base64}` }}
                      style={styles.capturedImage}
                      resizeMode="contain"
                    />
                    <View style={styles.imageDimensionsBadge}>
                      <Text style={styles.imageDimensionsText}>
                        {capturedFrontImage.width} × {capturedFrontImage.height}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Extracted Face Photo */}
              {facePhoto && (
                <View style={styles.capturedImageSection}>
                  <Text style={styles.capturedImageLabel}>👤 Photo Extraite</Text>
                  <View style={[styles.capturedImageContainer, { alignItems: 'center' }]}>
                    <Image
                      source={{ uri: `data:image/png;base64,${facePhoto.base64}` }}
                      style={{
                        width: facePhoto.width * 0.8,
                        height: facePhoto.height * 0.8,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: '#00FF88',
                      }}
                      resizeMode="contain"
                    />
                    <View style={styles.imageDimensionsBadge}>
                      <Text style={styles.imageDimensionsText}>
                        {facePhoto.width} × {facePhoto.height}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Back Image */}
              <View style={styles.capturedImageSection}>
                <Text style={styles.capturedImageLabel}>VERSO (Back)</Text>
                {capturedBackImage && (
                  <View style={styles.capturedImageContainer}>
                    <Image
                      source={{ uri: `data:image/png;base64,${capturedBackImage.base64}` }}
                      style={styles.capturedImage}
                      resizeMode="contain"
                    />
                    <View style={styles.imageDimensionsBadge}>
                      <Text style={styles.imageDimensionsText}>
                        {capturedBackImage.width} × {capturedBackImage.height}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Barcode Data Section (Phase C) */}
              <View style={styles.barcodeSection}>
                <Text style={styles.barcodeSectionTitle}>📊 Barcode Data</Text>
                
                {barcodeScanning && (
                  <View style={styles.barcodeLoading}>
                    <ActivityIndicator size="small" color="#00FF00" />
                    <Text style={styles.barcodeLoadingText}>Scanning barcode...</Text>
                  </View>
                )}
                
                {barcodeError && !barcodeScanning && (
                  <View style={styles.barcodeErrorContainer}>
                    <Text style={styles.barcodeErrorText}>⚠️ {barcodeError}</Text>
                  </View>
                )}
                
                {barcodeData && barcodeData.isValid && !barcodeScanning && (
                  <View style={styles.barcodeDataContainer}>
                    <View style={styles.barcodeRow}>
                      <Text style={styles.barcodeLabel}>CIN Number:</Text>
                      <Text style={styles.barcodeValue}>{barcodeData.cinNumber}</Text>
                    </View>
                    <View style={styles.barcodeRow}>
                      <Text style={styles.barcodeLabel}>Left Number:</Text>
                      <Text style={styles.barcodeValue}>{barcodeData.leftNumber}</Text>
                    </View>
                    <View style={styles.barcodeRow}>
                      <Text style={styles.barcodeLabel}>Right Number:</Text>
                      <Text style={styles.barcodeValue}>{barcodeData.rightNumber}</Text>
                    </View>
                    <View style={styles.barcodeRow}>
                      <Text style={styles.barcodeLabel}>Release Date:</Text>
                      <Text style={styles.barcodeValue}>{barcodeData.releaseDateFormatted}</Text>
                    </View>
                    <View style={styles.barcodeRawRow}>
                      <Text style={styles.barcodeRawLabel}>Raw:</Text>
                      <Text style={styles.barcodeRawValue}>{barcodeData.rawData}</Text>
                    </View>
                  </View>
                )}
                
                {barcodeData && !barcodeData.isValid && !barcodeScanning && (
                  <View style={styles.barcodeErrorContainer}>
                    <Text style={styles.barcodeErrorText}>
                      ⚠️ Invalid format: {barcodeData.error}
                    </Text>
                    <Text style={styles.barcodeRawValue}>Raw: {barcodeData.rawData}</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.completionActions}>
                <TouchableOpacity
                  style={styles.completionButtonPrimary}
                  onPress={() => {
                    setShowCompletionModal(false);
                    // Callback could process the images here
                  }}
                >
                  <Text style={styles.completionButtonPrimaryText}>Continue</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.completionButtonSecondary}
                  onPress={() => {
                    setShowCompletionModal(false);
                    resetCaptureSequence();
                  }}
                >
                  <Text style={styles.completionButtonSecondaryText}>Scan Again</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.lg,
    marginTop: Spacing.lg,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.error,
    fontSize: 18,
    textAlign: 'center',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTO-CAPTURE: Guidance Banner Styles (Attijari Theme)
  // ══════════════════════════════════════════════════════════════════════════════
  guidanceBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: Colors.overlayDark,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  guidanceStep: {
    color: Colors.primary,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  guidanceIcon: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  guidanceTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  guidanceSub: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  guidanceWarning: {
    color: Colors.error,
    fontWeight: Typography.weights.bold,
  },
  guidanceBlurWarning: {
    color: Colors.warning,
    fontWeight: Typography.weights.bold,
    fontSize: Typography.sizes.sm,
  },
  guidanceSuccess: {
    color: Colors.success,
    fontWeight: Typography.weights.bold,
  },
  guidanceCheckmark: {
    color: Colors.success,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    marginTop: Spacing.xs,
  },

  // Progress indicator
  progressContainer: {
    position: 'absolute',
    top: 200,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.border,
    borderWidth: 2,
    borderColor: Colors.borderLight,
  },
  progressDotActive: {
    borderColor: Colors.primary,
  },
  progressDotComplete: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },

  // Debug container
  debugContainer: {
    position: 'absolute',
    bottom: 100,
    left: Spacing.lg,
    backgroundColor: Colors.overlayDark,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    maxWidth: 250,
  },
  debugText: {
    color: Colors.success,
    fontSize: 11,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 3,
  },
  debugSeparator: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginTop: 4,
    marginBottom: 2,
  },
  warpTestButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  warpTestButtonText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },

  // Reset button
  resetButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    backgroundColor: Colors.overlayMedium,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  resetButtonText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // COMPLETION MODAL: Both sides captured
  // ══════════════════════════════════════════════════════════════════════════════
  completionOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
  },
  completionScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  completionContainer: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl,
  },
  completionTitle: {
    color: Colors.success,
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  completionSubtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  capturedImageSection: {
    marginBottom: Spacing.xl,
  },
  capturedImageLabel: {
    color: Colors.primary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.sm,
  },
  capturedImageContainer: {
    width: '100%',
    aspectRatio: 1000 / 630,
    backgroundColor: Colors.backgroundElevated,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  capturedImage: {
    width: '100%',
    height: '100%',
  },
  imageDimensionsBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  imageDimensionsText: {
    color: Colors.background,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  completionActions: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  completionButtonPrimary: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  completionButtonPrimaryText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  completionButtonSecondary: {
    backgroundColor: 'transparent',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  completionButtonSecondaryText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  
  // Barcode Section Styles (Attijari Theme)
  barcodeSection: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: 'rgba(227, 6, 19, 0.1)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  barcodeSectionTitle: {
    color: Colors.primary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  barcodeLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  barcodeLoadingText: {
    color: Colors.primary,
    marginLeft: Spacing.md,
    fontSize: Typography.sizes.md,
  },
  barcodeDataContainer: {
    backgroundColor: Colors.overlayLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  barcodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  barcodeLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
  },
  barcodeValue: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  barcodeRawRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  barcodeRawLabel: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.sm,
  },
  barcodeRawValue: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.sm,
    fontFamily: 'monospace',
  },
  barcodeErrorContainer: {
    backgroundColor: 'rgba(255, 61, 0, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  barcodeErrorText: {
    color: Colors.error,
    fontSize: Typography.sizes.md,
    textAlign: 'center',
  },
});

export default CameraScreen;
