// src/components/StepCard.tsx
import React, { useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, ViewStyle,
} from 'react-native';
import Svg, { Polyline, Path, Circle as SvgCircle, Rect, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type IconType = 'cin' | 'liveness' | 'form' | 'sign' | 'recap' | 'map';

interface Props {
  stepNum:   1 | 2 | 3 | 4 | 5;
  iconType:  IconType;
  mainText:  string;
  subText:   string;
  done:      boolean;
  onPress:   () => void;
  style?:    ViewStyle;
}

// ─── Icônes ───────────────────────────────────────────────────────────────────

const ICON_CONFIGS: Record<IconType, { bg: string; stroke: string }> = {
  cin:      { bg: '#2a2040', stroke: '#9B7FDD' },
  liveness: { bg: '#1e2a20', stroke: '#5DCA85' },
  form:     { bg: '#102a1a', stroke: '#5DCA85' },
  sign:     { bg: '#1a2040', stroke: '#7EB5F5' },
  recap:    { bg: '#2a1e10', stroke: '#EF9F27' },
  map:      { bg: '#102040', stroke: '#60B8F5' },
};

const StepIcon: React.FC<{ type: IconType }> = ({ type }) => {
  const { bg, stroke } = ICON_CONFIGS[type];
  return (
    <View style={[styles.iconBox, { backgroundColor: bg }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {type === 'cin' && (
          <>
            <Rect x="2" y="5" width="20" height="14" rx="2" />
            <Path d="M2 10h20" />
            <SvgCircle cx="7" cy="15" r="1.5" fill={stroke} stroke="none" />
          </>
        )}
        {type === 'liveness' && (
          <>
            <SvgCircle cx="12" cy="8" r="4" />
            <Path d="M6 20v-2a6 6 0 0 1 12 0v2" />
          </>
        )}
        {type === 'form' && (
          <>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Polyline points="14 2 14 8 20 8" />
            <Line x1="16" y1="13" x2="8" y2="13" />
            <Line x1="16" y1="17" x2="8" y2="17" />
            <Polyline points="10 9 9 9 8 9" />
          </>
        )}
        {type === 'sign' && (
          <>
            <Path d="M12 20h9" />
            <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </>
        )}
        {type === 'recap' && (
          <>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Polyline points="14 2 14 8 20 8" />
          </>
        )}
        {type === 'map' && (
          <>
            <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <SvgCircle cx="12" cy="10" r="3" />
          </>
        )}
      </Svg>
    </View>
  );
};

// ─── Check circle ─────────────────────────────────────────────────────────────

const CheckCircle: React.FC<{ done: boolean }> = ({ done }) => {
  const scale = useRef(new Animated.Value(done ? 1 : 0)).current;

  React.useEffect(() => {
    if (done) {
      Animated.spring(scale, {
        toValue: 1, friction: 4, useNativeDriver: true,
      }).start();
    }
  }, [done]);

  if (!done) {
    return (
      <View style={styles.checkEmpty} />
    );
  }

  return (
    <Animated.View style={[styles.checkDone, { transform: [{ scale }] }]}>
      <Svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth={2}>
        <Polyline points="2 6 5 9 10 3" />
      </Svg>
    </Animated.View>
  );
};

// ─── StepCard ─────────────────────────────────────────────────────────────────

export const StepCard: React.FC<Props> = ({
  stepNum, iconType, mainText, subText, done, onPress, style,
}) => {
  const { colors } = useApp();
  const borderAnim = useRef(new Animated.Value(0)).current;

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(borderAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.timing(borderAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
    onPress();
  };

  const borderColor = borderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [colors.border, colors.gold],
  });

  return (
    <Animated.View style={[
      styles.card,
      {
        backgroundColor: colors.bgCard,
        borderColor,
        opacity: done ? 0.85 : 1,
      },
      style,
    ]}>
      <TouchableOpacity
        style={styles.inner}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <CheckCircle done={done} />
        <View style={styles.texts}>
          <Text style={[styles.main, { color: done ? colors.green : colors.textPri }]}>
            {mainText}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>{subText}</Text>
        </View>
        <StepIcon type={iconType} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius:  16,
    borderWidth:   0.5,
    marginBottom:  8,
    overflow:      'hidden',
  },
  inner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    padding:        12,
  },
  iconBox: {
    width:        38,
    height:       38,
    borderRadius: 10,
    alignItems:   'center',
    justifyContent: 'center',
    flexShrink:   0,
  },
  texts: {
    flex:      1,
    alignItems:'flex-end',
  },
  main: {
    fontSize:   12,
    fontWeight: '500',
    textAlign:  'right',
  },
  sub: {
    fontSize:  10,
    marginTop: 2,
    textAlign: 'right',
  },
  checkEmpty: {
    width:        20,
    height:       20,
    borderRadius: 10,
    borderWidth:  1.5,
    borderColor:  '#3a3d45',
    backgroundColor: '#1e1c18',
  },
  checkDone: {
    width:          20,
    height:         20,
    borderRadius:   10,
    backgroundColor:'#1D9E75',
    alignItems:     'center',
    justifyContent: 'center',
  },
});