/**
 * CaptureSuccessOverlay — green animated overlay shown after a successful capture
 * Auto-dismisses after 1500ms by calling onComplete
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

interface CaptureSuccessOverlayProps {
  message: string;
  subMessage?: string;
  onComplete: () => void;
}

const AnimatedPath = Animated.createAnimatedComponent(Path as any);

export const CaptureSuccessOverlay: React.FC<CaptureSuccessOverlayProps> = ({
  message,
  subMessage,
  onComplete,
}) => {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const dashOffset = useRef(new Animated.Value(36)).current;

  useEffect(() => {
    // Pulse ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // Draw checkmark
    Animated.timing(dashOffset, {
      toValue: 0,
      duration: 500,
      useNativeDriver: false,
    }).start();

    // Auto-dismiss
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.12] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.0] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.circle, { transform: [{ scale }], opacity: pulseOpacity }]}>
        <Svg width="96" height="96" viewBox="0 0 96 96">
          <Circle cx="48" cy="48" r="46" fill="rgba(29,185,84,0.15)" stroke="#1DB954" strokeWidth="2.5" />
          <AnimatedPath
            d="M28 48 L42 62 L68 34"
            stroke="#1DB954"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="48"
            strokeDashoffset={dashOffset}
          />
        </Svg>
      </Animated.View>

      <Text style={styles.message}>{message}</Text>
      {subMessage ? <Text style={styles.subMessage}>{subMessage}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  circle: {
    marginBottom: 20,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subMessage: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
  },
});
