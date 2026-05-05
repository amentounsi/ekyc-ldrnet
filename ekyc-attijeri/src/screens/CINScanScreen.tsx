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
  Animated,
} from 'react-native';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { CaptureSuccessOverlay } from '../components/CaptureSuccessOverlay';
import { CaptureFailOverlay } from '../components/CaptureFailOverlay';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  CameraPosition,
} from 'react-native-vision-camera';
import { useCardDetection } from '../hooks/useCardDetection';
import CardOverlay, { calculateOverlayBounds } from '../components/CardOverlay';
import CINScanFrame from '../components/CINScanFrame';
import TimeoutReminder from '../components/TimeoutReminder';
import CaptureTransition from '../components/CaptureTransition';
import { useDetectionTimeout } from '../hooks/useDetectionTimeout';
import { Colors, Typography, Spacing, BorderRadius, Strings, DetectionThresholds } from '../constants/cinTheme';
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

  /** Callback when full scan is complete (front + back + face + barcode) */
  onScanComplete?: (
    frontImage: { base64: string; width: number; height: number },
    backImage: { base64: string; width: number; height: number },
    facePhoto: { base64: string; width: number; height: number } | null,
    barcodeData: CINBarcodeData | null
  ) => void;

  /** Override the expected side (FRONT or BACK) — used in split key-based flow */
  expectedSideOverride?: 'FRONT' | 'BACK';

  /** Front image captured in a previous mount — used in key="back" instance */
  injectedFrontImage?: { base64: string; width: number; height: number } | null;

  /** Called when front side is successfully captured (split flow only) */
  onFrontCaptured?: (
    frontImage: { base64: string; width: number; height: number },
    facePhoto: { base64: string; width: number; height: number } | null
  ) => void;
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
  onScanComplete,
  expectedSideOverride,
  injectedFrontImage = null,
  onFrontCaptured,
}) => {
  // Camera permission
  const { hasPermission, requestPermission } = useCameraPermission();

  // Camera device
  const device = useCameraDevice(cameraPosition);

  // Camera format: request 720p for a balance of quality and frame processor speed
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { videoResolution: { width: 1920, height: 1080 } },
  ]);

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
  // When mounted for the back scan (key="back"), native state is already WAIT_BACK.
  // Initialize React state to match so the debug overlay and conditions are correct.
  const [autoCaptureState, setAutoCaptureState] = useState<AutoCaptureState>(
    expectedSideOverride === 'BACK' ? 'WAIT_BACK' : 'WAIT_FRONT'
  );
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
  // Ref to track latest facePhoto for use in closures (avoids stale state)
  const facePhotoRef = useRef<{
    base64: string;
    width: number;
    height: number;
  } | null>(null);
  // Ref to track latest capturedFrontImage for use in closures (avoids stale state)
  const capturedFrontImageRef = useRef<{
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

  // Workflow mode: keep auto-capture code available, but use manual capture by default.
  const ENABLE_AUTO_CAPTURE = false;
  const [manualCaptureBusy, setManualCaptureBusy] = useState(false);
  const [manualCaptureError, setManualCaptureError] = useState<string | null>(null);

  // ─── Capture overlay state ───────────────────────────────────────────────────
  const [captureOverlayState, setCaptureOverlayState] = useState<'idle' | 'success' | 'fail'>('idle');
  const [captureOverlayMessage, setCaptureOverlayMessage] = useState('');
  const [captureOverlaySubMessage, setCaptureOverlaySubMessage] = useState('');
  const [failTitle, setFailTitle] = useState('Capture échouée');
  const [failTips, setFailTips] = useState<string[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Stores the callback to fire when the success overlay auto-dismisses
  const successOverlayCallback = useRef<(() => void) | null>(null);

  // Derived: current expected side based on override prop or auto-capture state
  const expectedSide = useMemo(() => {
    if (expectedSideOverride) return expectedSideOverride;
    return autoCaptureState === 'WAIT_FRONT' ? 'FRONT' : 'BACK';
  }, [autoCaptureState, expectedSideOverride]);

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
    // When mounted for the back scan (key="back"), native state is already WAIT_BACK.
    // Calling resetCaptureSequence() would destroy the captured front image.
    if (expectedSideOverride === 'BACK') {
      console.log('[AUTO-CAPTURE] Back mount — skipping reset, native already in WAIT_BACK');
      return;
    }
    const initCaptureSequence = async () => {
      try {
        await CardDetectorModule.resetCaptureSequence();
        console.log('[AUTO-CAPTURE] Sequence initialized to WAIT_FRONT');
      } catch (error) {
        console.error('[AUTO-CAPTURE] Failed to initialize:', error);
      }
    };
    initCaptureSequence();
  }, [CardDetectorModule, expectedSideOverride]);

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

  // When key="back" component is ready, restore native state to WAIT_BACK.
  // useCardDetection calls release() on key="front" unmount then initialize() on key="back"
  // mount, which resets native to WAIT_FRONT with redValidationEnabled=true — causing the
  // back card (no red flag corners) to fail Stage 6. prepareBackScan() fixes this.
  useEffect(() => {
    if (!isReady || expectedSideOverride !== 'BACK') return;
    const setupBackMode = async () => {
      try {
        await CardDetectorModule.prepareBackScan();
        console.log('[BACK-INIT] Native set to WAIT_BACK, redValidation disabled');
      } catch (err) {
        console.error('[BACK-INIT] Failed to prepare back scan:', err);
      }
    };
    setupBackMode();
  }, [isReady, expectedSideOverride, CardDetectorModule]);

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

  const handleValidatedCapture = useCallback(async (detectedSide: 'FRONT' | 'BACK') => {
    autoCaptureInProgressRef.current = true;
    setQualityWarning(null);
    setManualCaptureError(null);

    // ── Helper: trigger fail overlay with shake animation ──────────────────
    const triggerFailOverlay = (errorType: 'blur' | 'layout' | 'barcode') => {
      const tipsMap = {
        blur: [
          'Maintenez la carte immobile dans le cadre',
          'Améliorez l\'éclairage ambiant',
          'Évitez les reflets sur la carte',
        ],
        layout: [
          'Utilisez uniquement une CIN tunisienne officielle',
          'Assurez-vous que la carte est entière dans le cadre',
          'Tenez la carte horizontalement',
        ],
        barcode: [
          'Alignez le code-barres PDF417 dans la zone dorée',
          'Assurez une bonne luminosité — évitez les reflets',
          'Code-barres non endommagé et entièrement visible',
        ],
      };
      setFailTitle(errorType === 'barcode' ? 'Code-barres non lu' : 'Capture échouée');
      setFailTips(tipsMap[errorType]);
      autoCaptureInProgressRef.current = false;
      setManualCaptureBusy(false);
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  0, duration: 60, useNativeDriver: true }),
      ]).start(() => setCaptureOverlayState('fail'));
    };

    try {
      let captureHandledAsynchronously = false;
      const captureResult = await CardDetectorModule.autoCapture(detectedSide, true);

      console.log('[AUTO-CAPTURE] Result:', captureResult);

      if (!captureResult?.captured && captureResult?.isBlurry) {
        triggerFailOverlay('blur');
        return;
      }

      if (!captureResult?.captured && captureResult?.isLayoutInvalid) {
        triggerFailOverlay('layout');
        return;
      }

      if (captureResult?.captured) {
        if (captureResult.state === 'WAIT_BACK') {
          captureHandledAsynchronously = true;
          // ── FRONT captured ──────────────────────────────────────────────
          const frontImg = await CardDetectorModule.getCapturedFront();
          if (frontImg) {
            setCapturedFrontImage(frontImg);
            capturedFrontImageRef.current = frontImg;
            console.log('[AUTO-CAPTURE] FRONT captured successfully!');

            // Stop frame processor NOW — component will unmount after the 1500ms
            // success overlay. Without this, the VisionCamera worklet fires into
            // a released CardDetector and causes a native crash.
            setAutoCaptureState('FINISHED');

            // Await face extraction so it's available in the overlay callback
            let faceImg: { base64: string; width: number; height: number } | null = null;
            try {
              faceImg = await CardDetectorModule.extractFacePhoto();
              if (faceImg) {
                setFacePhoto(faceImg);
                facePhotoRef.current = faceImg;
                console.log('[FACE] Face photo extracted:', faceImg.width, 'x', faceImg.height);
              }
            } catch (faceErr: any) {
              console.warn('[FACE] Failed to extract face:', faceErr);
            }

            const frontImgLocal = frontImg;
            const faceImgLocal = faceImg;
            successOverlayCallback.current = () => {
              if (onFrontCaptured) {
                onFrontCaptured(frontImgLocal, faceImgLocal);
              }
            };
            setCaptureOverlayMessage('Recto validé ✓');
            setCaptureOverlaySubMessage('Passez au verso de la carte');
            setCaptureOverlayState('success');
          }
          autoCaptureInProgressRef.current = false;
          setManualCaptureBusy(false);

        } else if (captureResult.state === 'FINISHED') {
          captureHandledAsynchronously = true;
          // ── BACK captured ───────────────────────────────────────────────
          const backImg = await CardDetectorModule.getCapturedBack();
          if (backImg) {
            setCapturedBackImage(backImg);
            console.log('[AUTO-CAPTURE] BACK captured — navigating to processing immediately');

            // Stop frame processor
            setAutoCaptureState('FINISHED');

            // Navigate immediately to processing screen.
            // Barcode scan happens inside CINProcessingScreen so the user
            // isn't blocked here waiting for it.
            const finalFacePhoto = facePhotoRef.current;
            const finalFrontImage = capturedFrontImageRef.current ?? injectedFrontImage ?? null;

            if (onScanComplete && finalFrontImage) {
              onScanComplete(finalFrontImage, backImg, finalFacePhoto, null);
            } else {
              setShowCompletionModal(true);
            }
          }
          autoCaptureInProgressRef.current = false;
          setManualCaptureBusy(false);
        }
      } else {
        triggerFailOverlay('blur');
      }

      if (!captureHandledAsynchronously) {
        autoCaptureInProgressRef.current = false;
        setManualCaptureBusy(false);
      }
    } catch (err) {
      console.error('[AUTO-CAPTURE] Error:', err);
      autoCaptureInProgressRef.current = false;
      setManualCaptureBusy(false);
      // Trigger fail overlay for unexpected errors
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue:  0, duration: 60, useNativeDriver: true }),
      ]).start(() => {
        setFailTitle('Capture échouée');
        setFailTips(['Vérifiez que la carte est bien dans le cadre', 'Réessayez dans de bonnes conditions']);
        setCaptureOverlayState('fail');
      });
    }
  }, [CardDetectorModule, onScanComplete, onFrontCaptured, injectedFrontImage]);

  const handleManualCapturePress = useCallback(async () => {
    if (manualCaptureBusy || autoCaptureInProgressRef.current || autoCaptureState === 'FINISHED') {
      return;
    }

    setManualCaptureBusy(true);
    setManualCaptureError(null);

    try {
      // Manual capture: user pressed the button — capture regardless of detection state.
      // Classification returning NONE does not mean the card is absent.
      await handleValidatedCapture(expectedSide);
    } catch (err) {
      console.error('[MANUAL-CAPTURE] Error:', err);
      setManualCaptureError('Capture failed. Please try again.');
    } finally {
      if (!autoCaptureInProgressRef.current) {
        setManualCaptureBusy(false);
      }
    }
  }, [
    autoCaptureState,
    expectedSide,
    handleValidatedCapture,
    manualCaptureBusy,
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTO-CAPTURE: Classification + Layout Validation + Auto-capture logic
  // ══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // In manual mode: no per-frame detection feedback at all.
    // All verification (classify, blur, layout) happens on button press only.
    if (!ENABLE_AUTO_CAPTURE) return;

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
      if (qualityWarning !== null) {
        setQualityWarning(null);
      }
      if (manualCaptureError !== null) {
        setManualCaptureError(null);
      }
      return;
    }
    
    // Check blur and show warning
    if (isBlurry) {
      setQualityWarning(Strings.scanning.tooBlurry);
    } else if (qualityWarning !== null) {
      setQualityWarning(null);
    }

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

            const currentIsBlurry = detectionResult?.debug?.isBlurry;

            if (
              isLayoutValid &&
              !currentIsBlurry &&
              !autoCaptureInProgressRef.current &&
              (result.side === 'FRONT' || result.side === 'BACK')
            ) {
              await handleValidatedCapture(result.side);
            } else if (isLayoutValid && currentIsBlurry) {
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
        }, 100);
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
    handleValidatedCapture,
    manualCaptureError,
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
        format={format}
      />
      
      {/* CIN Scan Frame wrapped in Animated.View for shake effect */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <CINScanFrame
          side={expectedSide}
          confidence={confidence}
          isDetected={detectionResult?.isValid || false}
          qualityWarning={qualityWarning || undefined}
          viewWidth={viewDimensions.width}
          viewHeight={viewDimensions.height}
        />
      </Animated.View>
      
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
          NEW UI: Instruction pill, status pill, progress dots, capture button
          ══════════════════════════════════════════════════════════════════════════════ */}

      {/* Instruction pill — top of screen */}
      <View style={styles.instructionPill}>
        <Text style={styles.instructionText}>
          {expectedSide === 'FRONT'
            ? 'Placez le côté face de votre CIN dans le cadre'
            : 'Retournez la carte — placez le verso dans le cadre'}
        </Text>
      </View>

      {/* Status pill — below the frame */}
      <View style={styles.statusRow}>
        <View style={[
          styles.statusPill,
          {
            backgroundColor: expectedSide === 'FRONT'
              ? 'rgba(204,27,43,0.12)'
              : 'rgba(200,150,60,0.12)',
            borderColor: expectedSide === 'FRONT'
              ? 'rgba(204,27,43,0.3)'
              : 'rgba(200,150,60,0.3)',
          },
        ]}>
          <View style={[
            styles.statusDot,
            { backgroundColor: expectedSide === 'FRONT' ? '#CC1B2B' : '#C8963C' },
          ]} />
          <Text style={styles.statusText}>
            {expectedSide === 'FRONT'
              ? 'En attente de la carte...'
              : 'Alignez le code-barres dans la zone...'}
          </Text>
        </View>
      </View>

      {/* Progress 3 dots */}
      <View style={styles.progressDotsRow}>
        {/* Dot 1: done (always) */}
        <View style={[styles.progressDot3, styles.progressDot3Done]} />
        <View style={styles.progressDot3Line} />
        {/* Dot 2: active if BACK, pending if FRONT */}
        <View style={[
          styles.progressDot3,
          expectedSideOverride === 'BACK' ? styles.progressDot3Active : styles.progressDot3Pending,
        ]} />
        <View style={styles.progressDot3Line} />
        {/* Dot 3: always pending */}
        <View style={[styles.progressDot3, styles.progressDot3Pending]} />
      </View>

      {/* Capture button */}
      {autoCaptureState !== 'FINISHED' && (
        <View style={styles.captureButtonContainer}>
          <TouchableOpacity
            style={[
              styles.captureButton,
              (manualCaptureBusy || captureOverlayState !== 'idle') && styles.captureButtonDisabled,
            ]}
            onPress={handleManualCapturePress}
            disabled={manualCaptureBusy || captureOverlayState !== 'idle'}
            activeOpacity={0.85}
          >
            <Svg width="18" height="18" viewBox="0 0 18 18">
              <SvgCircle cx="9" cy="9" r="6.5" fill="none" stroke="white" strokeWidth="1.8"/>
              <SvgCircle cx="9" cy="9" r="3" fill="white"/>
            </Svg>
            <Text style={styles.captureButtonText}>
              {manualCaptureBusy
                ? 'Vérification...'
                : expectedSide === 'FRONT'
                ? 'Capturer le recto'
                : 'Capturer le verso'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Success overlay */}
      {captureOverlayState === 'success' && (
        <CaptureSuccessOverlay
          message={captureOverlayMessage}
          subMessage={captureOverlaySubMessage}
          onComplete={() => {
            setCaptureOverlayState('idle');
            if (successOverlayCallback.current) {
              successOverlayCallback.current();
              successOverlayCallback.current = null;
            }
          }}
        />
      )}

      {/* Fail overlay */}
      {captureOverlayState === 'fail' && (
        <CaptureFailOverlay
          title={failTitle}
          tips={failTips}
          onRetry={() => {
            setCaptureOverlayState('idle');
            setManualCaptureError(null);
          }}
        />
      )}
      
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
              <Text style={styles.debugSeparator}>
                ── {ENABLE_AUTO_CAPTURE ? 'Auto-Capture' : 'Manual Capture'} ──
              </Text>
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
  // NEW UI STYLES
  // ══════════════════════════════════════════════════════════════════════════════
  instructionPill: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  statusRow: {
    position: 'absolute',
    bottom: 210,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
  progressDotsRow: {
    position: 'absolute',
    bottom: 184,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
  },
  progressDot3: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDot3Done: {
    backgroundColor: '#1DB954',
  },
  progressDot3Active: {
    backgroundColor: '#CC1B2B',
  },
  progressDot3Pending: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressDot3Line: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 4,
  },
  captureButtonContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 40,
    alignItems: 'center',
  },
  captureButton: {
    backgroundColor: '#CC1B2B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 220,
  },
  captureButtonDisabled: {
    opacity: 0.55,
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // DEBUG PANEL STYLES (unchanged)
  // ══════════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════════
  // COMPLETION MODAL STYLES
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
