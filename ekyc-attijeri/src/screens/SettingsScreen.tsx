// src/screens/SettingsScreen.tsx
import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';
import type { Lang } from '../constants/translations';
import { CRCModal } from './HomeScreen'; // ← import du modal partagé

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, lang, setLang, isDark, toggleTheme, bioEnabled, setBio, steps } = useApp();
  const toastRef = useRef<ToastRef>(null);
  const [showCRC, setShowCRC] = useState(false);
  const progress = Math.round((Object.values(steps).filter(Boolean).length / 5) * 100);

  const langs: Array<{ code: Lang; label: string }> = [
    { code: 'ar', label: 'العربية'  },
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English'  },
    { code: 'tn', label: 'تونسي'    },
  ];

  const handleBio = async (v: boolean) => {
    await setBio(v);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toastRef.current?.show(v ? t('toastBioOn') : t('toastBioOff'), v ? colors.green : colors.textMuted);
  };

  const handleLogout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    toastRef.current?.show('تم تسجيل الخروج — Déconnecté', colors.red);
    setTimeout(() => navigation.navigate('Splash'), 1000);
  };

  const Section = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: colors.gold }]}>{title}</Text>
  );

  const Row = ({
    icon, title, sub, right, onPress, danger,
  }: {
    icon: string; title: string; sub?: string; right?: React.ReactNode;
    onPress?: () => void; danger?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.bgDark2 }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.redBg : colors.bgDark2 }]}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: danger ? colors.red : colors.textPri }]}>{title}</Text>
        {sub && <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
      </View>
      {right ?? (onPress && <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.bgCard }]}>
          <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <AttijariLogo size={30} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>{t('settings')}</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>الإعدادات</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profil */}
        <View style={[styles.profileCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.bgDark2, borderColor: colors.gold }]}>
            <Text style={{ fontSize: 24 }}>👤</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.textPri }]}>Mohamed Ben Salem</Text>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]}>m.bensalem@email.com</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: colors.greenBg }]}>
                <Text style={[styles.badgeTxt, { color: colors.green }]}>✓ Vérifié</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.orangeBg }]}>
                <Text style={[styles.badgeTxt, { color: colors.orange }]}>eKYC {progress}%</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="الحساب — Compte" />
          <Row icon="👤" title="الملف الشخصي" sub="Modifier vos informations" onPress={() => {}} />
          <Row icon="🪪" title="ملف eKYC" sub={`Dossier · ${progress}% complété`} onPress={() => navigation.navigate('Home')} />
          <Row icon="🔒" title="تغيير كلمة المرور" sub="Modifier le mot de passe" onPress={() => {}} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="التفضيلات — Préférences" />
          <Row
            icon="🌙" title={t('darkMode')} sub="Dark mode"
            right={
              <Switch value={isDark} onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.gold }} thumbColor="#fff" />
            }
          />
          <Row
            icon="🔔" title={t('notifications')} sub="Notifications push"
            right={
              <Switch value={true}
                onValueChange={() => toastRef.current?.show('Notifications mises à jour', colors.gold)}
                trackColor={{ false: colors.border, true: colors.gold }} thumbColor="#fff" />
            }
          />
          <Row
            icon="👆" title={t('biometric')} sub="Face ID / Empreinte"
            right={
              <Switch value={bioEnabled} onValueChange={handleBio}
                trackColor={{ false: colors.border, true: colors.gold }} thumbColor="#fff" />
            }
          />
          <Row icon="🔐" title={t('pinSecurity')} sub="Code à 4 chiffres"
            onPress={() => navigation.navigate('PIN')} />
        </View>

        {/* Langue */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="اللغة — Langue" />
          <View style={styles.langGrid}>
            {langs.map(({ code, label }) => (
              <TouchableOpacity
                key={code}
                style={[
                  styles.langPill,
                  {
                    backgroundColor: lang === code ? colors.gold + '22' : colors.bgDark2,
                    borderColor:     lang === code ? colors.gold : colors.border,
                  },
                ]}
                onPress={() => { setLang(code); toastRef.current?.show('اللغة تم تغييرها', colors.gold); }}
              >
                <Text style={[styles.langTxt, { color: lang === code ? colors.gold : colors.textSec }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Support — avec CRC mis en avant */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="الدعم — Support" />

          {/* CRC — bouton mis en avant avec style spécial */}
          <TouchableOpacity
            style={[styles.crcRow, { backgroundColor: colors.gold + '15', borderColor: colors.gold }]}
            onPress={() => setShowCRC(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.crcIcon, { backgroundColor: colors.gold }]}>
              <Text style={{ fontSize: 18 }}>📞</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={[styles.crcTitle, { color: colors.gold }]}>Centre de Relation Client</Text>
              <Text style={[styles.crcSub, { color: colors.textMuted }]}>71 111 300 · Lun–Ven 8h–18h · Sam 8h–13h</Text>
            </View>
            <Text style={{ color: colors.gold, fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          <Row icon="❓" title="مساعدة FAQ" sub="Centre d'aide" onPress={() => navigation.navigate('Chat')} />
          <Row icon="🗺️" title="أقرب وكالة" sub="Trouver une agence" onPress={() => navigation.navigate('Map')} />
          <Row icon="ℹ️" title="حول التطبيق" sub="Version 1.0.0 · © 2025 Attijari Bank" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Row icon="🚪" title="تسجيل الخروج" sub="Se déconnecter" onPress={handleLogout} danger />
        </View>

        <Text style={[styles.version, { color: colors.textMuted }]}>
          Attijari eKYC v1.0.0 · مُرخَّص من البنك المركزي التونسي
        </Text>
      </ScrollView>

      {/* Modal CRC partagé */}
      <CRCModal visible={showCRC} onClose={() => setShowCRC(false)} colors={colors} />

      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  backBtn:      { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 11, fontWeight: '600' },
  headerSub:    { fontSize: 9 },
  profileCard:  { flexDirection: 'row', gap: 14, alignItems: 'center', margin: 14, padding: 16, borderRadius: 16, borderWidth: 0.5 },
  avatar:       { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  profileInfo:  { flex: 1 },
  profileName:  { fontSize: 14, fontWeight: '600', textAlign: 'right' },
  profileEmail: { fontSize: 11, marginTop: 2, textAlign: 'right' },
  badgeRow:     { flexDirection: 'row', gap: 6, marginTop: 6, justifyContent: 'flex-end' },
  badge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeTxt:     { fontSize: 10, fontWeight: '500' },
  card:         { marginHorizontal: 14, marginBottom: 12, borderRadius: 16, borderWidth: 0.5, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  sectionTitle: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5 },
  rowIcon:      { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowText:      { flex: 1, alignItems: 'flex-end' },
  rowTitle:     { fontSize: 12, fontWeight: '500', textAlign: 'right' },
  rowSub:       { fontSize: 10, marginTop: 1, textAlign: 'right' },
  chevron:      { fontSize: 18 },
  langGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  langPill:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5 },
  langTxt:      { fontSize: 12, fontWeight: '500' },
  version:      { textAlign: 'center', fontSize: 10, marginVertical: 16 },
  // CRC Row spéciale
  crcRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  crcIcon:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  crcTitle:     { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  crcSub:       { fontSize: 10, marginTop: 2, textAlign: 'right' },
});