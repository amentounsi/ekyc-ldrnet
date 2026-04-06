/**
 * ResultScreen Component
 * Displays validated CIN scan results
 * Only shows when scan is valid (face + barcode)
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
} from 'react-native';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Strings,
} from '../constants/theme';
import {
  maskCINNumber,
  formatReleaseDate,
  ValidationResult,
} from '../services/validationService';
import type { CINBarcodeData } from '../types/barcode';

interface CapturedImage {
  base64: string;
  width: number;
  height: number;
}

interface ResultScreenProps {
  /** Front image data */
  frontImage: CapturedImage | null;
  /** Back image data */
  backImage: CapturedImage | null;
  /** Face photo extracted from front */
  facePhoto: CapturedImage | null;
  /** Parsed barcode data */
  barcodeData: CINBarcodeData | null;
  /** Validation result */
  validation: ValidationResult;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback to rescan */
  onRescan: (side: 'front' | 'back' | 'both') => void;
}

/**
 * Success Icon
 */
const SuccessIcon: React.FC = () => (
  <Svg width={60} height={60} viewBox="0 0 60 60">
    <Circle cx={30} cy={30} r={28} fill={Colors.success} opacity={0.15} />
    <Circle
      cx={30}
      cy={30}
      r={25}
      fill="none"
      stroke={Colors.success}
      strokeWidth={3}
    />
    <Path
      d="M18 30 L26 38 L42 22"
      stroke={Colors.success}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

/**
 * Warning Icon
 */
const WarningIcon: React.FC = () => (
  <Svg width={60} height={60} viewBox="0 0 60 60">
    <Circle cx={30} cy={30} r={28} fill={Colors.warning} opacity={0.15} />
    <Circle
      cx={30}
      cy={30}
      r={25}
      fill="none"
      stroke={Colors.warning}
      strokeWidth={3}
    />
    <Path
      d="M30 18 L30 35"
      stroke={Colors.warning}
      strokeWidth={4}
      strokeLinecap="round"
      fill="none"
    />
    <Circle cx={30} cy={42} r={3} fill={Colors.warning} />
  </Svg>
);

/**
 * Data Row Component
 */
const DataRow: React.FC<{
  label: string;
  value: string;
  masked?: boolean;
}> = ({ label, value, masked }) => (
  <View style={styles.dataRow}>
    <Text style={styles.dataLabel}>{label}</Text>
    <Text style={[styles.dataValue, masked && styles.dataValueMasked]}>
      {value}
    </Text>
  </View>
);

/**
 * ResultScreen Component
 */
export const ResultScreen: React.FC<ResultScreenProps> = ({
  frontImage,
  backImage,
  facePhoto,
  barcodeData,
  validation,
  onConfirm,
  onRescan,
}) => {
  const { isValid, isBarcodeValid, isFaceValid, rescanRequired } = validation;

  // Determine which error to show if not valid
  const showBarcodeError = !isBarcodeValid;
  const showFaceError = !isFaceValid && isBarcodeValid;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          {isValid ? <SuccessIcon /> : <WarningIcon />}
          <Text style={[styles.title, !isValid && styles.titleWarning]}>
            {isValid ? Strings.result.title : 'Scan Incomplete'}
          </Text>
          <Text style={styles.subtitle}>
            {isValid
              ? Strings.result.subtitle
              : showBarcodeError
              ? Strings.errors.barcodeMessage
              : Strings.errors.faceMessage}
          </Text>
        </View>

        {/* Card Images */}
        <View style={styles.imagesContainer}>
          {/* Front Image */}
          {frontImage && (
            <View style={styles.imageSection}>
              <Text style={styles.imageLabel}>Front (Recto)</Text>
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${frontImage.base64}` }}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          )}

          {/* Back Image */}
          {backImage && (
            <View style={styles.imageSection}>
              <Text style={styles.imageLabel}>Back (Verso)</Text>
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${backImage.base64}` }}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          )}
        </View>

        {/* Face Photo */}
        {facePhoto && isFaceValid && (
          <View style={styles.faceSection}>
            <Text style={styles.sectionTitle}>Extracted Photo</Text>
            <View style={styles.faceWrapper}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${facePhoto.base64}` }}
                style={styles.faceImage}
                resizeMode="cover"
              />
            </View>
          </View>
        )}

        {/* Barcode Data */}
        {barcodeData && isBarcodeValid && (
          <View style={styles.dataSection}>
            <Text style={styles.sectionTitle}>Card Information</Text>
            <View style={styles.dataCard}>
              <DataRow
                label={Strings.result.cinLabel}
                value={maskCINNumber(barcodeData.cinNumber)}
                masked
              />
              <DataRow
                label={Strings.result.dateLabel}
                value={formatReleaseDate(barcodeData.releaseDate)}
              />
              <DataRow
                label="Left Number"
                value={barcodeData.leftNumber}
              />
              <DataRow
                label="Right Number"
                value={barcodeData.rightNumber}
              />
            </View>
          </View>
        )}

        {/* Error Message for Invalid Scans */}
        {!isValid && (
          <View style={styles.errorSection}>
            <Text style={styles.errorTitle}>
              {showBarcodeError ? Strings.errors.noBarcode : Strings.errors.noFace}
            </Text>
            <Text style={styles.errorMessage}>
              {showBarcodeError
                ? 'Please ensure the barcode is visible and not damaged.'
                : 'Please ensure the photo area is clearly visible.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {isValid ? (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                {Strings.result.confirmButton}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onRescan('both')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>
                {Strings.result.rescanButton}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                onRescan(rescanRequired.back ? 'back' : 'front')
              }
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                {rescanRequired.back
                  ? Strings.errors.rescanBack
                  : Strings.errors.rescanFront}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onRescan('both')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Start Over</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xxl,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  title: {
    color: Colors.success,
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  titleWarning: {
    color: Colors.warning,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.lg,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  imagesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  imageSection: {
    flex: 1,
    marginHorizontal: Spacing.xs,
  },
  imageLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  imageWrapper: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    aspectRatio: 1.586,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  faceSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.md,
  },
  faceWrapper: {
    width: 100,
    height: 120,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  faceImage: {
    width: '100%',
    height: '100%',
  },
  dataSection: {
    marginBottom: Spacing.xxl,
  },
  dataCard: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dataLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
  },
  dataValue: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  dataValueMasked: {
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  errorSection: {
    backgroundColor: 'rgba(255, 61, 0, 0.1)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.error,
    marginBottom: Spacing.xxl,
  },
  errorTitle: {
    color: Colors.error,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    lineHeight: 22,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xxl,
    paddingBottom: 40,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
  },
});

export default ResultScreen;
