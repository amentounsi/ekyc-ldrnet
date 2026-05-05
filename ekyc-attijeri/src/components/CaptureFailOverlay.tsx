/**
 * CaptureFailOverlay — red animated overlay shown after a failed capture
 * Shows contextual tips and a "Réessayer" button. Does NOT auto-dismiss.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

interface CaptureFailOverlayProps {
  title?: string;
  tips: string[];
  onRetry: () => void;
}

export const CaptureFailOverlay: React.FC<CaptureFailOverlayProps> = ({
  title = 'Capture échouée',
  tips,
  onRetry,
}) => {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.12] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.circle, { transform: [{ scale }] }]}>
        <Svg width="96" height="96" viewBox="0 0 96 96">
          <Circle cx="48" cy="48" r="46" fill="rgba(204,27,43,0.15)" stroke="#CC1B2B" strokeWidth="2.5" />
          <Line x1="30" y1="30" x2="66" y2="66" stroke="#CC1B2B" strokeWidth="4" strokeLinecap="round" />
          <Line x1="66" y1="30" x2="30" y2="66" stroke="#CC1B2B" strokeWidth="4" strokeLinecap="round" />
        </Svg>
      </Animated.View>

      <Text style={styles.title}>{title}</Text>

      <View style={styles.tipsContainer}>
        {tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <View style={styles.tipDot} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.85}>
        <Text style={styles.retryButtonText}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 100,
  },
  circle: {
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  tipsContainer: {
    width: '100%',
    marginBottom: 32,
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8963C',
    marginTop: 5,
    flexShrink: 0,
  },
  tipText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  retryButton: {
    backgroundColor: '#CC1B2B',
    borderRadius: 11,
    paddingVertical: 14,
    width: '80%',
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
