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
});

/**
 * Static guide frame component
 * Shows a permanent cadre for card placement
 */
interface CardGuideFrameProps {
  viewWidth: number;
  viewHeight: number;
  aspectRatio?: number; // ID-1 card ratio 1.586
  padding?: number;
}

export const CardGuideFrame: React.FC<CardGuideFrameProps> = ({
  viewWidth,
  viewHeight,
  aspectRatio = 1.586,
  padding = 40,
}) => {
  // Calculate guide frame dimensions
  const availableWidth = viewWidth - padding * 2;
  const availableHeight = viewHeight - padding * 2;

  let frameWidth: number;
  let frameHeight: number;

  // Size frame to fit within available space while maintaining aspect ratio
  if (availableWidth / availableHeight > aspectRatio) {
    // Height constrained
    frameHeight = availableHeight * 0.45;
    frameWidth = frameHeight * aspectRatio;
  } else {
    // Width constrained
    frameWidth = availableWidth * 0.85;
    frameHeight = frameWidth / aspectRatio;
  }

  const x = (viewWidth - frameWidth) / 2;
  const y = (viewHeight - frameHeight) / 2;
  const cornerLength = 30;
  const strokeWidth = 4;

  return (
    <View style={styles.container} pointerEvents="none">
      <Svg width={viewWidth} height={viewHeight}>
        {/* Semi-transparent overlay outside frame */}
        <Rect
          x={0}
          y={0}
          width={viewWidth}
          height={y}
          fill="rgba(0,0,0,0.5)"
        />
        <Rect
          x={0}
          y={y + frameHeight}
          width={viewWidth}
          height={viewHeight - y - frameHeight}
          fill="rgba(0,0,0,0.5)"
        />
        <Rect
          x={0}
          y={y}
          width={x}
          height={frameHeight}
          fill="rgba(0,0,0,0.5)"
        />
        <Rect
          x={x + frameWidth}
          y={y}
          width={viewWidth - x - frameWidth}
          height={frameHeight}
          fill="rgba(0,0,0,0.5)"
        />

        {/* Corner brackets - Top Left */}
        <Path
          d={`M ${x} ${y + cornerLength} L ${x} ${y} L ${x + cornerLength} ${y}`}
          stroke="#FFFFFF"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {/* Top Right */}
        <Path
          d={`M ${x + frameWidth - cornerLength} ${y} L ${x + frameWidth} ${y} L ${x + frameWidth} ${y + cornerLength}`}
          stroke="#FFFFFF"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {/* Bottom Right */}
        <Path
          d={`M ${x + frameWidth} ${y + frameHeight - cornerLength} L ${x + frameWidth} ${y + frameHeight} L ${x + frameWidth - cornerLength} ${y + frameHeight}`}
          stroke="#FFFFFF"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {/* Bottom Left */}
        <Path
          d={`M ${x + cornerLength} ${y + frameHeight} L ${x} ${y + frameHeight} L ${x} ${y + frameHeight - cornerLength}`}
          stroke="#FFFFFF"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
};

export default CardOverlay;
