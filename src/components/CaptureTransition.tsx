/**
 * CaptureTransition Component
 * Animated transition overlay for capture success and side flip
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Dimensions, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  withRepeat,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { Colors, Typography, Spacing, Animations } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const AnimatedView = Animated.createAnimatedComponent(View);

interface CaptureTransitionProps {
  /** Type of transition */
  type: 'capture' | 'flip' | 'complete' | 'processing';
  /** Whether transition is visible */
  visible: boolean;
  /** Side that was captured (for flip) */
  capturedSide?: 'FRONT' | 'BACK';
  /** Callback when transition completes */
  onComplete?: () => void;
}

/**
 * Checkmark SVG component
 */
const Checkmark: React.FC<{ size: number; color: string; progress: number }> = ({
  size,
  color,
  progress,
}) => {
  // Checkmark path from 0,0 to full
  const pathLength = 30;
  const dashOffset = pathLength * (1 - progress);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={10}
        fill="none"
        stroke={color}
        strokeWidth={2}
        opacity={0.3}
      />
      <Path
        d="M6 12l4 4 8-8"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
      />
    </Svg>
  );
};

/**
 * CaptureTransition Component
 */
export const CaptureTransition: React.FC<CaptureTransitionProps> = ({
  type,
  visible,
  capturedSide = 'FRONT',
  onComplete,
}) => {
  // Animation values
  const overlayOpacity = useSharedValue(0);
  const checkmarkScale = useSharedValue(0);
  const checkmarkProgress = useSharedValue(0);
  const flipRotation = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const textOpacity = useSharedValue(0);

  // Run animations when visible changes
  useEffect(() => {
    if (visible) {
      if (type === 'capture') {
        // Capture success animation
        overlayOpacity.value = withTiming(1, { duration: 150 });
        checkmarkScale.value = withSequence(
          withTiming(0, { duration: 0 }),
          withSpring(1.2, { damping: 8, stiffness: 200 }),
          withSpring(1, { damping: 12, stiffness: 150 })
        );
        checkmarkProgress.value = withDelay(
          100,
          withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
        );
        textOpacity.value = withDelay(300, withTiming(1, { duration: 200 }));

        // Auto-hide after animation
        setTimeout(() => {
          overlayOpacity.value = withTiming(0, { duration: 200 });
          if (onComplete) {
            setTimeout(() => runOnJS(onComplete)(), 200);
          }
        }, 800);
      } else if (type === 'flip') {
        // Flip card animation - faster
        overlayOpacity.value = withTiming(0.9, { duration: 100 });
        cardScale.value = withSequence(
          withTiming(0.95, { duration: 100 }),
          withTiming(1, { duration: 100 })
        );
        flipRotation.value = withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(180, { duration: 500, easing: Easing.inOut(Easing.cubic) })
        );
        textOpacity.value = withDelay(200, withTiming(1, { duration: 150 }));

        // No auto-complete - controlled externally
      } else if (type === 'complete') {
        // Full completion animation - faster
        overlayOpacity.value = withTiming(1, { duration: 100 });
        checkmarkScale.value = withSequence(
          withTiming(0, { duration: 0 }),
          withSpring(1.2, { damping: 8, stiffness: 200 }),
          withSpring(1, { damping: 12, stiffness: 150 })
        );
        checkmarkProgress.value = withDelay(
          100,
          withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
        );
        textOpacity.value = withDelay(200, withTiming(1, { duration: 150 }));

        // No auto-complete - controlled externally
      } else if (type === 'processing') {
        // Processing/loading animation
        overlayOpacity.value = withTiming(1, { duration: 100 });
        textOpacity.value = withTiming(1, { duration: 100 });
        // Stays visible until externally dismissed
      }
    } else {
      // Hide
      overlayOpacity.value = withTiming(0, { duration: 150 });
      checkmarkScale.value = 0;
      checkmarkProgress.value = 0;
      flipRotation.value = 0;
      textOpacity.value = 0;
    }
  }, [visible, type]);

  // Animated styles
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents: overlayOpacity.value > 0.1 ? 'auto' : 'none',
  }));

  const checkmarkContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
  }));

  const flipCardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: cardScale.value },
      { rotateY: `${flipRotation.value}deg` },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [
      { translateY: interpolate(textOpacity.value, [0, 1], [20, 0]) },
    ],
  }));

  // Don't render if not needed
  if (!visible && overlayOpacity.value === 0) {
    return null;
  }

  return (
    <AnimatedView style={[styles.overlay, overlayStyle]}>
      {/* Capture Success */}
      {type === 'capture' && (
        <View style={styles.content}>
          <AnimatedView style={[styles.checkmarkContainer, checkmarkContainerStyle]}>
            <View style={styles.checkmarkCircle}>
              <Checkmark
                size={80}
                color={Colors.success}
                progress={checkmarkProgress.value}
              />
            </View>
          </AnimatedView>
          <AnimatedView style={[styles.textContainer, textStyle]}>
            <Text style={styles.captureText}>
              {capturedSide === 'FRONT' ? 'Front Captured!' : 'Back Captured!'}
            </Text>
          </AnimatedView>
        </View>
      )}

      {/* Flip Animation */}
      {type === 'flip' && (
        <View style={styles.content}>
          <AnimatedView style={[styles.flipCard, flipCardStyle]}>
            <View style={styles.cardFace}>
              <Text style={styles.cardSideText}>
                {capturedSide === 'FRONT' ? 'RECTO ✓' : 'VERSO'}
              </Text>
            </View>
          </AnimatedView>
          <AnimatedView style={[styles.textContainer, textStyle]}>
            <Text style={styles.flipText}>Flip to Back Side</Text>
            <Text style={styles.flipSubtext}>Position the back of your card</Text>
          </AnimatedView>
        </View>
      )}

      {/* Complete Animation */}
      {type === 'complete' && (
        <View style={styles.content}>
          <AnimatedView style={[styles.checkmarkContainer, checkmarkContainerStyle]}>
            <View style={styles.completeCircle}>
              <Checkmark
                size={100}
                color={Colors.success}
                progress={checkmarkProgress.value}
              />
            </View>
          </AnimatedView>
          <AnimatedView style={[styles.textContainer, textStyle]}>
            <Text style={styles.completeText}>Scan Complete!</Text>
            <Text style={styles.completeSubtext}>Both sides captured successfully</Text>
          </AnimatedView>
        </View>
      )}

      {/* Processing/Loading Animation */}
      {type === 'processing' && (
        <View style={styles.content}>
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <View style={styles.processingSpinnerOuter}>
              <View style={styles.processingSpinnerInner} />
            </View>
          </View>
          <AnimatedView style={[styles.textContainer, textStyle]}>
            <Text style={styles.processingText}>Processing...</Text>
            <Text style={styles.processingSubtext}>Analyzing your ID card</Text>
          </AnimatedView>
        </View>
      )}
    </AnimatedView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkContainer: {
    marginBottom: Spacing.xl,
  },
  checkmarkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 200, 83, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.success,
  },
  textContainer: {
    alignItems: 'center',
  },
  captureText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.success,
    textAlign: 'center',
  },
  flipCard: {
    width: 200,
    height: 126,
    backgroundColor: Colors.backgroundLight,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    backfaceVisibility: 'hidden',
  },
  cardFace: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSideText: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  flipText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  flipSubtext: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  completeText: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    color: Colors.success,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  completeSubtext: {
    fontSize: Typography.sizes.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  processingContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  processingSpinnerOuter: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(227, 6, 19, 0.2)',
    borderTopColor: Colors.primary,
  },
  processingSpinnerInner: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(227, 6, 19, 0.1)',
    borderBottomColor: Colors.primaryLight,
  },
  processingText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  processingSubtext: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

export default CaptureTransition;
