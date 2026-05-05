// src/components/RippleRing.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

interface Props {
  size:    number;
  radius:  number;
  color?:  string;
  delay?:  number;
}

export const RippleRing: React.FC<Props> = ({
  size,
  radius,
  color = '#E8890C',
  delay = 0,
}) => {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = () => {
      scale.setValue(1);
      opacity.setValue(0.5);
      Animated.parallel([
        Animated.timing(scale, {
          toValue:         3,
          duration:        2200,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue:         0,
          duration:        2200,
          delay,
          useNativeDriver: true,
        }),
      ]).start(loop);
    };
    loop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          position:     'absolute',
          width:        size,
          height:       size,
          borderRadius: radius,
          backgroundColor: color,
        },
        { transform: [{ scale }], opacity },
      ]}
    />
  );
};