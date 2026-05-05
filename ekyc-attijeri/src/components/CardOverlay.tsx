/**
 * CardOverlay Component
 * Renders dynamic SVG overlay for detected card corners
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, Dimensions, Text } from 'react-native';
import Svg, { Polygon, Circle, Line, Rect, Path } from 'react-native-svg';
import type { Point2D, OverlayStyle } from '../types/cardDetection';

interface CardOverlayProps {
  /** Detected card corners */
  corners: Point2D[];
  
  /** Frame dimensions from camera */
  frameWidth: number;
  frameHeight: number;
  
  /** Screen/view dimensions */
  viewWidth: number;
  viewHeight: number;
  
  /** Whether detection is valid */
  isValid: boolean;
  
  /** Custom overlay style */
  style?: Partial<OverlayStyle>;
  
  /** Show corner markers */
  showCornerMarkers?: boolean;
  
  /** Show edge lines */
  showEdgeLines?: boolean;
}

/**
 * Default overlay style
 */
const defaultStyle: OverlayStyle = {
  validColor: '#00FF00',
  invalidColor: '#FF0000',
  strokeWidth: 3,
  fillColor: 'rgba(0, 255, 0, 0.15)',
  cornerRadius: 8,
};

/**
 * Scale point from frame coordinates to view coordinates
 */
function scalePoint(
  point: Point2D,
  frameWidth: number,
  frameHeight: number,
  viewWidth: number,
  viewHeight: number
): Point2D {
  // Calculate scale factors
  const scaleX = viewWidth / frameWidth;
  const scaleY = viewHeight / frameHeight;
  
  // Use the smaller scale to maintain aspect ratio
  const scale = Math.min(scaleX, scaleY);
  
  // Calculate offset for centering
  const offsetX = (viewWidth - frameWidth * scale) / 2;
  const offsetY = (viewHeight - frameHeight * scale) / 2;
  
  return {
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  };
}

/**
 * CardOverlay component
 */
export const CardOverlay: React.FC<CardOverlayProps> = ({
  corners,
  frameWidth,
  frameHeight,
  viewWidth,
  viewHeight,
  isValid,
  style = {},
  showCornerMarkers = true,
  showEdgeLines = true,
}) => {
  // Merge styles
  const overlayStyle = useMemo(
    () => ({ ...defaultStyle, ...style }),
    [style]
  );

  // Scale corners to view coordinates
  const scaledCorners = useMemo(() => {
    if (corners.length !== 4) return [];
    
    return corners.map((corner) =>
      scalePoint(corner, frameWidth, frameHeight, viewWidth, viewHeight)
    );
  }, [corners, frameWidth, frameHeight, viewWidth, viewHeight]);

  // Don't render if no valid corners
  if (scaledCorners.length !== 4) {
    return null;
  }

  // Create polygon points string
  const polygonPoints = scaledCorners
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  // Select color based on validity
  const strokeColor = isValid
    ? overlayStyle.validColor
    : overlayStyle.invalidColor;

  const fillColor = isValid
    ? overlayStyle.fillColor
    : 'rgba(255, 0, 0, 0.1)';

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={viewWidth} height={viewHeight} style={styles.svg}>
        {/* Main polygon */}
        <Polygon
          points={polygonPoints}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={overlayStyle.strokeWidth}
          strokeLinejoin="round"
        />

        {/* Edge lines with enhanced visibility */}
        {showEdgeLines &&
          scaledCorners.map((corner, index) => {
            const nextCorner = scaledCorners[(index + 1) % 4];
            return (
              <Line
                key={`edge-${index}`}
                x1={corner.x}
                y1={corner.y}
                x2={nextCorner.x}
                y2={nextCorner.y}
                stroke={strokeColor}
                strokeWidth={overlayStyle.strokeWidth + 1}
                strokeLinecap="round"
              />
            );
          })}

        {/* Corner markers */}
        {showCornerMarkers &&
          scaledCorners.map((corner, index) => (
            <React.Fragment key={`corner-${index}`}>
              {/* Outer circle */}
              <Circle
                cx={corner.x}
                cy={corner.y}
                r={overlayStyle.cornerRadius || 8}
                fill={strokeColor}
                opacity={0.8}
              />
              {/* Inner circle */}
              <Circle
                cx={corner.x}
                cy={corner.y}
                r={(overlayStyle.cornerRadius || 8) / 2}
                fill="white"
              />
            </React.Fragment>
          ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  svg: {
    flex: 1,
  },
  instructionContainer: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

/**
 * Overlay bounds for native detector (relative to frame coordinates)
 */
export interface OverlayBounds {
  x: number;         // Normalized 0-1 (left)
  y: number;         // Normalized 0-1 (top)
  width: number;     // Normalized 0-1
  height: number;    // Normalized 0-1
}

/**
 * Calculate overlay bounds for a given frame and view dimensions
 */
export function calculateOverlayBounds(
  frameWidth: number,
  frameHeight: number,
  viewWidth: number,
  viewHeight: number,
  aspectRatio: number = 1.586,
  padding: number = 40
): OverlayBounds {
  // Camera uses ResizeMode "cover" (object-fit: cover):
  // the frame is uniformly scaled so that BOTH dimensions >= view dimensions,
  // then centered and cropped. We must account for this to get correct frame coords.
  //
  // uniformDisplayScale = max(viewWidth/frameWidth, viewHeight/frameHeight)
  // offsets = how many frame pixels are cropped on each side
  const displayScaleX = viewWidth / frameWidth;
  const displayScaleY = viewHeight / frameHeight;
  const uniformDisplayScale = Math.max(displayScaleX, displayScaleY);

  // Visible frame region (in frame pixels)
  const visibleFrameW = viewWidth  / uniformDisplayScale;
  const visibleFrameH = viewHeight / uniformDisplayScale;
  const cropOffsetX   = (frameWidth  - visibleFrameW) / 2;
  const cropOffsetY   = (frameHeight - visibleFrameH) / 2;

  // Guide frame dimensions in view (screen) coordinates
  const availableWidth  = viewWidth  - padding * 2;
  const availableHeight = viewHeight - padding * 2;

  let guideWidth: number;
  let guideHeight: number;

  if (availableWidth / availableHeight > aspectRatio) {
    guideHeight = availableHeight * 0.60;
    guideWidth  = guideHeight * aspectRatio;
  } else {
    guideWidth  = availableWidth * 0.70;
    guideHeight = guideWidth / aspectRatio;
  }

  // Guide top-left in view coordinates (centered)
  const guideViewX = (viewWidth  - guideWidth)  / 2;
  const guideViewY = (viewHeight - guideHeight) / 2;

  // Convert view coords → frame coords using uniform scale + crop offset
  const frameX = cropOffsetX + guideViewX  / uniformDisplayScale;
  const frameY = cropOffsetY + guideViewY  / uniformDisplayScale;
  const frameW = guideWidth  / uniformDisplayScale;
  const frameH = guideHeight / uniformDisplayScale;

  // Normalize to 0-1 relative to full frame dimensions
  return {
    x:      frameX / frameWidth,
    y:      frameY / frameHeight,
    width:  frameW / frameWidth,
    height: frameH / frameHeight,
  };
}

/**
 * Static guide frame component
 * Shows a permanent cadre for card placement
 */
interface CardGuideFrameProps {
  viewWidth: number;
  viewHeight: number;
  aspectRatio?: number; // ID-1 card ratio 1.586
  padding?: number;
  showValidation?: boolean;
  isAligned?: boolean;
}

export const CardGuideFrame: React.FC<CardGuideFrameProps> = ({
  viewWidth,
  viewHeight,
  aspectRatio = 1.586,
  padding = 40,
  showValidation = false,
  isAligned = false,
}) => {
  // Calculate guide frame dimensions (60-70% of available space)
  const availableWidth = viewWidth - padding * 2;
  const availableHeight = viewHeight - padding * 2;

  let frameWidth: number;
  let frameHeight: number;

  if (availableWidth / availableHeight > aspectRatio) {
    frameHeight = availableHeight * 0.60;
    frameWidth = frameHeight * aspectRatio;
  } else {
    frameWidth = availableWidth * 0.70;
    frameHeight = frameWidth / aspectRatio;
  }

  const x = (viewWidth - frameWidth) / 2;
  const y = (viewHeight - frameHeight) / 2;
  const cornerLength = 35;
  const strokeWidth = 4;
  
  // Dynamic color based on alignment status
  const frameColor = showValidation
    ? (isAligned ? '#00FF00' : '#FFD700')  // Green if aligned, Yellow if not
    : '#FFFFFF';  // White by default

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={viewWidth} height={viewHeight}>
        {/* Semi-transparent overlay outside frame */}
        <Rect
          x={0}
          y={0}
          width={viewWidth}
          height={y}
          fill="rgba(0,0,0,0.6)"
        />
        <Rect
          x={0}
          y={y + frameHeight}
          width={viewWidth}
          height={viewHeight - y - frameHeight}
          fill="rgba(0,0,0,0.6)"
        />
        <Rect
          x={0}
          y={y}
          width={x}
          height={frameHeight}
          fill="rgba(0,0,0,0.6)"
        />
        <Rect
          x={x + frameWidth}
          y={y}
          width={viewWidth - x - frameWidth}
          height={frameHeight}
          fill="rgba(0,0,0,0.6)"
        />

        {/* Corner brackets - Top Left */}
        <Path
          d={`M ${x} ${y + cornerLength} L ${x} ${y} L ${x + cornerLength} ${y}`}
          stroke={frameColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Top Right */}
        <Path
          d={`M ${x + frameWidth - cornerLength} ${y} L ${x + frameWidth} ${y} L ${x + frameWidth} ${y + cornerLength}`}
          stroke={frameColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bottom Right */}
        <Path
          d={`M ${x + frameWidth} ${y + frameHeight - cornerLength} L ${x + frameWidth} ${y + frameHeight} L ${x + frameWidth - cornerLength} ${y + frameHeight}`}
          stroke={frameColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bottom Left */}
        <Path
          d={`M ${x + cornerLength} ${y + frameHeight} L ${x} ${y + frameHeight} L ${x} ${y + frameHeight - cornerLength}`}
          stroke={frameColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      
      {/* Instruction text */}
      <View style={[styles.instructionContainer, { top: y - 60 }]}>
        <Text style={styles.instructionText}>
          {showValidation
            ? (isAligned ? '✓ Card Aligned' : 'Align card within frame')
            : 'Position your CIN card inside the frame'}
        </Text>
      </View>
    </View>
  );
};

export default CardOverlay;
