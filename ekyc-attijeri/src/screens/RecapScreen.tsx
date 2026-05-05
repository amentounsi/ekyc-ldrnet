// src/screens/RecapScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const RecapScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, dossier, steps, completeStep, rating, setRating } = useApp();
  const toastRef  = useRef<ToastRef>(null);
  const [submitting, setSubmitting] = useState(false);

  const fields = [
    { label: 'رقم البطاقة',      value: dossier.cin_number || '12 345 678',           mono: true  },
    { label: 'الاسم',             value: dossier.nom_ar     || 'بن سالم محمد أمين',    rtl:  true  },
    { label: 'Nom',               value: dossier.nom_lat    || 'BEN SALEM Mohamed',    mono: false },
    { label: 'Date naissance',    value: dossier.dob        || '15 / 03 / 1990',       mono: false },
    { label: 'Lieu naissance',    value: dossier.pob        || 'Tunis',                mono: false },
    { label: 'Expiration',        value: dossier.expiry     || '28 / 06 / 2028',       warn: true  },
  ];

  const stepStatus = [
    { label: 'CIN Scan',           done: steps[1] },
    { label: 'Liveness',           done: steps[2] },
    { label: 'Signature',          done: steps[3] },
    { label: 'Formulaire',         done: steps[4] },
  ];

  const handleExportPDF = async () => {
    try {
      const html = `
        <html><body style="font-family:Arial;padding:20px;background:#fff">
        <h1 style="color:#E8890C">Attijari Bank — Dossier eKYC</h1>
        <hr style="border-color:#E8890C"/>
        <h2>Données CIN</h2>
        <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
          <tr><td>CIN N°</td><td>${dossier.cin_number || '12345678'}</td></tr>
          <tr><td>Nom</td><td>${dossier.nom_lat || 'BEN SALEM Mohamed'}</td></tr>
          <tr><td>Date naissance</td><td>${dossier.dob || '1990-03-15'}</td></tr>
        </table>
        <h2>Statut des étapes</h2>
        <ul>
          ${stepStatus.map(s => `<li>${s.label}: ${s.done ? '✓ Validé' : '⏳ En attente'}</li>`).join('')}
        </ul>
        <p style="color:gray;font-size:12px">Généré le ${new Date().toLocaleDateString('fr-TN')}</p>
        </body></html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
      toastRef.current?.show(t('toastPDF'), colors.blue);
    } catch (e) {
      toastRef.current?.show('Export PDF non disponible sur web', colors.orange);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await completeStep(4);
    toastRef.current?.show(t('toastSubmit'), colors.green);
    setTimeout(() => {
      setSubmitting(false);
      navigation.navigate('Card');
    }, 1000);
  };

  const handleRate = async (n: number) => {
    setRating(n);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const msgs = ['😐 يمكن التحسين', '🙂 جيد', '😊 جيد جداً', '😃 ممتاز', '🌟 رائع جداً!'];
    toastRef.current?.show(msgs[n - 1], colors.gold);
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
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>{t('step4Main')}</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>4 / 5</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPri }]}>{t('step4Main')}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>مراجعة الملف قبل الإرسال</Text>

        {/* Données CIN */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.gold }]}>بيانات الهوية</Text>
          {fields.map(({ label, value, mono, rtl, warn }) => (
            <View key={label} style={[styles.fieldRow, { borderBottomColor: colors.bgDark2 }]}>
              <Text style={[styles.fieldVal, {
                color:      warn ? colors.orange : colors.textPri,
                fontFamily: mono ? 'monospace' : undefined,
                textAlign:  rtl  ? 'right' : 'left',
              }]}>{value}</Text>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Statut étapes */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.gold }]}>حالة المراحل</Text>
          {stepStatus.map(({ label, done }) => (
            <View key={label} style={[styles.fieldRow, { borderBottomColor: colors.bgDark2 }]}>
              <Text style={[styles.fieldVal, { color: done ? colors.green : colors.orange }]}>
                {done ? '✓ Validé' : '⏳ En attente'}
              </Text>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Notation */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{t('rateExp')}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => handleRate(n)} activeOpacity={0.7}>
                <Text style={[styles.star, { color: n <= rating ? '#F5C518' : colors.border }]}>
                  {n <= rating ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Boutons */}
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: submitting ? colors.green : colors.gold }]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>
            {submitting ? '✓ ...' : t('submitDossier')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: colors.border }]}
          onPress={handleExportPDF}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnSecondaryTxt, { color: colors.textSec }]}>{t('exportPDF')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  scroll:         { padding: 16, paddingBottom: 40 },
  title:          { fontSize: 15, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  sub:            { fontSize: 11, textAlign: 'right', marginBottom: 14 },
  card:           { borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 12 },
  cardTitle:      { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  fieldRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5 },
  fieldLabel:     { fontSize: 11 },
  fieldVal:       { fontSize: 12, fontWeight: '500' },
  starsRow:       { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  star:           { fontSize: 28 },
  btnPrimary:     { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimaryTxt:  { fontSize: 14, fontWeight: '700' },
  btnSecondary:   { paddingVertical: 12, borderRadius: 14, alignItems: 'center', borderWidth: 0.5 },
  btnSecondaryTxt:{ fontSize: 13 },
});