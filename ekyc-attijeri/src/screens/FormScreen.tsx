// src/screens/FormScreen.tsx
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

const SITUATIONS = [
  { key: 'Salarié',      icon: '💼', label: 'Salarié',       labelAr: 'أجير' },
  { key: 'Indépendant',  icon: '🏢', label: 'Indépendant',   labelAr: 'مستقل' },
  { key: 'Étudiant',     icon: '🎓', label: 'Étudiant',      labelAr: 'طالب' },
  { key: 'Sans emploi',  icon: '⏳', label: 'Sans emploi',   labelAr: 'بدون عمل' },
];

const REVENUS = [
  'Moins de 500 TND',
  '500 – 1 000 TND',
  '1 000 – 2 500 TND',
  'Plus de 2 500 TND',
];

const COMPTES = [
  { key: 'Courant',       icon: '🏦', label: 'Courant',       labelAr: 'جاري' },
  { key: 'Épargne',       icon: '💰', label: 'Épargne',       labelAr: 'توفير' },
  { key: 'Professionnel', icon: '💼', label: 'Professionnel', labelAr: 'مهني' },
];

export const FormScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, completeStep, updateDossier } = useApp();
  const toastRef = useRef<ToastRef>(null);

  const [telephone,    setTelephone]    = useState('');
  const [email,        setEmail]        = useState('');
  const [adresse,      setAdresse]      = useState('');
  const [situationPro, setSituationPro] = useState('');
  const [revenu,       setRevenu]       = useState('');
  const [typeCompte,   setTypeCompte]   = useState('Courant');
  const [showRevenu,   setShowRevenu]   = useState(false);

  const handleSubmit = async () => {
    // Validation basique
    if (!telephone.trim()) {
      toastRef.current?.show('⚠️ رقم الهاتف مطلوب', colors.orange);
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toastRef.current?.show('⚠️ البريد الإلكتروني غير صحيح', colors.orange);
      return;
    }
    if (!situationPro) {
      toastRef.current?.show('⚠️ يرجى اختيار الوضع المهني', colors.orange);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    await updateDossier({ telephone, email, adresse, situationPro, revenuMensuel: revenu, typeCompte });
    await completeStep(3);

    toastRef.current?.show('✓ Formulaire complété avec succès', colors.green);
    setTimeout(() => navigation.navigate('Sign'), 800);
  };

  const Section = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: colors.gold }]}>{title}</Text>
  );

  const InputField = ({
    label, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  }: {
    label: string; value: string; onChangeText: (t: string) => void;
    placeholder: string; keyboardType?: any; autoCapitalize?: any;
  }) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.bgDark2, color: colors.textPri, borderColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.bgCard }]}>
          <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <AttijariLogo size={30} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>عمر الإستمارة</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Remplissez le formulaire</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── 1. Informations personnelles ─────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="المعلومات الشخصية — Informations personnelles" />

          <InputField
            label="رقم الهاتف — Téléphone *"
            value={telephone}
            onChangeText={setTelephone}
            placeholder="+216 XX XXX XXX"
            keyboardType="phone-pad"
          />
          <InputField
            label="البريد الإلكتروني — Email *"
            value={email}
            onChangeText={setEmail}
            placeholder="exemple@email.com"
            keyboardType="email-address"
          />
          <InputField
            label="العنوان — Adresse"
            value={adresse}
            onChangeText={setAdresse}
            placeholder="Rue, Ville, Code postal"
            autoCapitalize="words"
          />
        </View>

        {/* ── 2. Situation professionnelle ─────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="الوضع المهني — Situation professionnelle *" />
          <View style={styles.optionGrid}>
            {SITUATIONS.map(s => {
              const selected = situationPro === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.optionItem,
                    {
                      backgroundColor: selected ? colors.gold + '22' : colors.bgDark2,
                      borderColor:     selected ? colors.gold : colors.border,
                    },
                  ]}
                  onPress={() => setSituationPro(s.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionIcon}>{s.icon}</Text>
                  <Text style={[styles.optionLabel, { color: selected ? colors.gold : colors.textMuted }]}>{s.label}</Text>
                  <Text style={[styles.optionLabelAr, { color: selected ? colors.gold + 'AA' : colors.textMuted + '88' }]}>{s.labelAr}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Revenu mensuel — dropdown simple */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>الدخل الشهري — Revenu mensuel</Text>
            <TouchableOpacity
              style={[styles.dropdown, { backgroundColor: colors.bgDark2, borderColor: showRevenu ? colors.gold : colors.border }]}
              onPress={() => setShowRevenu(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownTxt, { color: revenu ? colors.textPri : colors.textMuted }]}>
                {revenu || 'Sélectionner...'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{showRevenu ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showRevenu && (
              <View style={[styles.dropdownList, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                {REVENUS.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                    onPress={() => { setRevenu(r); setShowRevenu(false); }}
                  >
                    <Text style={[styles.dropdownItemTxt, { color: r === revenu ? colors.gold : colors.textPri }]}>{r}</Text>
                    {r === revenu && <Text style={{ color: colors.gold }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── 3. Type de compte ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Section title="نوع الحساب — Type de compte" />
          <View style={styles.compteRow}>
            {COMPTES.map(c => {
              const selected = typeCompte === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.compteItem,
                    {
                      backgroundColor: selected ? colors.gold + '22' : colors.bgDark2,
                      borderColor:     selected ? colors.gold : colors.border,
                    },
                  ]}
                  onPress={() => setTypeCompte(c.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.compteIcon}>{c.icon}</Text>
                  <Text style={[styles.compteLabel,   { color: selected ? colors.gold : colors.textMuted }]}>{c.label}</Text>
                  <Text style={[styles.compteLabelAr, { color: selected ? colors.gold + 'AA' : colors.textMuted + '88' }]}>{c.labelAr}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Boutons ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: colors.gold }]}
          onPress={handleSubmit}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>التالي — Suivant →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={[styles.btnSecondaryTxt, { color: colors.textSec }]}>رجوع — Retour</Text>
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
  headerTitle:    { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  headerSub:      { fontSize: 9, textAlign: 'right' },
  scroll:         { padding: 14, paddingBottom: 40 },
  card:           { borderRadius: 16, borderWidth: 0.5, padding: 14, marginBottom: 12 },
  sectionTitle:   { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, textAlign: 'right' },
  fieldWrap:      { marginBottom: 10 },
  fieldLabel:     { fontSize: 10, marginBottom: 4, textAlign: 'right' },
  input:          { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 0.5, fontSize: 13, textAlign: 'right' },
  // Situation pro
  optionGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  optionItem:     { width: '47%', padding: 10, borderRadius: 12, borderWidth: 0.5, alignItems: 'center', gap: 3 },
  optionIcon:     { fontSize: 20 },
  optionLabel:    { fontSize: 11, fontWeight: '600' },
  optionLabelAr:  { fontSize: 9 },
  // Dropdown
  dropdown:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 0.5 },
  dropdownTxt:    { fontSize: 12 },
  dropdownList:   { borderRadius: 10, borderWidth: 0.5, marginTop: 4, overflow: 'hidden' },
  dropdownItem:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5 },
  dropdownItemTxt:{ fontSize: 12 },
  // Type compte
  compteRow:      { flexDirection: 'row', gap: 8 },
  compteItem:     { flex: 1, padding: 10, borderRadius: 12, borderWidth: 0.5, alignItems: 'center', gap: 3 },
  compteIcon:     { fontSize: 20 },
  compteLabel:    { fontSize: 10, fontWeight: '600' },
  compteLabelAr:  { fontSize: 9 },
  // Boutons
  btnPrimary:     { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 8 },
  btnPrimaryTxt:  { fontSize: 13, fontWeight: '700' },
  btnSecondary:   { paddingVertical: 12, borderRadius: 14, alignItems: 'center', borderWidth: 0.5 },
  btnSecondaryTxt:{ fontSize: 12, fontWeight: '500' },
});