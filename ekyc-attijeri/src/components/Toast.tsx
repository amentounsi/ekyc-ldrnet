// src/components/Toast.tsx
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';

export interface ToastRef {
  show: (msg: string, color?: string) => void;
}

export const Toast = forwardRef<ToastRef>((_, ref) => {
  const { colors } = useApp();
  const [msg,   setMsg]   = useState('');
  const [color, setColor] = useState('#1D9E75');
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useImperativeHandle(ref, () => ({
    show(message: string, c = '#1D9E75') {
      if (timer.current) clearTimeout(timer.current);
      setMsg(message);
      setColor(c);
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    },
  }));

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          backgroundColor: color + '22',
          borderColor:     color + '44',
          opacity:         anim,
          transform: [{
            translateY: anim.interpolate({
              inputRange:  [0, 1],
              outputRange: [-20, 0],
            }),
          }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.txt, { color: '#fff' }]}>{msg}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position:     'absolute',
    top:          56,
    left:         14,
    right:        14,
    flexDirection:'row',
    alignItems:   'center',
    gap:          8,
    padding:      10,
    borderRadius: 10,
    borderWidth:  0.5,
    zIndex:       999,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  txt: {
    fontSize: 11,
    flex:     1,
  },
});