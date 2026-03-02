/**
 * WarpTestScreen.tsx
 * Test screen for Phase 1 - CardWarper module
 * Displays the normalized 1000×630 warped image when a card is detected
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  NativeModules,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';

const { CardDetectorModule } = NativeModules;

interface WarpedImageResult {
  base64: string;
  width: number;
  height: number;
}

interface ClassificationResult {
  side: 'FRONT' | 'BACK' | 'UNKNOWN';
  confidence: number;
  flagDetected: boolean;
  flagRedRatio: number;
  photoTextureDetected: boolean;
  photoStddev: number;
  barcodeDetected: boolean;
  barcodeEdgeDensity: number;
  fingerprintDetected: boolean;
  fingerprintStddev: number;
  meanBrightness: number;
  brightEnough: boolean;
  mrzDetected: boolean;
  mrzEdgeDensity: number;
}

interface WarpTestScreenProps {
  onBack?: () => void;
}

export const WarpTestScreen: React.FC<WarpTestScreenProps> = ({ onBack }) => {
  const [warpedImage, setWarpedImage] = useState<WarpedImageResult | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  const captureWarpedImage = useCallback(async () => {
    setIsCapturing(true);
    setClassification(null);  // Clear previous classification
    try {
      const result = await CardDetectorModule.getWarpedImage();
      if (result) {
        setWarpedImage(result);
        setCaptureCount(prev => prev + 1);
        console.log(`Warped image captured: ${result.width}x${result.height}`);
      } else {
        Alert.alert(
          'No Image Available',
          'No warped image available. Make sure:\n\n' +
          '1. Go to Camera screen\n' +
          '2. Position a CIN card until GREEN frame\n' +
          '3. Return here and tap Capture'
        );
      }
    } catch (error) {
      console.error('Error capturing warped image:', error);
      Alert.alert('Error', `Failed to capture warped image: ${error}`);
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const classifyCardSide = useCallback(async () => {
    setIsClassifying(true);
    try {
      const result = await CardDetectorModule.classifyCardSide();
      if (result) {
        setClassification(result);
        console.log('Classification result:', result);
      } else {
        Alert.alert(
          'Classification Failed',
          'No warped image available for classification.\n\n' +
          'Capture a warped image first.'
        );
      }
    } catch (error) {
      console.error('Error classifying card:', error);
      Alert.alert('Error', `Failed to classify card: ${error}`);
    } finally {
      setIsClassifying(false);
    }
  }, []);

  const clearImage = useCallback(() => {
    setWarpedImage(null);
    setClassification(null);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Back Button */}
      {onBack && (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back to Camera</Text>
        </TouchableOpacity>
      )}
      
      <Text style={styles.title}>CardWarper Test</Text>
      <Text style={styles.subtitle}>Phase 1 - Perspective Normalization</Text>
      
      {/* Warped Image Display */}
      <View style={styles.imageContainer}>
        {warpedImage ? (
          <>
            <Image
              source={{ uri: `data:image/png;base64,${warpedImage.base64}` }}
              style={styles.warpedImage}
              resizeMode="contain"
            />
            <View style={styles.dimensionsBadge}>
              <Text style={styles.dimensionsText}>
                {warpedImage.width} × {warpedImage.height} px
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.placeholderText}>
              No warped image yet
            </Text>
            <Text style={styles.placeholderHint}>
              Detect a card first, then tap Capture
            </Text>
          </View>
        )}
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Expected Output</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Size:</Text>
          <Text style={styles.infoValue}>1000 × 630 px</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ratio:</Text>
          <Text style={styles.infoValue}>1.586 (CIN standard)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Orientation:</Text>
          <Text style={styles.infoValue}>Flag top-left (FRONT)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Gamma:</Text>
          <Text style={styles.infoValue}>Auto-corrected if needed</Text>
        </View>
        {captureCount > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Captures:</Text>
            <Text style={styles.infoValue}>{captureCount}</Text>
          </View>
        )}
      </View>

      {/* Validation Checklist */}
      <View style={styles.checklistBox}>
        <Text style={styles.checklistTitle}>Validation Checklist</Text>
        <Text style={styles.checklistItem}>
          {warpedImage?.width === 1000 ? '✅' : '⬜'} Width = 1000 px
        </Text>
        <Text style={styles.checklistItem}>
          {warpedImage?.height === 630 ? '✅' : '⬜'} Height = 630 px
        </Text>
        <Text style={styles.checklistItem}>
          {warpedImage ? '✅' : '⬜'} Image captured successfully
        </Text>
        <Text style={styles.checklistItem}>
          ⬜ Card not stretched or distorted (visual check)
        </Text>
        <Text style={styles.checklistItem}>
          ⬜ Corners properly aligned (visual check)
        </Text>
      </View>

      {/* Phase 2: Classification Result */}
      {warpedImage && (
        <View style={styles.classificationBox}>
          <Text style={styles.classificationTitle}>Phase 2: Side Classification</Text>
          
          {classification ? (
            <>
              <View style={[
                styles.sideResultBadge,
                classification.side === 'FRONT' ? styles.frontBadge :
                classification.side === 'BACK' ? styles.backBadge : styles.unknownBadge
              ]}>
                <Text style={styles.sideResultText}>
                  {classification.side === 'FRONT' ? '🎴 FRONT (Recto)' :
                   classification.side === 'BACK' ? '📊 BACK (Verso)' : '❓ UNKNOWN'}
                </Text>
                <Text style={styles.confidenceText}>
                  Confidence: {(classification.confidence * 100).toFixed(0)}%
                </Text>
              </View>
              
              <View style={styles.metricsContainer}>
                <Text style={styles.metricsTitle}>Detection Metrics:</Text>
                <Text style={styles.metricItem}>
                  {classification.flagDetected ? '✅' : '❌'} Flag: {(classification.flagRedRatio * 100).toFixed(1)}% red
                </Text>
                <Text style={styles.metricItem}>
                  {classification.photoTextureDetected ? '✅' : '❌'} Photo: stddev={classification.photoStddev.toFixed(1)}
                </Text>
                <Text style={styles.metricItem}>
                  {classification.barcodeDetected ? '✅' : '❌'} Barcode: edge={classification.barcodeEdgeDensity.toFixed(3)}
                </Text>
                <Text style={styles.metricItem}>
                  {classification.mrzDetected ? '✅' : '❌'} MRZ: edge={classification.mrzEdgeDensity.toFixed(3)}
                </Text>
                <Text style={styles.metricItem}>
                  {classification.fingerprintDetected ? '✅' : '❌'} Fingerprint: stddev={classification.fingerprintStddev.toFixed(1)}
                </Text>
                <Text style={styles.metricItem}>
                  {classification.brightEnough ? '✅' : '⚠️'} Brightness: {classification.meanBrightness.toFixed(1)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.classifyHint}>
              Tap "Classify Side" to determine FRONT/BACK
            </Text>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.captureButton, isCapturing && styles.buttonDisabled]}
          onPress={captureWarpedImage}
          disabled={isCapturing}
        >
          <Text style={styles.captureButtonText}>
            {isCapturing ? 'Capturing...' : '📸 Capture Warped Image'}
          </Text>
        </TouchableOpacity>

        {warpedImage && (
          <TouchableOpacity
            style={[styles.classifyButton, isClassifying && styles.buttonDisabled]}
            onPress={classifyCardSide}
            disabled={isClassifying}
          >
            <Text style={styles.classifyButtonText}>
              {isClassifying ? 'Classifying...' : '🔍 Classify Side'}
            </Text>
          </TouchableOpacity>
        )}

        {warpedImage && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearImage}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructionsBox}>
        <Text style={styles.instructionsTitle}>How to Test</Text>
        <Text style={styles.instructionsText}>
          1. Open Camera screen{'\n'}
          2. Position your CIN card in the guide frame{'\n'}
          3. Wait for GREEN frame (detection locked){'\n'}
          4. Return to this screen{'\n'}
          5. Tap "Capture Warped Image"{'\n'}
          6. Tap "Classify Side" to detect FRONT/BACK{'\n'}
          7. Verify correct classification
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00ff88',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1000 / 630,
    backgroundColor: '#2a2a4a',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3a3a5a',
  },
  warpedImage: {
    width: '100%',
    height: '100%',
  },
  dimensionsBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 255, 136, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  dimensionsText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  placeholderText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  placeholderHint: {
    color: '#555',
    fontSize: 12,
  },
  infoBox: {
    backgroundColor: '#2a2a4a',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
  },
  infoTitle: {
    color: '#00ff88',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#888',
    fontSize: 13,
  },
  infoValue: {
    color: '#fff',
    fontSize: 13,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  checklistBox: {
    backgroundColor: '#2a2a4a',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
  },
  checklistTitle: {
    color: '#ffaa00',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 12,
  },
  checklistItem: {
    color: '#ccc',
    fontSize: 13,
    marginBottom: 6,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  captureButton: {
    backgroundColor: '#00ff88',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
  },
  buttonDisabled: {
    backgroundColor: '#555',
  },
  captureButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  classifyButton: {
    backgroundColor: '#aa66ff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
  },
  classifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  clearButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  classificationBox: {
    backgroundColor: '#2a2a4a',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#aa66ff',
  },
  classificationTitle: {
    color: '#aa66ff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 12,
  },
  sideResultBadge: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  frontBadge: {
    backgroundColor: 'rgba(0, 200, 100, 0.3)',
    borderWidth: 2,
    borderColor: '#00c864',
  },
  backBadge: {
    backgroundColor: 'rgba(0, 150, 255, 0.3)',
    borderWidth: 2,
    borderColor: '#0096ff',
  },
  unknownBadge: {
    backgroundColor: 'rgba(255, 150, 0, 0.3)',
    borderWidth: 2,
    borderColor: '#ff9600',
  },
  sideResultText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  confidenceText: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 4,
  },
  metricsContainer: {
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 8,
  },
  metricsTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  metricItem: {
    color: '#ccc',
    fontSize: 12,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    marginBottom: 4,
  },
  classifyHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  instructionsBox: {
    backgroundColor: '#2a2a4a',
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  instructionsTitle: {
    color: '#00aaff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 8,
  },
  instructionsText: {
    color: '#999',
    fontSize: 12,
    lineHeight: 20,
  },
});

export default WarpTestScreen;
