/**
 * CINScanFrame Component
 * Pixel-faithful port of the agreed screen 1.html mockup:
 * - FRONT: frame border + thick corner brackets + person silhouette (large circle + shoulders)
 *          + camera icon (top-left) + shield icon (top-right) + animated red scan line
 * - BACK:  frame border + thick corner brackets + fingerprint concentric ellipses (right side)
 *          + separator line + barcode zone (gold border + bars) + animated gold scan line
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Rect,
  Path,
  G,
  Circle,
  Line,
  Ellipse,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

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
  /** Quality warning message (kept for compat) */
  qualityWarning?: string | null;
  /** Whether barcode is detected (BACK only) */
  isBarcodeDetected?: boolean;
}

// Barcode bar pattern matching the HTML mockup exactly
const BAR_PATTERN: Array<{ x: number; w: number; o: number }> = [
  { x: 16, w: 2, o: 0.85 }, { x: 21, w: 1, o: 0.7 }, { x: 25, w: 3, o: 0.85 },
  { x: 31, w: 1, o: 0.7 }, { x: 35, w: 2, o: 0.85 }, { x: 40, w: 1, o: 0.7 },
  { x: 44, w: 3, o: 0.85 }, { x: 50, w: 2, o: 0.7 }, { x: 55, w: 1, o: 0.85 },
  { x: 59, w: 2, o: 0.7 }, { x: 64, w: 3, o: 0.85 }, { x: 70, w: 1, o: 0.7 },
  { x: 74, w: 2, o: 0.85 }, { x: 79, w: 1, o: 0.7 }, { x: 83, w: 3, o: 0.85 },
  { x: 89, w: 2, o: 0.7 }, { x: 94, w: 1, o: 0.85 }, { x: 98, w: 2, o: 0.7 },
  { x: 103, w: 3, o: 0.85 }, { x: 109, w: 1, o: 0.7 }, { x: 113, w: 2, o: 0.85 },
  { x: 118, w: 1, o: 0.7 }, { x: 122, w: 3, o: 0.85 }, { x: 128, w: 2, o: 0.7 },
  { x: 133, w: 1, o: 0.85 }, { x: 137, w: 2, o: 0.7 }, { x: 142, w: 3, o: 0.85 },
  { x: 148, w: 1, o: 0.7 }, { x: 152, w: 2, o: 0.85 }, { x: 157, w: 1, o: 0.7 },
  { x: 161, w: 3, o: 0.85 }, { x: 167, w: 2, o: 0.7 }, { x: 172, w: 1, o: 0.85 },
  { x: 176, w: 2, o: 0.7 }, { x: 181, w: 3, o: 0.85 }, { x: 187, w: 1, o: 0.7 },
  { x: 191, w: 2, o: 0.85 }, { x: 196, w: 1, o: 0.7 }, { x: 200, w: 3, o: 0.85 },
  { x: 206, w: 2, o: 0.7 }, { x: 211, w: 1, o: 0.85 }, { x: 215, w: 2, o: 0.7 },
  { x: 220, w: 3, o: 0.85 }, { x: 226, w: 1, o: 0.7 }, { x: 230, w: 2, o: 0.85 },
  { x: 235, w: 1, o: 0.7 }, { x: 239, w: 3, o: 0.85 }, { x: 245, w: 2, o: 0.7 },
  { x: 250, w: 1, o: 0.85 }, { x: 254, w: 2, o: 0.7 }, { x: 259, w: 3, o: 0.85 },
  { x: 265, w: 1, o: 0.7 }, { x: 269, w: 2, o: 0.85 }, { x: 274, w: 1.5, o: 0.7 },
];

export const CINScanFrame: React.FC<CINScanFrameProps> = ({
  viewWidth,
  viewHeight,
  side,
  confidence,
  isDetected,
  isBarcodeDetected = false,
}) => {
  // ── Frame geometry (matches 290×188 HTML coordinate space) ────────────────
  const PADDING = 16;
  const frameWidth = viewWidth - PADDING * 2;
  const frameHeight = frameWidth / (290 / 188);
  const frameX = PADDING;
  const frameY = (viewHeight - frameHeight) / 2;

  // Scale helpers from HTML (290×188) to device pixels
  const sx = frameWidth / 290;
  const sy = frameHeight / 188;
  const tx = (x: number) => frameX + x * sx;
  const ty = (y: number) => frameY + y * sy;
  const tw = (w: number) => w * sx;
  const th = (h: number) => h * sy;

  // Corner / frame border color
  const cornerColor = isDetected
    ? confidence >= 0.7 ? '#1DB954' : '#C8963C'
    : '#ffffff';

  // ── Scan line animation ────────────────────────────────────────────────────
  const scanProgress = useSharedValue(0);
  useEffect(() => {
    scanProgress.value = 0;
    scanProgress.value = withRepeat(
      withTiming(1, { duration: side === 'BACK' ? 1400 : 2800, easing: Easing.linear }),
      -1,
      false
    );
  }, [side, scanProgress]);

  // Pre-compute constants on JS thread — captured as plain numbers in worklets
  const frontAmplitude = 54 * sy;
  const frontMidY = ty(94);
  const backAmplitude = 13 * sy;
  const backMidY = ty(161);
  const scanX1 = tx(10);
  const scanX2 = tx(280);

  // FRONT: oscillates ±54 HTML-units around centre
  const frontScanProps = useAnimatedProps(() => {
    'worklet';
    const p = scanProgress.value;
    const bounce = p < 0.5 ? p * 2 : 2 - p * 2;
    const y = frontMidY - frontAmplitude + bounce * frontAmplitude * 2;
    return { y1: y, y2: y };
  });

  // BACK: oscillates ±13 HTML-units around barcode centre (y=161)
  const backScanProps = useAnimatedProps(() => {
    'worklet';
    const p = scanProgress.value;
    const bounce = p < 0.5 ? p * 2 : 2 - p * 2;
    const y = backMidY - backAmplitude + bounce * backAmplitude * 2;
    return { y1: y, y2: y };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={viewWidth} height={viewHeight}>

        {/* ── Dark vignette outside frame ───────────────────────────────── */}
        <Rect x={0} y={0} width={viewWidth} height={frameY} fill="rgba(0,0,0,0.55)" />
        <Rect x={0} y={frameY + frameHeight} width={viewWidth} height={viewHeight - frameY - frameHeight} fill="rgba(0,0,0,0.55)" />
        <Rect x={0} y={frameY} width={frameX} height={frameHeight} fill="rgba(0,0,0,0.55)" />
        <Rect x={frameX + frameWidth} y={frameY} width={viewWidth - frameX - frameWidth} height={frameHeight} fill="rgba(0,0,0,0.55)" />

        {/* ── Frame border ─────────────────────────────────────────────── */}
        <Rect
          x={tx(2)} y={ty(2)} width={tw(286)} height={th(184)}
          rx={tw(12)} ry={th(12)}
          fill="none" stroke={cornerColor} strokeWidth={tw(3)}
        />

        {/* ── Thick corner brackets ────────────────────────────────────── */}
        {/* Top-left */}
        <Path d={`M ${tx(2)} ${ty(36)} L ${tx(2)} ${ty(14)} Q ${tx(2)} ${ty(2)} ${tx(14)} ${ty(2)} L ${tx(36)} ${ty(2)}`}
          stroke={cornerColor} strokeWidth={tw(5)} fill="none" strokeLinecap="square" />
        {/* Top-right */}
        <Path d={`M ${tx(254)} ${ty(2)} L ${tx(276)} ${ty(2)} Q ${tx(288)} ${ty(2)} ${tx(288)} ${ty(14)} L ${tx(288)} ${ty(36)}`}
          stroke={cornerColor} strokeWidth={tw(5)} fill="none" strokeLinecap="square" />
        {/* Bottom-right */}
        <Path d={`M ${tx(288)} ${ty(152)} L ${tx(288)} ${ty(174)} Q ${tx(288)} ${ty(186)} ${tx(276)} ${ty(186)} L ${tx(254)} ${ty(186)}`}
          stroke={cornerColor} strokeWidth={tw(5)} fill="none" strokeLinecap="square" />
        {/* Bottom-left */}
        <Path d={`M ${tx(36)} ${ty(186)} L ${tx(14)} ${ty(186)} Q ${tx(2)} ${ty(186)} ${tx(2)} ${ty(174)} L ${tx(2)} ${ty(152)}`}
          stroke={cornerColor} strokeWidth={tw(5)} fill="none" strokeLinecap="square" />

        {/* ══════════════════════════════════════════════════════════════
            FRONT content
        ══════════════════════════════════════════════════════════════ */}
        {side === 'FRONT' && (
          <G>
            {/* Person silhouette — large circle (cx=80, cy=88, r=34) */}
            <Circle cx={tx(80)} cy={ty(88)} r={tw(34)}
              fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={tw(2)} />
            {/* Shoulders arc */}
            <Path
              d={`M ${tx(32)} ${ty(186)} Q ${tx(32)} ${ty(144)} ${tx(80)} ${ty(144)} Q ${tx(128)} ${ty(144)} ${tx(128)} ${ty(186)}`}
              fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={tw(2)} strokeLinecap="round" />

            {/* Camera icon — top-left (x=14,y=12, w=56,h=44) */}
            <Rect x={tx(14)} y={ty(12)} width={tw(56)} height={th(44)} rx={tw(4)}
              fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={tw(1.8)} />
            <Circle cx={tx(42)} cy={ty(34)} r={tw(11)}
              fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={tw(1.8)} />
            <Circle cx={tx(42)} cy={ty(34)} r={tw(4.5)}
              fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={tw(1.5)} />

            {/* Shield emblem — top-right */}
            <Path
              d={`M ${tx(264)} ${ty(14)} Q ${tx(250)} ${ty(14)} ${tx(250)} ${ty(26)} L ${tx(250)} ${ty(48)} Q ${tx(250)} ${ty(62)} ${tx(264)} ${ty(66)} Q ${tx(278)} ${ty(62)} ${tx(278)} ${ty(48)} L ${tx(278)} ${ty(26)} Q ${tx(278)} ${ty(14)} ${tx(264)} ${ty(14)} Z`}
              fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={tw(1.8)} />
            <Circle cx={tx(264)} cy={ty(30)} r={tw(6)}
              fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={tw(1.3)} />

            {/* Animated red scan line */}
            <AnimatedLine x1={scanX1} x2={scanX2}
              stroke="rgba(204,27,43,0.85)" strokeWidth={tw(2)} strokeLinecap="round"
              animatedProps={frontScanProps} />
            <AnimatedLine x1={scanX1} x2={scanX2}
              stroke="rgba(204,27,43,0.15)" strokeWidth={tw(8)} strokeLinecap="round"
              animatedProps={frontScanProps} />
          </G>
        )}

        {/* ══════════════════════════════════════════════════════════════
            BACK content
        ══════════════════════════════════════════════════════════════ */}
        {side === 'BACK' && (
          <G>
            {/* Fingerprint concentric ellipses (cx=195, cy=80) */}
            <Ellipse cx={tx(195)} cy={ty(80)} rx={tw(9)}  ry={th(10)}
              fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={tw(1.8)} />
            <Ellipse cx={tx(195)} cy={ty(80)} rx={tw(17)} ry={th(19)}
              fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth={tw(1.8)} />
            <Ellipse cx={tx(195)} cy={ty(80)} rx={tw(25)} ry={th(28)}
              fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={tw(1.8)} />
            <Ellipse cx={tx(195)} cy={ty(80)} rx={tw(33)} ry={th(37)}
              fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={tw(1.7)} />
            <Ellipse cx={tx(195)} cy={ty(80)} rx={tw(40)} ry={th(45)}
              fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={tw(1.5)} />

            {/* Separator line at y=138 */}
            <Line x1={tx(8)} y1={ty(138)} x2={tx(282)} y2={ty(138)}
              stroke="white" strokeWidth={th(1.5)} opacity={0.7} />

            {/* Barcode zone rect (x=8, y=142, w=274, h=38) */}
            <Rect
              x={tx(8)} y={ty(142)} width={tw(274)} height={th(38)} rx={tw(4)}
              fill={isBarcodeDetected ? 'rgba(29,185,84,0.1)' : 'rgba(200,150,60,0.05)'}
              stroke={isBarcodeDetected ? 'rgba(29,185,84,0.7)' : 'rgba(200,150,60,0.5)'}
              strokeWidth={tw(1.5)}
            />

            {/* Barcode bars */}
            {BAR_PATTERN.map((bar, i) => (
              <Rect
                key={`bar-${i}`}
                x={tx(bar.x)} y={ty(147)}
                width={tw(bar.w)} height={th(26)}
                rx={tw(0.4)}
                fill="white" opacity={bar.o}
              />
            ))}

            {/* Animated gold scan line over barcode */}
            <AnimatedLine x1={scanX1} x2={scanX2}
              stroke="rgba(200,150,60,0.95)" strokeWidth={tw(2)} strokeLinecap="round"
              animatedProps={backScanProps} />
            <AnimatedLine x1={scanX1} x2={scanX2}
              stroke="rgba(200,150,60,0.2)" strokeWidth={tw(7)} strokeLinecap="round"
              animatedProps={backScanProps} />
          </G>
        )}

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
