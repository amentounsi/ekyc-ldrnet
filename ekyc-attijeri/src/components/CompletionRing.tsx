// src/components/CompletionRing.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useApp } from '../context/AppContext';

const RADIUS      = 30;
const STROKE      = 5;
const CIRCUMF     = 2 * Math.PI * RADIUS; // ≈ 188.4

// Animated Circle wrapper
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  size?: number;
}

export const CompletionRing: React.FC<Props> = ({ size = 70 }) => {
  const { progress, steps, colors, t } = useApp();

  const animProg = useRef(new Animated.Value(CIRCUMF)).current; // commence à 0% (offset = CIRCUMF)

  useEffect(() => {
    const offset = CIRCUMF * (1 - progress / 100);
    Animated.timing(animProg, {
      toValue:         offset,
      duration:        900,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const doneCount = Object.values(steps).filter(Boolean).length;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Piste de fond */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.bgDark2}
          strokeWidth={STROKE}
        />
        {/* Arc de progression */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.gold}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMF} ${CIRCUMF}`}
          strokeDashoffset={animProg}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {/* Texte centré */}
      <View style={styles.center}>
        <Text style={[styles.pct, { color: colors.gold }]}>{progress}%</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  center: {
    position:       'absolute',
    alignItems:     'center',
    justifyContent: 'center',
  },
  pct: {
    fontSize:   14,
    fontWeight: '700',
  },
});