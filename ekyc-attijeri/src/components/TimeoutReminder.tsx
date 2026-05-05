/**
 * TimeoutReminder Component
 * Shows reminder when no card is detected for 5+ seconds
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  useSharedValue,
  withDelay,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Strings } from '../constants/cinTheme';

interface TimeoutReminderProps {
  /** Whether to show the reminder */
  visible: boolean;
  /** Number of times timeout triggered (for escalation) */
  timeoutCount?: number;
  /** Callback to dismiss */
  onDismiss?: () => void;
}

/**
 * TimeoutReminder Component
 */
export const TimeoutReminder: React.FC<TimeoutReminderProps> = ({
  visible,
  timeoutCount = 1,
  onDismiss,
}) => {
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      {
        translateY: withTiming(visible ? 0 : -20, { duration: 300 }),
      },
    ],
  }));

  if (!visible) return null;

  // Escalate message based on timeout count
  const getMessage = () => {
    if (timeoutCount >= 3) {
      return 'Please ensure you are using a REAL Tunisian CIN card. Photocopies and screen images are not accepted.';
    }
    return Strings.timeout.message;
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.content}>
        {/* Warning Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>⚠️</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{Strings.timeout.title}</Text>

        {/* Message */}
        <Text style={styles.message}>{getMessage()}</Text>

        {/* Tips */}
        <View style={styles.tipsContainer}>
          <View style={styles.tipRow}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>{Strings.timeout.tip1}</Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipBullet}>•</Text>
            <Text style={styles.tipText}>{Strings.timeout.tip2}</Text>
          </View>
        </View>

        {/* Dismiss button (optional) */}
        {onDismiss && (
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>Got it</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 120,
    left: Spacing.xl,
    right: Spacing.xl,
    zIndex: 100,
  },
  content: {
    backgroundColor: Colors.overlayDark,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    color: Colors.warning,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.md,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  tipsContainer: {
    backgroundColor: 'rgba(255, 171, 0, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  tipBullet: {
    color: Colors.warning,
    fontSize: Typography.sizes.md,
    marginRight: Spacing.sm,
  },
  tipText: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
    flex: 1,
  },
  dismissButton: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  dismissText: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.sm,
    textDecorationLine: 'underline',
  },
});

export default TimeoutReminder;
