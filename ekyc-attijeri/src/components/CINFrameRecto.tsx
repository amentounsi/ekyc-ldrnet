/**
 * CINFrameRecto Component
 * Frame overlay for scanning the FRONT side of Tunisian CIN
 * Shows: Flag zone (top-left), Emblem zone (top-right), Photo zone (left)
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, {
  Rect,
  Path,
  G,
  Defs,
  Mask,
  Circle,
  Line,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, CardDimensions } from '../constants/cinTheme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface CINFrameRectoProps {
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
  /** Confidence level 0-1 for glow intensity */
  confidence?: number;
}

/**
 * CINFrameRecto Component
 */
export const CINFrameRecto: React.FC<CINFrameRectoProps> = ({
  width,
  height,
  frameColor = Colors.frameDefault,
  isDetected = false,
  showZones = true,
  confidence = 0,
}) => {
  const { recto } = CardDimensions;
  
  // Animation values
  const glowOpacity = useSharedValue(0.3);
  const scanLineY = useSharedValue(0);
  const cornerPulse = useSharedValue(1);

  // Glow pulse animation
  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 750, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [glowOpacity]);

  // Scan line animation
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, [scanLineY]);

  // Corner pulse when detected
  useEffect(() => {
    if (isDetected) {
      cornerPulse.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 300 }),
          withTiming(1, { duration: 300 })
        ),
        3,
        true
      );
    }
  }, [isDetected, cornerPulse]);

  // Calculate zone positions
  const flagX = recto.flagZone.x * width;
  const flagY = recto.flagZone.y * height;
  const flagW = recto.flagZone.width * width;
  const flagH = recto.flagZone.height * height;

  const emblemX = recto.emblemZone.x * width;
  const emblemY = recto.emblemZone.y * height;
  const emblemW = recto.emblemZone.width * width;
  const emblemH = recto.emblemZone.height * height;

  const photoX = recto.photoZone.x * width;
  const photoY = recto.photoZone.y * height;
  const photoW = recto.photoZone.width * width;
  const photoH = recto.photoZone.height * height;

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

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Glow filter effect via shadow */}
        </Defs>

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
          <G opacity={0.6}>
            {/* Flag zone - top left */}
            <Rect
              x={flagX}
              y={flagY}
              width={flagW}
              height={flagH}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
            {/* Flag icon placeholder */}
            <Rect
              x={flagX + flagW * 0.2}
              y={flagY + flagH * 0.25}
              width={flagW * 0.6}
              height={flagH * 0.5}
              rx={2}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1}
            />
            <Circle
              cx={flagX + flagW * 0.5}
              cy={flagY + flagH * 0.5}
              r={flagW * 0.15}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1}
            />

            {/* Emblem zone - top right (coat of arms) */}
            <Rect
              x={emblemX}
              y={emblemY}
              width={emblemW}
              height={emblemH}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
            {/* Shield shape */}
            <Path
              d={`M ${emblemX + emblemW * 0.5} ${emblemY + emblemH * 0.15}
                  L ${emblemX + emblemW * 0.8} ${emblemY + emblemH * 0.3}
                  L ${emblemX + emblemW * 0.8} ${emblemY + emblemH * 0.6}
                  Q ${emblemX + emblemW * 0.5} ${emblemY + emblemH * 0.9}
                    ${emblemX + emblemW * 0.2} ${emblemY + emblemH * 0.6}
                  L ${emblemX + emblemW * 0.2} ${emblemY + emblemH * 0.3}
                  Z`}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1}
            />

            {/* Photo zone - left side */}
            <Rect
              x={photoX}
              y={photoY}
              width={photoW}
              height={photoH}
              rx={4}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
            {/* Person silhouette */}
            <Circle
              cx={photoX + photoW * 0.5}
              cy={photoY + photoH * 0.32}
              r={photoW * 0.22}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
            />
            <Path
              d={`M ${photoX + photoW * 0.15} ${photoY + photoH * 0.85}
                  Q ${photoX + photoW * 0.15} ${photoY + photoH * 0.55}
                    ${photoX + photoW * 0.5} ${photoY + photoH * 0.55}
                  Q ${photoX + photoW * 0.85} ${photoY + photoH * 0.55}
                    ${photoX + photoW * 0.85} ${photoY + photoH * 0.85}`}
              fill="none"
              stroke={Colors.textSecondary}
              strokeWidth={1.5}
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

// Animated Line component
const AnimatedLine = Animated.createAnimatedComponent(Line);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
});

export default CINFrameRecto;
