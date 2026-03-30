/**
 * CameraScreen Component
 * Main camera screen with real-time card detection overlay
 *
 * AUTO-CAPTURE FLOW (2026-03-25):
 * STEP 1 → Capture FRONT (recto)
 * STEP 2 → Automatically switch to BACK (verso)
 * STEP 3 → Capture BACK
 * STEP 4 → Return BOTH images
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
import CardOverlay, { CardGuideFrame, calculateOverlayBounds } from '../components/CardOverlay';
import type { CardDetectionResult } from '../types/cardDetection';

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

  // Side classification state (used for auto-capture logic)
  const [classifiedSide, setClassifiedSide] = useState<'FRONT' | 'BACK' | 'UNKNOWN' | null>(null);
  const [layoutValid, setLayoutValid] = useState(false);
  const classifyingRef = useRef(false);
  const validateLayoutRef = useRef(false);

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
      setShowCompletionModal(false);
      setClassifiedSide(null);
      setLayoutValid(false);
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
  // AUTO-CAPTURE: Classification + Layout Validation + Auto-capture logic
  // ══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const hasWarp = detectionResult?.debug?.hasWarpedImage;
    const isValid = detectionResult?.isValid;

    // Reset classification when detection lost
    if (!hasWarp || !isValid || !isReady || autoCaptureState === 'FINISHED') {
      if (classifiedSide !== null) {
        setClassifiedSide(null);
        setLayoutValid(false);
      }
      return;
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

            // AUTO-CAPTURE: If side matches AND layout valid, trigger capture
            if (isLayoutValid && !autoCaptureInProgressRef.current) {
              autoCaptureInProgressRef.current = true;

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
                    }
                    setAutoCaptureState('WAIT_BACK');
                    setClassifiedSide(null);
                    setLayoutValid(false);
                  } else if (captureResult.state === 'FINISHED') {
                    // Back was just captured
                    const backImg = await CardDetectorModule.getCapturedBack();
                    if (backImg) {
                      setCapturedBackImage(backImg);
                      console.log('[AUTO-CAPTURE] BACK captured successfully!');
                    }
                    setAutoCaptureState('FINISHED');
                    setShowCompletionModal(true);

                    // Trigger completion callback
                    if (onCaptureComplete && capturedFrontImage && backImg) {
                      onCaptureComplete(capturedFrontImage, backImg);
                    }
                  }
                }
              } catch (err) {
                console.error('[AUTO-CAPTURE] Error:', err);
              } finally {
                autoCaptureInProgressRef.current = false;
              }
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
    detectionResult?.isValid,
    isReady,
    expectedSide,
    autoCaptureState,
    CardDetectorModule,
    onCaptureComplete,
    capturedFrontImage,
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
      
      {/* Fixed Guide Frame Overlay */}
      <CardGuideFrame
        viewWidth={viewDimensions.width}
        viewHeight={viewDimensions.height}
        aspectRatio={1.586}
        padding={40}
        showValidation={(detectionResult?.debug?.temporalValidCount ?? 0) > 0 || detectionResult?.isValid === true}
        isAligned={detectionResult?.isValid || false}
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

      {/* ══════════════════════════════════════════════════════════════════════════════
          AUTO-CAPTURE: Guidance Banner
          Shows current step and instructions
          ══════════════════════════════════════════════════════════════════════════════ */}
      <View style={styles.guidanceBanner}>
        {autoCaptureState === 'WAIT_FRONT' && (
          <>
            <Text style={styles.guidanceStep}>STEP 1 / 2</Text>
            <Text style={styles.guidanceIcon}>🪪</Text>
            <Text style={styles.guidanceTitle}>Place FRONT (Recto) of CIN</Text>
            {!detectionResult?.isValid && (
              <Text style={styles.guidanceSub}>Position card within the frame</Text>
            )}
            {detectionResult?.isValid && classifiedSide && classifiedSide !== 'FRONT' && (
              <Text style={[styles.guidanceSub, styles.guidanceWarning]}>
                Wrong side! Detected {classifiedSide === 'BACK' ? 'VERSO' : 'UNKNOWN'}
              </Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'FRONT' && !layoutValid && (
              <Text style={styles.guidanceSub}>Validating layout...</Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'FRONT' && layoutValid && (
              <Text style={[styles.guidanceSub, styles.guidanceSuccess]}>
                Capturing...
              </Text>
            )}
          </>
        )}

        {autoCaptureState === 'WAIT_BACK' && (
          <>
            <Text style={styles.guidanceStep}>STEP 2 / 2</Text>
            <Text style={styles.guidanceIcon}>🔄</Text>
            <Text style={styles.guidanceTitle}>Flip to BACK (Verso)</Text>
            <Text style={styles.guidanceCheckmark}>✅ Front captured!</Text>
            {!detectionResult?.isValid && (
              <Text style={styles.guidanceSub}>Position back side within the frame</Text>
            )}
            {detectionResult?.isValid && classifiedSide && classifiedSide !== 'BACK' && (
              <Text style={[styles.guidanceSub, styles.guidanceWarning]}>
                Wrong side! Still showing {classifiedSide === 'FRONT' ? 'RECTO' : 'UNKNOWN'}
              </Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'BACK' && !layoutValid && (
              <Text style={styles.guidanceSub}>Validating layout...</Text>
            )}
            {detectionResult?.isValid && classifiedSide === 'BACK' && layoutValid && (
              <Text style={[styles.guidanceSub, styles.guidanceSuccess]}>
                Capturing...
              </Text>
            )}
          </>
        )}

        {autoCaptureState === 'FINISHED' && (
          <>
            <Text style={styles.guidanceIcon}>🎉</Text>
            <Text style={styles.guidanceTitle}>Capture Complete!</Text>
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
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#ff0000',
    fontSize: 18,
    textAlign: 'center',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTO-CAPTURE: Guidance Banner Styles
  // ══════════════════════════════════════════════════════════════════════════════
  guidanceBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00AAFF',
  },
  guidanceStep: {
    color: '#00AAFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  guidanceIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  guidanceTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  guidanceSub: {
    color: '#AAAAAA',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  guidanceWarning: {
    color: '#FF6644',
    fontWeight: 'bold',
  },
  guidanceSuccess: {
    color: '#00FF00',
    fontWeight: 'bold',
  },
  guidanceCheckmark: {
    color: '#00FF00',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
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
    backgroundColor: '#444',
    borderWidth: 2,
    borderColor: '#666',
  },
  progressDotActive: {
    borderColor: '#00AAFF',
  },
  progressDotComplete: {
    backgroundColor: '#00FF00',
    borderColor: '#00FF00',
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: '#444',
    marginHorizontal: 8,
  },

  // Debug container
  debugContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    borderRadius: 8,
    maxWidth: 250,
  },
  debugText: {
    color: '#00FF00',
    fontSize: 11,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 3,
  },
  debugSeparator: {
    color: '#888',
    fontSize: 10,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginTop: 4,
    marginBottom: 2,
  },
  warpTestButton: {
    marginTop: 12,
    backgroundColor: '#0066FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  warpTestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Reset button
  resetButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    backgroundColor: 'rgba(100, 100, 100, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // COMPLETION MODAL: Both sides captured
  // ══════════════════════════════════════════════════════════════════════════════
  completionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  completionScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  completionContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
  },
  completionTitle: {
    color: '#00FF00',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  completionSubtitle: {
    color: '#AAAAAA',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  capturedImageSection: {
    marginBottom: 20,
  },
  capturedImageLabel: {
    color: '#00AAFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  capturedImageContainer: {
    width: '100%',
    aspectRatio: 1000 / 630,
    backgroundColor: '#2a2a4a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  capturedImage: {
    width: '100%',
    height: '100%',
  },
  imageDimensionsBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 255, 0, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  imageDimensionsText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  completionActions: {
    marginTop: 20,
    gap: 12,
  },
  completionButtonPrimary: {
    backgroundColor: '#00FF00',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  completionButtonPrimaryText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  completionButtonSecondary: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#666',
  },
  completionButtonSecondaryText: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default CameraScreen;
