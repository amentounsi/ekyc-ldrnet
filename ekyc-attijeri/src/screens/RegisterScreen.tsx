// src/screens/RegisterScreen.tsx
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

export const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useApp();
  const toastRef = useRef<ToastRef>(null);

  const [fullName,  setFullName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [agreed,    setAgreed]    = useState(true);
  const [strength,  setStrength]  = useState(0);

  const checkStrength = (v: string) => {
    let s = 0;
    if (v.length >= 8)          s++;
    if (/[A-Z]/.test(v))        s++;
    if (/[0-9]/.test(v))        s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    setStrength(s);
    setPassword(v);
  };

  const strengthColors = ['#E24B4A', '#EF9F27', '#E8890C', '#1D9E75'];
  const strengthLabels = ['ضعيف', 'متوسط', 'جيد', 'قوي'];

  const handleRegister = async () => {
    if (!fullName || !email || !phone || !password) {
      toastRef.current?.show('يرجى ملء جميع الحقول', colors.red);
      return;
    }
    if (password !== confirm) {
      toastRef.current?.show('كلمة المرور غير متطابقة', colors.red);
      return;
    }
    if (!agreed) {
      toastRef.current?.show('يجب الموافقة على الشروط', colors.red);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('OTP');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.bgCard }]}>
            <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
          </TouchableOpacity>
          <AttijariLogo size={30} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.textPri }]}>Attijari eKYC</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>إنشاء حساب جديد</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.greet, { color: colors.gold }]}>مرحباً</Text>
          <Text style={[styles.title, { color: colors.textPri }]}>إنشاء حساب جديد</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Créer votre compte Attijari eKYC</Text>

          {[
            { label: 'الاسم الكامل · Nom complet',     value: fullName,  set: setFullName,  placeholder: 'Mohamed Ben Salem',      type: 'default' },
            { label: 'البريد الإلكتروني · Email',       value: email,     set: setEmail,     placeholder: 'exemple@email.com',       type: 'email-address' },
          ].map(({ label, value, set, placeholder, type }) => (
            <View key={label}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
              <TextInput
                style={[styles.inp, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPri }]}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={value}
                onChangeText={set}
                keyboardType={type as any}
                autoCapitalize="none"
              />
            </View>
          ))}

          {/* Téléphone */}
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

          {/* Mot de passe + force */}
          <Text style={[styles.label, { color: colors.textMuted }]}>كلمة المرور · Mot de passe</Text>
          <View style={styles.passRow}>
            <TextInput
              style={[styles.inp, { flex: 1, backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPri }]}
              placeholder="8 caractères minimum"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={checkStrength}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={styles.eyeBtn}>
              <Text style={{ fontSize: 16 }}>{showPass ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>

          {/* Indicateur force */}
          {password.length > 0 && (
            <View style={styles.strengthRow}>
              {[0, 1, 2, 3].map(i => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
                    { backgroundColor: i < strength ? strengthColors[strength - 1] : colors.border },
                  ]}
                />
              ))}
              <Text style={[styles.strengthLabel, { color: strength > 0 ? strengthColors[strength - 1] : colors.textMuted }]}>
                {strength > 0 ? strengthLabels[strength - 1] : ''}
              </Text>
            </View>
          )}

          {/* Confirmer */}
          <Text style={[styles.label, { color: colors.textMuted }]}>تأكيد كلمة المرور · Confirmer</Text>
          <TextInput
            style={[
              styles.inp,
              {
                backgroundColor: colors.bgInput,
                borderColor: confirm && confirm !== password ? colors.red : colors.border,
                color: colors.textPri,
              },
            ]}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showPass}
          />

          {/* CGU */}
          <TouchableOpacity
            style={styles.cguRow}
            onPress={() => setAgreed(a => !a)}
            activeOpacity={0.8}
          >
            <View style={[
              styles.checkbox,
              { backgroundColor: agreed ? colors.gold : 'transparent', borderColor: agreed ? colors.gold : colors.border },
            ]}>
              {agreed && <Text style={{ color: colors.bg, fontSize: 10, fontWeight: '700' }}>✓</Text>}
            </View>
            <Text style={[styles.cguText, { color: colors.textMuted }]}>
              أوافق على{' '}
              <Text style={{ color: colors.gold }}>شروط الاستخدام</Text>
              {' '}وسياسة الخصوصية · J'accepte les{' '}
              <Text style={{ color: colors.gold }}>CGU</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPrimary, { backgroundColor: colors.gold }]}
            onPress={handleRegister}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>إنشاء الحساب — Créer →</Text>
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>لديك حساب بالفعل؟ </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '600' }}>تسجيل الدخول</Text>
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
  title:          { fontSize: 18, fontWeight: '700', textAlign: 'right' },
  sub:            { fontSize: 11, marginTop: 2, textAlign: 'right', marginBottom: 18 },
  label:          { fontSize: 11, marginBottom: 5, textAlign: 'right' },
  inp:            { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 0.5, fontSize: 13, marginBottom: 12 },
  phoneRow:       { flexDirection: 'row', gap: 8 },
  countryCode:    { paddingHorizontal: 10, paddingVertical: 12, borderRadius: 10, borderWidth: 0.5, justifyContent: 'center' },
  countryTxt:     { fontSize: 12, fontWeight: '600' },
  passRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyeBtn:         { padding: 8 },
  strengthRow:    { flexDirection: 'row', gap: 4, marginBottom: 12, alignItems: 'center' },
  strengthBar:    { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel:  { fontSize: 10, fontWeight: '500', marginLeft: 4 },
  cguRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 18, marginTop: 4 },
  checkbox:       { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  cguText:        { fontSize: 11, flex: 1, lineHeight: 18 },
  btnPrimary:     { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 14 },
  btnPrimaryTxt:  { fontSize: 14, fontWeight: '700' },
  loginRow:       { flexDirection: 'row', justifyContent: 'center' },
});