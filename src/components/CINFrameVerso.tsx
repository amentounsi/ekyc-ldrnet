/**
 * CINFrameVerso Component
 * Frame overlay for scanning the BACK side of Tunisian CIN
 * Shows: Fingerprint zone (right), Barcode zone (bottom)
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Rect,
  Path,
  G,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, CardDimensions } from '../constants/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedLine = Animated.createAnimatedComponent(Line);

interface CINFrameVersoProps {
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Frame color based on detection state */
  frameColor?: string;
  /** Whether card is detected */
  isDetected?: boolean;
  /** Show zone indicators */
  showZones?: boolean;
  /** Whether barcode is detected */
  isBarcodeDetected?: boolean;
  /** Confidence level 0-1 */
  confidence?: number;
}

/**
 * CINFrameVerso Component
 */
export const CINFrameVerso: React.FC<CINFrameVersoProps> = ({
  width,
  height,
  frameColor = Colors.frameDefault,
  isDetected = false,
  showZones = true,
  isBarcodeDetected = false,
  confidence = 0,
}) => {
  const { verso } = CardDimensions;

  // Animation values
  const scanLineY = useSharedValue(0);
  const barcodeHighlight = useSharedValue(0.3);

  // Scan line animation
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, [scanLineY]);

  // Barcode highlight pulse
  useEffect(() => {
    if (!isBarcodeDetected) {
      barcodeHighlight.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 600 }),
          withTiming(0.3, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      barcodeHighlight.value = withTiming(0.8, { duration: 200 });
    }
  }, [isBarcodeDetected, barcodeHighlight]);

  // Calculate zone positions
  const fpX = verso.fingerprintZone.x * width;
  const fpY = verso.fingerprintZone.y * height;
  const fpW = verso.fingerprintZone.width * width;
  const fpH = verso.fingerprintZone.height * height;

  const bcX = verso.barcodeZone.x * width;
  const bcY = verso.barcodeZone.y * height;
  const bcW = verso.barcodeZone.width * width;
  const bcH = verso.barcodeZone.height * height;

  // Corner bracket size
  const cornerSize = Math.min(width, height) * 0.1;
  const strokeWidth = 3;

  // Generate corner bracket paths
  const corners = [
    // Top-left
    `M ${strokeWidth} ${cornerSize} L ${strokeWidth} ${strokeWidth} L ${cornerSize} ${strokeWidth}`,
    // Top-right
    `M ${width - cornerSize} ${strokeWidth} L ${width - strokeWidth} ${strokeWidth} L ${width - strokeWidth} ${cornerSize}`,
    // Bottom-right
    `M ${width - strokeWidth} ${height - cornerSize} L ${width - strokeWidth} ${height - strokeWidth} L ${width - cornerSize} ${height - strokeWidth}`,
    // Bottom-left
    `M ${cornerSize} ${height - strokeWidth} L ${strokeWidth} ${height - strokeWidth} L ${strokeWidth} ${height - cornerSize}`,
  ];

  // Animated scan line props
  const scanLineAnimatedProps = useAnimatedProps(() => ({
    y1: scanLineY.value * height,
    y2: scanLineY.value * height,
  }));

  // Animated barcode highlight
  const barcodeAnimatedProps = useAnimatedProps(() => ({
    opacity: barcodeHighlight.value,
  }));

  // Generate barcode bars visual
  const generateBarcodeVisual = () => {
    const bars = [];
    const barCount = 25;
    const barWidth = (bcW - 20) / barCount;
    const startX = bcX + 10;
    
    for (let i = 0; i < barCount; i++) {
      const isThick = i % 3 === 0;
      bars.push(
        <Rect
          key={`bar-${i}`}
          x={startX + i * barWidth}
          y={bcY + bcH * 0.3}
          width={isThick ? barWidth * 0.7 : barWidth * 0.4}
          height={bcH * 0.4}
          fill={Colors.textSecondary}
          opacity={0.5}
        />
      );
    }
    return bars;
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {/* Main frame border */}
        <Rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={width - strokeWidth}
          height={height - strokeWidth}
          rx={12}
          ry={12}
          fill="none"
          stroke={frameColor}
          strokeWidth={strokeWidth}
          opacity={0.8}
        />

        {/* Corner brackets */}
        {corners.map((d, index) => (
          <Path
            key={`corner-${index}`}
            d={d}
            stroke={frameColor}
            strokeWidth={strokeWidth + 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}

        {/* Zone indicators */}
        {showZones && (
          <G>
            {/* Fingerprint zone - right side */}
            <Rect
              x={fpX}
              y={fpY}
              width={fpW}
              height={fpH}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.6}
            />
            {/* Fingerprint spiral */}
            <G opacity={0.5}>
              {[0.9, 0.7, 0.5, 0.3].map((scale, i) => (
                <Path
                  key={`fp-${i}`}
                  d={`M ${fpX + fpW * 0.5} ${fpY + fpH * 0.35}
                      a ${fpW * 0.15 * scale} ${fpH * 0.15 * scale} 0 1 1 0.1 0`}
                  fill="none"
                  stroke={Colors.textSecondary}
                  strokeWidth={1.5}
                />
              ))}
            </G>

            {/* Barcode zone - bottom */}
            <AnimatedRect
              x={bcX}
              y={bcY}
              width={bcW}
              height={bcH}
              rx={4}
              fill={isBarcodeDetected ? 'rgba(0, 200, 83, 0.1)' : 'rgba(227, 6, 19, 0.1)'}
              stroke={isBarcodeDetected ? Colors.success : Colors.primary}
              strokeWidth={2}
              animatedProps={barcodeAnimatedProps}
            />

            {/* Barcode visual representation */}
            <G opacity={0.6}>
              {generateBarcodeVisual()}
            </G>

            {/* Separator line above barcode */}
            <Line
              x1={bcX}
              y1={bcY - 5}
              x2={bcX + bcW}
              y2={bcY - 5}
              stroke={Colors.textMuted}
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={0.5}
            />
          </G>
        )}

        {/* Scan line */}
        <AnimatedLine
          x1={10}
          x2={width - 10}
          stroke={frameColor}
          strokeWidth={2}
          opacity={0.4}
          animatedProps={scanLineAnimatedProps}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
});

export default CINFrameVerso;
