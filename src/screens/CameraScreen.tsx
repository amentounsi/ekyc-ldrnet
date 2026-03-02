/**
 * CameraScreen Component
 * Main camera screen with real-time card detection overlay
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
  
  // Capture preview state
  const [capturedImage, setCapturedImage] = useState<{
    base64: string;
    width: number;
    height: number;
  } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Scan mode: FRONT or BACK (controls red validation bypass)
  const [scanMode, setScanModeState] = useState<'FRONT' | 'BACK'>('FRONT');
  
  const { CardDetectorModule } = NativeModules;
  
  // Capture warped image function
  const captureWarpedImage = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    
    try {
      const result = await CardDetectorModule.getWarpedImage();
      if (result && result.base64) {
        setCapturedImage(result);
        setShowPreview(true);
      } else {
        Alert.alert('Capture Failed', 'No warped image available. Make sure detection shows "Size: 1000×630 ✓"');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to capture: ${error}`);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, CardDetectorModule]);
  
  // Close preview
  const closePreview = useCallback(() => {
    setShowPreview(false);
  }, []);
  
  // Card detection hook
  const {
    detectionResult,
    isReady,
    frameProcessor,
    scaledCorners,
  } = useCardDetection({
    enabled: isActive && hasPermission,
    onCardDetected,
    throttleMs: 100, // Update every 100ms for smoother performance
    useOverlay: overlayEnabled,
    overlayBounds,
    useROICropping: false,  // Full frame detection; overlay used for constraint validation only
  });
  
  // Update scan mode in native module when changed (only after detector is ready)
  useEffect(() => {
    if (!isReady) return;  // Wait for detector to be initialized
    
    const updateScanMode = async () => {
      try {
        await CardDetectorModule.setScanMode(scanMode);
        console.log(`Scan mode set to: ${scanMode}`);
      } catch (error) {
        console.error('Failed to set scan mode:', error);
      }
    };
    updateScanMode();
  }, [scanMode, isReady, CardDetectorModule]);
  
  // Wrapper function to change scan mode
  const setScanMode = (mode: 'FRONT' | 'BACK') => {
    setScanModeState(mode);
  };
  
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
      
      {/* Instructions removed - now shown by CardGuideFrame */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsText}>
          Position your ID card within the camera view
        </Text>
        {detectionResult?.isValid && (
          <Text style={styles.detectedText}>Card Detected!</Text>
        )}
      </View>
      
      {/* Scan Mode Toggle - FRONT / BACK */}
      <View style={styles.scanModeContainer}>
        <TouchableOpacity
          style={[
            styles.scanModeButton,
            scanMode === 'FRONT' && styles.scanModeButtonActive,
          ]}
          onPress={() => setScanMode('FRONT')}
        >
          <Text style={[
            styles.scanModeButtonText,
            scanMode === 'FRONT' && styles.scanModeButtonTextActive,
          ]}>RECTO</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.scanModeButton,
            scanMode === 'BACK' && styles.scanModeButtonActive,
          ]}
          onPress={() => setScanMode('BACK')}
        >
          <Text style={[
            styles.scanModeButtonText,
            scanMode === 'BACK' && styles.scanModeButtonTextActive,
          ]}>VERSO</Text>
        </TouchableOpacity>
      </View>
      
      {/* Debug Info – stage-by-stage visibility */}
      {showDebugInfo && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>
            Detection: {detectionResult?.isValid ? 'VALID' : 'NONE'}
          </Text>
          <Text style={styles.debugText}>
            Confidence: {detectionResult?.confidence?.toFixed(3) || 'N/A'}
          </Text>
          <Text style={styles.debugText}>
            Frame: {detectionResult?.frameWidth}x{detectionResult?.frameHeight}
          </Text>
          <Text style={styles.debugText}>
            View: {viewDimensions.width.toFixed(0)}x{viewDimensions.height.toFixed(0)}
          </Text>
          {detectionResult?.debug && (
            <>
              <Text style={styles.debugSeparator}>── Pipeline ──</Text>
              <Text style={styles.debugText}>
                S1 edges: {detectionResult.debug.edgeWhitePixels} px
              </Text>
              <Text style={styles.debugText}>
                S2 contours: {detectionResult.debug.totalContours} → top {detectionResult.debug.topNContours}
              </Text>
              <Text style={styles.debugText}>
                S2 largest: {((detectionResult.debug.largestAreaRatio || 0) * 100).toFixed(2)}%
              </Text>
              <Text style={styles.debugSeparator}>── Stage 3 ──</Text>
              <Text style={styles.debugText}>
                S3 quads: {detectionResult.debug.candidateQuads}
              </Text>
              <Text style={styles.debugText}>
                rej area: {detectionResult.debug.rejectedByArea ?? '?'} | approx: {detectionResult.debug.rejectedByApprox ?? '?'} | aspect: {detectionResult.debug.rejectedByAspect ?? '?'} | edge: {detectionResult.debug.rejectedByEdgeDensity ?? '?'}
              </Text>
              <Text style={styles.debugText}>
                S4 best: {detectionResult.debug.bestScore?.toFixed(3) || '—'}
              </Text>
              {detectionResult.debug.hasWarpedImage && (
                <>
                  <Text style={styles.debugSeparator}>── Warp ──</Text>
                  <Text style={styles.debugText}>
                    Size: 1000×630 ✓
                  </Text>
                  <Text style={styles.debugText}>
                    Luminance: {detectionResult.debug.warpedLuminance?.toFixed(1) || '—'}
                  </Text>
                  <Text style={styles.debugText}>
                    Gamma: {detectionResult.debug.warpedGamma?.toFixed(2) || '—'}
                  </Text>
                </>
              )}
              {/* Warp Test Button (Debug) */}
              {onOpenWarpTest && (
                <TouchableOpacity
                  style={styles.warpTestButton}
                  onPress={() => {
                    // Small delay to ensure frame processor finishes before navigation
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
      
      {/* Capture Button - appears when warp is available */}
      {detectionResult?.debug?.hasWarpedImage && (
        <TouchableOpacity
          style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
          onPress={captureWarpedImage}
          disabled={isCapturing}
        >
          <Text style={styles.captureButtonText}>
            {isCapturing ? '⏳' : '📷'} {isCapturing ? 'Capturing...' : 'CAPTURE'}
          </Text>
        </TouchableOpacity>
      )}
      
      {/* Preview Modal */}
      <Modal
        visible={showPreview}
        transparent={true}
        animationType="fade"
        onRequestClose={closePreview}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>Warped Image Captured</Text>
            
            {capturedImage && (
              <>
                <View style={styles.previewImageContainer}>
                  <Image
                    source={{ uri: `data:image/png;base64,${capturedImage.base64}` }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                  <View style={styles.previewDimensionsBadge}>
                    <Text style={styles.previewDimensionsText}>
                      {capturedImage.width} × {capturedImage.height} px
                    </Text>
                  </View>
                </View>
                
                <View style={styles.previewChecklist}>
                  <Text style={styles.previewCheckItem}>
                    {capturedImage.width === 1000 ? '✅' : '❌'} Width = 1000 px
                  </Text>
                  <Text style={styles.previewCheckItem}>
                    {capturedImage.height === 630 ? '✅' : '❌'} Height = 630 px
                  </Text>
                  <Text style={styles.previewCheckHint}>
                    Check: No flip, no rotation, text readable
                  </Text>
                </View>
              </>
            )}
            
            <TouchableOpacity style={styles.previewCloseButton} onPress={closePreview}>
              <Text style={styles.previewCloseButtonText}>Close & Continue</Text>
            </TouchableOpacity>
          </View>
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
  instructionsContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionsText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detectedText: {
    color: '#00FF00',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanModeContainer: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  scanModeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#666',
  },
  scanModeButtonActive: {
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
    borderColor: '#00FF00',
  },
  scanModeButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scanModeButtonTextActive: {
    color: '#00FF00',
  },
  debugContainer: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    borderRadius: 8,
  },
  debugText: {
    color: '#00FF00',
    fontSize: 12,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 4,
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
  // Capture button styles
  captureButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: '#00FF00',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  captureButtonDisabled: {
    backgroundColor: '#666',
  },
  captureButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Preview modal styles
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  previewContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
  },
  previewTitle: {
    color: '#00FF00',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  previewImageContainer: {
    width: '100%',
    aspectRatio: 1000 / 630,
    backgroundColor: '#2a2a4a',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewDimensionsBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#00FF00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  previewDimensionsText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewChecklist: {
    marginBottom: 16,
  },
  previewCheckItem: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  previewCheckHint: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
  previewCloseButton: {
    backgroundColor: '#00FF00',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewCloseButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CameraScreen;
