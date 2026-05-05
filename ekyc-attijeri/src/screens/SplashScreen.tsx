// src/screens/SplashScreen.tsx
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { RippleRing } from '../components/RippleRing';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const SplashScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, isDark } = useApp();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const btnAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
      Animated.delay(200),
      Animated.timing(btnAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.center}>
        {/* Logo + Ripples */}
        <View style={styles.logoWrap}>
          <RippleRing size={90} radius={24} color={colors.gold} delay={0}   />
          <RippleRing size={90} radius={24} color={colors.gold} delay={500} />
          <RippleRing size={90} radius={24} color={colors.gold} delay={1000}/>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <AttijariLogo size={90} />
          </Animated.View>
        </View>

        {/* Nom */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center', marginTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={[styles.brandA, { color: colors.gold }]}>Attijari</Text>
            <Text style={[styles.brandB, { color: colors.sand }]}>bank</Text>
          </View>
          <Text style={[styles.arabic, { color: '#8B6A3E' }]}>البنك التجاري</Text>
          <View style={styles.ekycRow}>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.ekycText, { color: colors.textMuted }]}>e K Y C</Text>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          </View>
        </Animated.View>
      </View>

      {/* Boutons */}
      <Animated.View style={[styles.btns, { opacity: btnAnim }]}>
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: colors.gold }]}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>
            تسجيل الدخول — Se connecter
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: colors.border }]}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnSecondaryTxt, { color: colors.gold }]}>
            إنشاء حساب — Créer un compte
          </Text>
        </TouchableOpacity>
        <Text style={[styles.bct, { color: colors.textMuted }]}>{t('bct')}</Text>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:           { flex: 1, justifyContent: 'space-between', paddingBottom: 32 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoWrap:       { width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  brandA:         { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  brandB:         { fontSize: 28, fontWeight: '300', letterSpacing: 1 },
  arabic:         { fontSize: 13, letterSpacing: 2, marginTop: 4 },
  ekycRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  divLine:        { height: 0.5, width: 28 },
  ekycText:       { fontSize: 10, letterSpacing: 4 },
  btns:           { paddingHorizontal: 24, gap: 10 },
  btnPrimary:     { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  btnPrimaryTxt:  { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  btnSecondary:   { paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1.5 },
  btnSecondaryTxt:{ fontSize: 13, fontWeight: '600' },
  bct:            { fontSize: 10, textAlign: 'center', marginTop: 6 },
});