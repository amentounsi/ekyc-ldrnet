// src/screens/PINScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
const SUB  = ['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','',''];

export const PINScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, hasPin, pinValue, setPin, bioEnabled } = useApp();
  const toastRef   = useRef<ToastRef>(null);
  const [pin,      setLocalPin] = useState('');
  const [mode,     setMode]     = useState<'enter' | 'create' | 'confirm'>(!hasPin ? 'create' : 'enter');
  const [firstPin, setFirstPin] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleKey = async (key: string) => {
    if (key === '') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (key === '⌫') {
      setLocalPin(p => p.slice(0, -1));
      return;
    }

    const next = pin + key;
    setLocalPin(next);

    if (next.length === 4) {
      setTimeout(() => handleComplete(next), 150);
    }
  };

  const handleComplete = async (code: string) => {
    if (mode === 'enter') {
      if (code === pinValue) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toastRef.current?.show(t('toastPIN'), colors.green);
        setTimeout(() => navigation.navigate('Home'), 700);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        shake();
        toastRef.current?.show('رمز خاطئ — Code incorrect', colors.red);
        setLocalPin('');
      }
    } else if (mode === 'create') {
      setFirstPin(code);
      setMode('confirm');
      setLocalPin('');
    } else {
      if (code === firstPin) {
        await setPin(code);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toastRef.current?.show('✓ تم حفظ رمز PIN بنجاح', colors.green);
        setTimeout(() => navigation.navigate('Settings'), 700);
      } else {
        shake();
        toastRef.current?.show('الرمزان غير متطابقان', colors.red);
        setLocalPin('');
        setMode('create');
        setFirstPin('');
      }
    }
  };

  const handleBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:  'Utilisez votre biométrie',
        fallbackLabel:  'Utiliser le PIN',
      });
      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toastRef.current?.show(t('toastBioOn'), colors.green);
        setTimeout(() => navigation.navigate('Home'), 700);
      }
    } catch (e) {
      toastRef.current?.show('Biométrie non disponible sur web', colors.orange);
    }
  };

  const titles = {
    enter:   'أدخل رمز الأمان',
    create:  'أنشئ رمز PIN جديد',
    confirm: 'أكد رمز PIN',
  };
  const subs = {
    enter:   'Entrez votre code PIN',
    create:  'Choisissez un code à 4 chiffres',
    confirm: 'Confirmez votre code PIN',
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.bgCard }]}>
          <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <AttijariLogo size={30} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>PIN Sécurité</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>رمز الأمان</Text>
        </View>
      </View>

      <View style={styles.container}>
        {/* Icône */}
        <View style={[styles.iconWrap, { backgroundColor: colors.bgCard, borderColor: colors.gold }]}>
          <Text style={{ fontSize: 28 }}>🔐</Text>
        </View>

        <Text style={[styles.title, { color: colors.textPri }]}>{titles[mode]}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>{subs[mode]}</Text>

        {/* Indicateurs PIN */}
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i < pin.length ? colors.gold : 'transparent',
                  borderColor:     i < pin.length ? colors.gold : colors.border,
                },
              ]}
            />
          ))}
        </Animated.View>

        {/* Clavier numérique */}
        <View style={styles.keyboard}>
          {KEYS.map((key, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.keyBtn,
                {
                  backgroundColor: key === '' ? 'transparent' : colors.bgCard,
                  borderColor:     key === '' ? 'transparent' : colors.border,
                },
              ]}
              onPress={() => handleKey(key)}
              activeOpacity={key === '' ? 1 : 0.7}
              disabled={key === ''}
            >
              <Text style={[styles.keyMain, { color: key === '⌫' ? colors.gold : colors.textPri }]}>
                {key}
              </Text>
              {SUB[idx] ? (
                <Text style={[styles.keySub, { color: colors.textMuted }]}>{SUB[idx]}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        {/* Biométrie */}
        {mode === 'enter' && bioEnabled && (
          <TouchableOpacity onPress={handleBiometric} style={styles.bioBtn}>
            <Text style={{ fontSize: 24 }}>👆</Text>
            <Text style={[styles.bioTxt, { color: colors.textMuted }]}>Face ID / Empreinte</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.cancelTxt, { color: colors.textMuted }]}>
            {mode === 'enter' ? 'نسيت الرمز؟' : 'إلغاء — Annuler'}
          </Text>
        </TouchableOpacity>
      </View>
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  backBtn:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 11, fontWeight: '600' },
  headerSub:   { fontSize: 9 },
  container:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  iconWrap:    { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:       { fontSize: 16, fontWeight: '700' },
  sub:         { fontSize: 11, marginBottom: 16 },
  dotsRow:     { flexDirection: 'row', gap: 14, marginBottom: 24 },
  dot:         { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  keyboard:    { width: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 16 },
  keyBtn:      { width: 68, height: 58, borderRadius: 12, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', gap: 1 },
  keyMain:     { fontSize: 20, fontWeight: '500' },
  keySub:      { fontSize: 8, letterSpacing: 1 },
  bioBtn:      { alignItems: 'center', gap: 4, marginBottom: 8 },
  bioTxt:      { fontSize: 11 },
  cancelTxt:   { fontSize: 11, marginTop: 4 },
});