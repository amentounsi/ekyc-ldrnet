// src/screens/LoginScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t } = useApp();
  const toastRef = useRef<ToastRef>(null);

  const [tab,      setTab]      = useState<'email' | 'phone'>('email');
  const [email,    setEmail]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const btnAnim = useRef(new Animated.Value(1)).current;

  const handleLogin = async () => {
    if (!email && tab === 'email') {
      toastRef.current?.show('يرجى إدخال البريد الإلكتروني', colors.red);
      return;
    }
    if (!password) {
      toastRef.current?.show('يرجى إدخال كلمة المرور', colors.red);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLoading(true);
    Animated.sequence([
      Animated.timing(btnAnim, { toValue: 0.96, duration: 100, useNativeDriver: true }),
      Animated.timing(btnAnim, { toValue: 1,    duration: 100, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      setLoading(false);
      navigation.navigate('OTP');
    }, 1200);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.bgCard }]}>
            <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
          </TouchableOpacity>
          <AttijariLogo size={30} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPri }]}>Attijari eKYC</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>تسجيل الدخول</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Titre */}
          <View style={{ marginBottom: 20 }}>
            <Text style={[styles.greet, { color: colors.gold }]}>مرحباً بعودتك</Text>
            <Text style={[styles.title, { color: colors.textPri }]}>تسجيل الدخول</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>Connectez-vous à votre compte</Text>
          </View>

          {/* Tabs email / téléphone */}
          <View style={[styles.tabRow, { backgroundColor: colors.bgCard }]}>
            {(['email', 'phone'] as const).map(t2 => (
              <TouchableOpacity
                key={t2}
                style={[styles.tabItem, tab === t2 && { backgroundColor: colors.gold }]}
                onPress={() => setTab(t2)}
              >
                <Text style={[styles.tabTxt, { color: tab === t2 ? colors.bg : colors.textMuted }]}>
                  {t2 === 'email' ? 'Email' : 'Téléphone'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Formulaire */}
          {tab === 'email' ? (
            <>
              <Text style={[styles.label, { color: colors.textMuted }]}>البريد الإلكتروني · Email</Text>
              <TextInput
                style={[styles.inp, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPri }]}
                placeholder="exemple@email.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textMuted }]}>رقم الهاتف · Téléphone</Text>
              <View style={styles.phoneRow}>
                <View style={[styles.countryCode, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <Text style={[styles.countryTxt, { color: colors.gold }]}>🇹🇳 +216</Text>
                </View>
                <TextInput
                  style={[styles.inp, { flex: 1, backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPri }]}
                  placeholder="XX XXX XXX"
                  placeholderTextColor={colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}

          <Text style={[styles.label, { color: colors.textMuted }]}>كلمة المرور · Mot de passe</Text>
          <View style={styles.passRow}>
            <TextInput
              style={[styles.inp, { flex: 1, backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPri }]}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity
              onPress={() => setShowPass(p => !p)}
              style={styles.eyeBtn}
            >
              <Text style={{ fontSize: 16 }}>{showPass ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          {/* Mot de passe oublié */}
          <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: 18 }}>
            <Text style={[styles.forgot, { color: colors.gold }]}>
              نسيت كلمة المرور؟ — Mot de passe oublié ?
            </Text>
          </TouchableOpacity>

          {/* Bouton connexion */}
          <Animated.View style={{ transform: [{ scale: btnAnim }] }}>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: colors.gold }]}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>
                {loading ? '...' : 'دخول — Connexion'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Séparateur */}
          <View style={styles.divider}>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.divTxt, { color: colors.textMuted }]}>أو — ou</Text>
            <View style={[styles.divLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Google */}
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={() => toastRef.current?.show('Google Sign-In — برمجة قريباً', colors.gold)}
          >
            <Text style={{ fontSize: 16 }}>G</Text>
            <Text style={[styles.socialTxt, { color: colors.textSec }]}>Continuer avec Google</Text>
          </TouchableOpacity>

          {/* Facebook */}
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={() => toastRef.current?.show('Facebook Sign-In — برمجة قريباً', colors.gold)}
          >
            <Text style={{ fontSize: 16, color: '#1877F2' }}>f</Text>
            <Text style={[styles.socialTxt, { color: colors.textSec }]}>Continuer avec Facebook</Text>
          </TouchableOpacity>

          {/* Lien inscription */}
          <View style={styles.registerRow}>
            <Text style={[{ color: colors.textMuted, fontSize: 12 }]}>ليس لديك حساب؟ </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={[{ color: colors.gold, fontSize: 12, fontWeight: '600' }]}>إنشاء حساب</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll:         { padding: 20, paddingBottom: 40 },
  greet:          { fontSize: 11, marginBottom: 4 },
  title:          { fontSize: 20, fontWeight: '700', textAlign: 'right' },
  sub:            { fontSize: 11, marginTop: 2, textAlign: 'right' },
  tabRow:         { flexDirection: 'row', borderRadius: 10, padding: 3, marginBottom: 16 },
  tabItem:        { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  tabTxt:         { fontSize: 12, fontWeight: '500' },
  label:          { fontSize: 11, marginBottom: 5, textAlign: 'right' },
  inp:            { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 0.5, fontSize: 13, marginBottom: 12 },
  phoneRow:       { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countryCode:    { paddingHorizontal: 10, paddingVertical: 12, borderRadius: 10, borderWidth: 0.5 },
  countryTxt:     { fontSize: 12, fontWeight: '600' },
  passRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyeBtn:         { padding: 8 },
  forgot:         { fontSize: 11 },
  btnPrimary:     { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  btnPrimaryTxt:  { fontSize: 14, fontWeight: '700' },
  divider:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  divLine:        { flex: 1, height: 0.5 },
  divTxt:         { fontSize: 11 },
  socialBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 0.5, marginBottom: 10 },
  socialTxt:      { fontSize: 13, fontWeight: '500' },
  registerRow:    { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
});