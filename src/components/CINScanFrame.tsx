/**
 * CINScanFrame Component
 * Enhanced frame overlay with side-specific zones and Attijari branding
 * Replaces basic CardGuideFrame with production-ready UI
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import Svg, {
  Rect,
  Path,
  G,
  Circle,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
  useDerivedValue,
} from 'react-native-reanimated';
import { Colors, CardDimensions, Typography, Spacing } from '../constants/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export interface CINScanFrameProps {
  /** View width */
  viewWidth: number;
  /** View height */
  viewHeight: number;
  /** Current side being scanned */
  side: 'FRONT' | 'BACK';
  /** Detection confidence 0-1 */
  confidence: number;
  /** Whether card is currently detected */
  isDetected: boolean;
  /** Quality warning message */
  qualityWarning?: string | null;
  /** Whether barcode is detected (BACK only) */
  isBarcodeDetected?: boolean;
}

/**
 * Get frame color based on confidence level
 */
function getFrameColor(confidence: number, isDetected: boolean): string {
  if (!isDetected) {
    return Colors.frameDefault; // Red when no detection
  }
  if (confidence >= 0.85) {
    return Colors.frameSuccess; // Green - ready to capture
  }
  if (confidence >= 0.5) {
    return Colors.frameWarning; // Yellow - detected but issues
  }
  return Colors.frameDefault; // Red - low confidence
}

/**
 * CINScanFrame Component
 */
export const CINScanFrame: React.FC<CINScanFrameProps> = ({
  viewWidth,
  viewHeight,
  side,
  confidence,
  isDetected,
  qualityWarning,
  isBarcodeDetected = false,
}) => {
  const { aspectRatio, framePadding, recto, verso } = CardDimensions;

  // Calculate frame dimensions
  const availableWidth = viewWidth - framePadding * 2;
  const availableHeight = viewHeight - framePadding * 2;

  let frameWidth: number;
  let frameHeight: number;

  if (availableWidth / availableHeight > aspectRatio) {
    frameHeight = availableHeight * 0.55;
    frameWidth = frameHeight * aspectRatio;
  } else {
    frameWidth = availableWidth * 0.85;
    frameHeight = frameWidth / aspectRatio;
  }

  const frameX = (viewWidth - frameWidth) / 2;
  const frameY = (viewHeight - frameHeight) / 2;
  const cornerLength = Math.min(frameWidth, frameHeight) * 0.12;
  const strokeWidth = 3;

  // Get current frame color
  const frameColor = getFrameColor(confidence, isDetected);

  // Animation values
  const glowOpacity = useSharedValue(0.4);
  const scanLineY = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  // Glow pulse animation
  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [glowOpacity]);

  // Scan line animation
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.linear }),
      -1,
      false
    );
  }, [scanLineY]);

  // Pulse when detected
  useEffect(() => {
    if (isDetected && confidence >= 0.85) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = 1;
    }
  }, [isDetected, confidence, pulseScale]);

  // Animated scan line
  const scanLineAnimatedProps = useAnimatedProps(() => ({
    y1: frameY + scanLineY.value * frameHeight,
    y2: frameY + scanLineY.value * frameHeight,
  }));

  // Zone calculations for FRONT
  const frontZones = useMemo(() => {
    if (side !== 'FRONT') return null;
    return {
      flag: {
        x: frameX + recto.flagZone.x * frameWidth,
        y: frameY + recto.flagZone.y * frameHeight,
        w: recto.flagZone.width * frameWidth,
        h: recto.flagZone.height * frameHeight,
      },
      emblem: {
        x: frameX + recto.emblemZone.x * frameWidth,
        y: frameY + recto.emblemZone.y * frameHeight,
        w: recto.emblemZone.width * frameWidth,
        h: recto.emblemZone.height * frameHeight,
      },
      photo: {
        x: frameX + recto.photoZone.x * frameWidth,
        y: frameY + recto.photoZone.y * frameHeight,
        w: recto.photoZone.width * frameWidth,
        h: recto.photoZone.height * frameHeight,
      },
    };
  }, [side, frameX, frameY, frameWidth, frameHeight, recto]);

  // Zone calculations for BACK
  const backZones = useMemo(() => {
    if (side !== 'BACK') return null;
    return {
      fingerprint: {
        x: frameX + verso.fingerprintZone.x * frameWidth,
        y: frameY + verso.fingerprintZone.y * frameHeight,
        w: verso.fingerprintZone.width * frameWidth,
        h: verso.fingerprintZone.height * frameHeight,
      },
      barcode: {
        x: frameX + verso.barcodeZone.x * frameWidth,
        y: frameY + verso.barcodeZone.y * frameHeight,
        w: verso.barcodeZone.width * frameWidth,
        h: verso.barcodeZone.height * frameHeight,
      },
    };
  }, [side, frameX, frameY, frameWidth, frameHeight, verso]);

  // Corner paths
  const corners = [
    // Top-left
    `M ${frameX} ${frameY + cornerLength} L ${frameX} ${frameY} L ${frameX + cornerLength} ${frameY}`,
    // Top-right
    `M ${frameX + frameWidth - cornerLength} ${frameY} L ${frameX + frameWidth} ${frameY} L ${frameX + frameWidth} ${frameY + cornerLength}`,
    // Bottom-right
    `M ${frameX + frameWidth} ${frameY + frameHeight - cornerLength} L ${frameX + frameWidth} ${frameY + frameHeight} L ${frameX + frameWidth - cornerLength} ${frameY + frameHeight}`,
    // Bottom-left
    `M ${frameX + cornerLength} ${frameY + frameHeight} L ${frameX} ${frameY + frameHeight} L ${frameX} ${frameY + frameHeight - cornerLength}`,
  ];

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={viewWidth} height={viewHeight}>
        {/* Dark overlay outside frame */}
        <Rect x={0} y={0} width={viewWidth} height={frameY} fill={Colors.overlayMedium} />
        <Rect x={0} y={frameY + frameHeight} width={viewWidth} height={viewHeight - frameY - frameHeight} fill={Colors.overlayMedium} />
        <Rect x={0} y={frameY} width={frameX} height={frameHeight} fill={Colors.overlayMedium} />
        <Rect x={frameX + frameWidth} y={frameY} width={viewWidth - frameX - frameWidth} height={frameHeight} fill={Colors.overlayMedium} />

        {/* Frame border with glow effect */}
        <Rect
          x={frameX + 1}
          y={frameY + 1}
          width={frameWidth - 2}
          height={frameHeight - 2}
          rx={12}
          ry={12}
          fill="none"
          stroke={frameColor}
          strokeWidth={2}
          opacity={0.3}
        />

        {/* Corner brackets */}
        {corners.map((d, index) => (
          <Path
            key={`corner-${index}`}
            d={d}
            stroke={frameColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* FRONT side zones */}
        {side === 'FRONT' && frontZones && (
          <G opacity={0.5}>
            {/* Flag zone */}
            <Rect
              x={frontZones.flag.x}
              y={frontZones.flag.y}
              width={frontZones.flag.w}
              height={frontZones.flag.h}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="5,3"
            />
            {/* Flag icon */}
            <Rect
              x={frontZones.flag.x + frontZones.flag.w * 0.2}
              y={frontZones.flag.y + frontZones.flag.h * 0.25}
              width={frontZones.flag.w * 0.6}
              height={frontZones.flag.h * 0.5}
              rx={2}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1}
            />

            {/* Emblem zone */}
            <Rect
              x={frontZones.emblem.x}
              y={frontZones.emblem.y}
              width={frontZones.emblem.w}
              height={frontZones.emblem.h}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="5,3"
            />
            {/* Shield shape */}
            <Path
              d={`M ${frontZones.emblem.x + frontZones.emblem.w * 0.5} ${frontZones.emblem.y + frontZones.emblem.h * 0.15}
                  L ${frontZones.emblem.x + frontZones.emblem.w * 0.8} ${frontZones.emblem.y + frontZones.emblem.h * 0.3}
                  L ${frontZones.emblem.x + frontZones.emblem.w * 0.8} ${frontZones.emblem.y + frontZones.emblem.h * 0.6}
                  Q ${frontZones.emblem.x + frontZones.emblem.w * 0.5} ${frontZones.emblem.y + frontZones.emblem.h * 0.9}
                    ${frontZones.emblem.x + frontZones.emblem.w * 0.2} ${frontZones.emblem.y + frontZones.emblem.h * 0.6}
                  L ${frontZones.emblem.x + frontZones.emblem.w * 0.2} ${frontZones.emblem.y + frontZones.emblem.h * 0.3}
                  Z`}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1}
            />

            {/* Photo zone */}
            <Rect
              x={frontZones.photo.x}
              y={frontZones.photo.y}
              width={frontZones.photo.w}
              height={frontZones.photo.h}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="5,3"
            />
            {/* Person silhouette - head */}
            <Circle
              cx={frontZones.photo.x + frontZones.photo.w * 0.5}
              cy={frontZones.photo.y + frontZones.photo.h * 0.3}
              r={frontZones.photo.w * 0.2}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
            />
            {/* Person silhouette - shoulders */}
            <Path
              d={`M ${frontZones.photo.x + frontZones.photo.w * 0.15} ${frontZones.photo.y + frontZones.photo.h * 0.85}
                  Q ${frontZones.photo.x + frontZones.photo.w * 0.15} ${frontZones.photo.y + frontZones.photo.h * 0.55}
                    ${frontZones.photo.x + frontZones.photo.w * 0.5} ${frontZones.photo.y + frontZones.photo.h * 0.55}
                  Q ${frontZones.photo.x + frontZones.photo.w * 0.85} ${frontZones.photo.y + frontZones.photo.h * 0.55}
                    ${frontZones.photo.x + frontZones.photo.w * 0.85} ${frontZones.photo.y + frontZones.photo.h * 0.85}`}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
            />
          </G>
        )}

        {/* BACK side zones */}
        {side === 'BACK' && backZones && (
          <G>
            {/* Fingerprint zone */}
            <G opacity={0.5}>
              <Rect
                x={backZones.fingerprint.x}
                y={backZones.fingerprint.y}
                width={backZones.fingerprint.w}
                height={backZones.fingerprint.h}
                rx={4}
                fill="none"
                stroke={Colors.textSecondary}
                strokeWidth={1.5}
                strokeDasharray="5,3"
              />
              {/* Fingerprint spiral */}
              {[0.9, 0.7, 0.5, 0.35].map((scale, i) => (
                <Circle
                  key={`fp-${i}`}
                  cx={backZones.fingerprint.x + backZones.fingerprint.w * 0.5}
                  cy={backZones.fingerprint.y + backZones.fingerprint.h * 0.5}
                  r={backZones.fingerprint.w * 0.35 * scale}
                  fill="none"
                  stroke={Colors.textSecondary}
                  strokeWidth={1}
                />
              ))}
            </G>

            {/* Barcode zone - highlighted */}
            <Rect
              x={backZones.barcode.x}
              y={backZones.barcode.y}
              width={backZones.barcode.w}
              height={backZones.barcode.h}
              rx={4}
              fill={isBarcodeDetected ? 'rgba(0, 200, 83, 0.15)' : 'rgba(227, 6, 19, 0.1)'}
              stroke={isBarcodeDetected ? Colors.success : Colors.primary}
              strokeWidth={2}
            />
            {/* Barcode lines */}
            <G opacity={0.4}>
              {Array.from({ length: 20 }).map((_, i) => {
                const barX = backZones.barcode.x + 10 + i * ((backZones.barcode.w - 20) / 20);
                const isThick = i % 3 === 0;
                return (
                  <Rect
                    key={`bar-${i}`}
                    x={barX}
                    y={backZones.barcode.y + backZones.barcode.h * 0.25}
                    width={isThick ? 4 : 2}
                    height={backZones.barcode.h * 0.5}
                    fill={Colors.textSecondary}
                  />
                );
              })}
            </G>
          </G>
        )}

        {/* Scan line */}
        <AnimatedLine
          x1={frameX + 10}
          x2={frameX + frameWidth - 10}
          stroke={frameColor}
          strokeWidth={2}
          opacity={0.5}
          animatedProps={scanLineAnimatedProps}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});

export default CINScanFrame;
