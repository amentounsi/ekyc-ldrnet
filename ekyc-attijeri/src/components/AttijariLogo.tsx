// src/components/AttijariLogo.tsx
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';

interface Props {
  size?: number;
}

export const AttijariLogo: React.FC<Props> = ({ size = 80 }) => {
  const radius = Math.round(size * 0.26);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Fond jaune haut */}
        <Rect x="0" y="0" width="100" height="55" fill="#F5C518" />
        {/* Fond orange/rouge bas */}
        <Rect x="0" y="55" width="100" height="45" fill="#D4500A" />
        {/* Vagues noires — signature Attijari */}
        <Path
          d="M0 55 L0 34 L18 11 L32 31 L50 7 L68 31 L82 13 L100 33 L100 55 Z"
          fill="#1a0e05"
        />
        {/* Petit carré signature */}
        <Rect x="13" y="37" width="7" height="7" rx="1" fill="#1a0e05" opacity="0.85" />
      </Svg>
    </View>
  );
};