// src/screens/OTPScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const OTPScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t } = useApp();
  const toastRef = useRef<ToastRef>(null);
  const inputRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  const [otp,     setOtp]     = useState(['', '', '', '']);
  const [timer,   setTimer]   = useState(119);
  const [canSend, setCanSend] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) { clearInterval(interval); setCanSend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = () => {
    const m = Math.floor(timer / 60);
    const s = timer % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleChange = (val: string, idx: number) => {
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 3) inputRefs[idx + 1].current?.focus();
    if (!val && idx > 0) inputRefs[idx - 1].current?.focus();
    if (next.every(v => v) && next.join('').length === 4) {
      setTimeout(() => handleVerify(next.join('')), 100);
    }
  };

  const handleVerify = async (code?: string) => {
    const finalCode = code || otp.join('');
    if (finalCode.length < 4) {
      toastRef.current?.show('يرجى إدخال الرمز كاملاً', colors.red);
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start();
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toastRef.current?.show('✓ تم التحقق بنجاح', colors.green);
    setTimeout(() => navigation.navigate('Home'), 800);
  };

  const handleResend = () => {
    if (!canSend) return;
    setTimer(119);
    setCanSend(false);
    setOtp(['', '', '', '']);
    inputRefs[0].current?.focus();
    toastRef.current?.show('تم إعادة إرسال الرمز', colors.gold);
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
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>Attijari eKYC</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>التحقق من الهوية</Text>
        </View>
      </View>

      <View style={styles.container}>
        {/* Icône */}
        <View style={[styles.iconWrap, { backgroundColor: colors.bgCard, borderColor: colors.gold }]}>
          <Text style={{ fontSize: 32 }}>📱</Text>
        </View>

        <Text style={[styles.title, { color: colors.textPri }]}>التحقق من الهوية</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>تم إرسال رمز التحقق إلى</Text>
        <Text style={[styles.phone, { color: colors.gold }]}>+216 XX XXX XXX</Text>

        {/* OTP inputs */}
        <Animated.View style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}>
          {otp.map((val, idx) => (
            <TextInput
              key={idx}
              ref={inputRefs[idx]}
              style={[
                styles.otpInput,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: val ? colors.gold : colors.border,
                  color: colors.textPri,
                },
              ]}
              value={val}
              onChangeText={v => handleChange(v.slice(-1), idx)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
            />
          ))}
        </Animated.View>

        {/* Timer */}
        <Text style={[styles.timerTxt, { color: colors.textMuted }]}>
          إعادة الإرسال خلال{' '}
          <Text style={{ color: canSend ? colors.gold : colors.textSec, fontWeight: '600' }}>
            {canSend ? 'الآن' : formatTimer()}
          </Text>
        </Text>

        {/* Confirmer */}
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: colors.gold }]}
          onPress={() => handleVerify()}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>
            تأكيد — Confirmer ✓
          </Text>
        </TouchableOpacity>

        {/* Renvoyer */}
        <TouchableOpacity onPress={handleResend} disabled={!canSend}>
          <Text style={[styles.resendTxt, { color: canSend ? colors.gold : colors.textMuted }]}>
            لم تستلم الرمز؟ إعادة الإرسال
          </Text>
        </TouchableOpacity>
      </View>
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  backBtn:        { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerTitle:    { fontSize: 11, fontWeight: '600' },
  headerSub:      { fontSize: 9 },
  container:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconWrap:       { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title:          { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  sub:            { fontSize: 12, marginBottom: 4 },
  phone:          { fontSize: 14, fontWeight: '600', marginBottom: 28 },
  otpRow:         { flexDirection: 'row', gap: 12, marginBottom: 20 },
  otpInput:       { width: 56, height: 62, borderRadius: 12, borderWidth: 1.5, fontSize: 24, fontWeight: '700' },
  timerTxt:       { fontSize: 12, marginBottom: 24 },
  btnPrimary:     { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 14 },
  btnPrimaryTxt:  { fontSize: 14, fontWeight: '700' },
  resendTxt:      { fontSize: 12 },
});