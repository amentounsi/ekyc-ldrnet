// src/screens/HomeScreen.tsx
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, StatusBar, Modal, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { CompletionRing } from '../components/CompletionRing';
import { StepCard } from '../components/StepCard';
import { Toast, ToastRef } from '../components/Toast';

type RootStackParamList = {
  Home: undefined; CIN: undefined; Liveness: undefined;
  Form: undefined; Sign: undefined; Recap: undefined;
  Map: undefined; Settings: undefined; PIN: undefined; Chat: undefined;
};
type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;
interface Props { navigation: Nav; }

// ─── Bottom Navbar ────────────────────────────────────────────────────────────

type NavTab = 'home' | 'map' | 'chat' | 'settings';

const NAV_ITEMS: { key: NavTab; labelAr: string; dest: keyof RootStackParamList; icon: React.FC<{ active: boolean; color: string }> }[] = [
  {
    key: 'home', labelAr: 'الرئيسية', dest: 'Home',
    icon: ({ color }) => (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </Svg>
    ),
  },
  {
    key: 'map', labelAr: 'الوكالات', dest: 'Map',
    icon: ({ color }) => (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <SvgCircle cx={12} cy={10} r={3} />
      </Svg>
    ),
  },
  {
    key: 'chat', labelAr: 'دعم', dest: 'Chat',
    icon: ({ color }) => (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </Svg>
    ),
  },
  {
    key: 'settings', labelAr: 'حسابي', dest: 'Settings',
    icon: ({ color }) => (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <SvgCircle cx={12} cy={8} r={4} />
        <Path d="M6 20v-2a6 6 0 0112 0v2" />
      </Svg>
    ),
  },
];

const BottomNav: React.FC<{ active: NavTab; onPress: (tab: NavTab, dest: keyof RootStackParamList) => void; colors: any }> = ({ active, onPress, colors }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[
      navS.bar,
      {
        backgroundColor: colors.bg,
        borderTopColor: colors.border,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
      },
    ]}>
      {NAV_ITEMS.map(({ key, labelAr, dest, icon: Icon }) => {
        const isActive = active === key;
        const color = isActive ? colors.gold : '#444';
        return (
          <TouchableOpacity
            key={key}
            style={navS.item}
            onPress={() => onPress(key, dest)}
            activeOpacity={0.7}
          >
            <Icon active={isActive} color={color} />
            <Text style={[navS.label, { color }]}>{labelAr}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const navS = StyleSheet.create({
  bar:   { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 0.5, paddingTop: 6 },
  item:  { alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 4 },
  label: { fontSize: 9 },
});

// ─── Modal CRC ────────────────────────────────────────────────────────────────

export const CRCModal = ({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: any }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <TouchableOpacity style={crcS.overlay} activeOpacity={1} onPress={onClose}>
      <TouchableOpacity activeOpacity={1} style={[crcS.card, { backgroundColor: colors.bgCard }]}>
        <View style={[crcS.header, { borderBottomColor: colors.border }]}>
          <Text style={{ fontSize: 24 }}>📞</Text>
          <View style={{ flex: 1 }}>
            <Text style={[crcS.title, { color: colors.textPri }]}>Centre de Relation Client</Text>
            <Text style={[crcS.sub,   { color: colors.textMuted }]}>Attijari Bank</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.textMuted, fontSize: 22 }}>×</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[crcS.callBig, { backgroundColor: colors.gold }]}
          onPress={() => Linking.openURL('tel:71111300')}
        >
          <Text style={{ fontSize: 26 }}>📞</Text>
          <View>
            <Text style={[crcS.callNum, { color: colors.bg }]}>71 111 300</Text>
            <Text style={[crcS.callSub, { color: colors.bg + 'CC' }]}>Appel non surtaxé</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[crcS.callSmall, { backgroundColor: colors.bgDark2, borderColor: colors.border }]}
          onPress={() => Linking.openURL('tel:+21671111300')}
        >
          <Text style={{ fontSize: 16 }}>🌍</Text>
          <Text style={[crcS.callSmallTxt, { color: colors.textPri }]}>+216 71 111 300 (depuis l'étranger)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[crcS.callSmall, { backgroundColor: colors.bgDark2, borderColor: colors.border }]}
          onPress={() => Linking.openURL('mailto:relation.client@attijaribank.com.tn')}
        >
          <Text style={{ fontSize: 16 }}>✉️</Text>
          <Text style={[crcS.callSmallTxt, { color: colors.blue }]}>relation.client@attijaribank.com.tn</Text>
        </TouchableOpacity>

        <View style={[crcS.box, { backgroundColor: colors.bgDark2, borderColor: colors.border }]}>
          <Text style={[crcS.boxTitle, { color: colors.textPri }]}>🕐 Horaires</Text>
          <Text style={[crcS.boxLine,  { color: colors.textMuted }]}>Lun–Ven : 8h–18h</Text>
          <Text style={[crcS.boxLine,  { color: colors.textMuted }]}>Samedi : 8h–13h</Text>
          <Text style={[crcS.boxLine,  { color: colors.textMuted }]}>Ramadan : Lun–Ven 8h–15h</Text>
        </View>

        <View style={{ gap: 5, marginTop: 10 }}>
          {[
            'Suivre vos dossiers en cours',
            'Informations sur nos agences et horaires',
            'Fixer un RDV avec un chargé de clientèle',
            'Réclamations et suggestions',
          ].map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ color: colors.gold }}>✓</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, flex: 1 }}>{s}</Text>
            </View>
          ))}
        </View>

        <View style={[crcS.box, { backgroundColor: colors.bgDark2, borderColor: colors.border, marginTop: 10 }]}>
          <Text style={[crcS.boxTitle, { color: colors.textPri }]}>⚖️ Médiateur — M. Zoubeir Ben Jemaa</Text>
          <TouchableOpacity onPress={() => Linking.openURL('tel:+21698270046')}>
            <Text style={[crcS.boxLine, { color: colors.blue }]}>+216 98 270 046</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:zoubeirbenjemaa@gmail.com')}>
            <Text style={[crcS.boxLine, { color: colors.blue }]}>zoubeirbenjemaa@gmail.com</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

const crcS = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  card:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16, marginBottom: 16, borderBottomWidth: 0.5 },
  title:        { fontSize: 15, fontWeight: '700' },
  sub:          { fontSize: 11 },
  callBig:      { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 16, marginBottom: 10 },
  callNum:      { fontSize: 22, fontWeight: '800' },
  callSub:      { fontSize: 11 },
  callSmall:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 0.5, marginBottom: 8 },
  callSmallTxt: { fontSize: 13, fontWeight: '500' },
  box:          { padding: 12, borderRadius: 12, borderWidth: 0.5, gap: 4 },
  boxTitle:     { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  boxLine:      { fontSize: 12 },
});

// ═══════════════════════════════════════════════════════════════════════════════
export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, lang, setLang, steps, progress, isDark, toggleTheme, isOnline } = useApp();
  const toastRef  = useRef<ToastRef>(null);
  const [showCRC, setShowCRC]     = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]));
    const timer = setTimeout(() => pulse.start(), 2000);
    return () => { clearTimeout(timer); pulse.stop(); };
  }, []);

  const doneCount = Object.values(steps).filter(Boolean).length;

  const STEPS = [
    { num: 1 as const, icon: 'cin'      as const, main: t('step1Main'), sub: t('step1Sub'), dest: 'CIN'      },
    { num: 2 as const, icon: 'liveness' as const, main: t('step2Main'), sub: t('step2Sub'), dest: 'Liveness' },
    { num: 3 as const, icon: 'form'     as const, main: t('step3Main'), sub: t('step3Sub'), dest: 'Form'     },
    { num: 4 as const, icon: 'sign'     as const, main: t('step4Main'), sub: t('step4Sub'), dest: 'Sign'     },
    { num: 5 as const, icon: 'recap'    as const, main: t('step5Main'), sub: t('step5Sub'), dest: 'Recap'    },
  ];

  const langs = [
    { code: 'ar' as const, label: 'ع'  },
    { code: 'fr' as const, label: 'FR' },
    { code: 'en' as const, label: 'EN' },
    { code: 'tn' as const, label: 'تن' },
  ];

  const handleNavPress = async (tab: NavTab, dest: keyof RootStackParamList) => {
    await Haptics.selectionAsync().catch(() => {});
    if (dest === 'Home') {
      setActiveTab('home');
      return;
    }
    setActiveTab(tab);
    navigation.navigate(dest as any);
  };

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <AttijariLogo size={32} />
        <View style={S.headerText}>
          <Text style={[S.headerTitle, { color: colors.textPri }]}>{t('appName')}</Text>
          <Text style={[S.headerSub,   { color: colors.textMuted }]}>{t('appSub')}</Text>
        </View>
        <View style={S.langRow}>
          {langs.map(({ code, label }) => (
            <TouchableOpacity
              key={code}
              onPress={() => setLang(code)}
              style={[
                S.langPill,
                {
                  backgroundColor: lang === code ? colors.gold : 'transparent',
                  borderColor:     lang === code ? colors.gold : colors.border,
                },
              ]}
            >
              <Text style={[S.langText, { color: lang === code ? colors.bg : colors.textMuted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity onPress={toggleTheme} style={[S.themeBtn, { backgroundColor: colors.bgCard }]}>
          <Text style={{ fontSize: 14 }}>{isDark ? '🌙' : '☀️'}</Text>
        </TouchableOpacity>
      </View>

      {/* Contenu scrollable */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={S.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!isOnline && (
          <View style={[S.offlineBanner, { backgroundColor: colors.orangeBg }]}>
            <View style={[S.offlineDot, { backgroundColor: colors.orange }]} />
            <Text style={[S.offlineText, { color: colors.orange }]}>{t('offlineBanner')}</Text>
          </View>
        )}

        {/* Score circulaire */}
        <Animated.View style={[
          S.progressCard,
          {
            backgroundColor: colors.bgCard,
            borderColor:     colors.border,
            opacity:         fadeAnim,
            transform:       [{ translateY: slideAnim }],
          },
        ]}>
          <CompletionRing size={70} />
          <View style={S.progressInfo}>
            <Text style={[S.progressTitle, { color: colors.textPri }]}>{t('dossierTitle')}</Text>
            <Text style={[S.progressSub,   { color: colors.textMuted }]}>{doneCount} / 5 {t('dossierSub')}</Text>
            <View style={[S.barBg, { backgroundColor: colors.bgDark2 }]}>
              <View style={[S.barFill, { backgroundColor: colors.gold, width: `${progress}%` as any }]} />
            </View>
          </View>
        </Animated.View>

        {/* Titre section */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={[S.sectionTitle, { color: colors.gold }]}>{t('stepsRequired')}</Text>
        </Animated.View>

        {/* Steps 1–5 */}
        {STEPS.map(({ num, icon, main, sub, dest }, idx) => (
          <Animated.View key={num} style={{
            opacity: fadeAnim,
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange:  [0, 24],
                outputRange: [0, 24 + idx * 8],
              }),
            }],
          }}>
            <StepCard
              stepNum={num}
              iconType={icon}
              mainText={main}
              subText={sub}
              done={steps[num]}
              onPress={() => navigation.navigate(dest as any)}
            />
          </Animated.View>
        ))}

        {/* Utilitaire Maps */}
        <Animated.View style={{ opacity: fadeAnim, marginTop: 6 }}>
          <View style={[S.utilitySection, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={[S.utilityHeader, { borderBottomColor: colors.border }]}>
              <Text style={[S.utilityLabel, { color: colors.gold }]}>خدمات إضافية</Text>
            </View>
            <TouchableOpacity
              style={S.utilityRow}
              onPress={() => navigation.navigate('Map')}
              activeOpacity={0.7}
            >
              <View style={[S.utilityIcon, { backgroundColor: '#102040' }]}>
                <Text style={{ fontSize: 18 }}>📍</Text>
              </View>
              <View style={S.utilityText}>
                <Text style={[S.utilityMain, { color: colors.textPri }]}>أقرب الوكالات والموزعات</Text>
                <Text style={[S.utilitySub,  { color: colors.textMuted }]}>207 agences Attijari Bank 🇹🇳</Text>
              </View>
              <Text style={{ color: '#60B8F5', fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* CTA */}
        <TouchableOpacity
          style={[S.btnPrimary, { backgroundColor: colors.gold }]}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate('CIN');
          }}
          activeOpacity={0.85}
        >
          <Text style={[S.btnPrimaryText, { color: colors.bg }]}>
            {t('startNow')} — {t('startNow')}
          </Text>
        </TouchableOpacity>

        <Text style={[S.bct, { color: colors.textMuted }]}>{t('bct')}</Text>

        {/* Espace pour la navbar + FAB */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB halo + pill ─────────────────────────────────────────────────── */}
      {/* Halo pulsant derrière le FAB */}
      <Animated.View
        style={[S.fabHalo, { backgroundColor: colors.gold + '28', transform: [{ scale: pulseAnim }] }]}
        pointerEvents="none"
      />

      {/* FAB pill — positionné au-dessus de la navbar */}
      <TouchableOpacity
        style={[S.fab, { backgroundColor: colors.gold }]}
        onPress={async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setShowCRC(true);
        }}
        activeOpacity={0.85}
      >
        <Text style={S.fabIcon}>📞</Text>
        <Text style={[S.fabLabel, { color: colors.bg }]}>Aide</Text>
      </TouchableOpacity>

      {/* ── Navbar bottom ───────────────────────────────────────────────────── */}
      <BottomNav
        active={activeTab}
        onPress={handleNavPress}
        colors={colors}
      />

      <CRCModal visible={showCRC} onClose={() => setShowCRC(false)} colors={colors} />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const NAV_HEIGHT = 64; // hauteur estimée de la navbar (sans safe area)

const S = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  headerText:     { flex: 1 },
  headerTitle:    { fontSize: 11, fontWeight: '600' },
  headerSub:      { fontSize: 9 },
  langRow:        { flexDirection: 'row', gap: 4 },
  langPill:       { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, borderWidth: 0.5 },
  langText:       { fontSize: 9, fontWeight: '600' },
  themeBtn:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scroll:         { padding: 14, paddingBottom: 20 },
  offlineBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 9, marginBottom: 10 },
  offlineDot:     { width: 6, height: 6, borderRadius: 3 },
  offlineText:    { fontSize: 10, flex: 1 },
  progressCard:   { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  progressInfo:   { flex: 1, alignItems: 'flex-end' },
  progressTitle:  { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  progressSub:    { fontSize: 10, marginTop: 2, textAlign: 'right' },
  barBg:          { width: '100%', height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  barFill:        { height: 4, borderRadius: 2 },
  sectionTitle:   { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'right', marginBottom: 10 },
  utilitySection: { borderRadius: 14, borderWidth: 0.5, overflow: 'hidden', marginBottom: 10 },
  utilityHeader:  { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5 },
  utilityLabel:   { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'right' },
  utilityRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  utilityIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  utilityText:    { flex: 1, alignItems: 'flex-end' },
  utilityMain:    { fontSize: 12, fontWeight: '500', textAlign: 'right' },
  utilitySub:     { fontSize: 10, marginTop: 1, textAlign: 'right' },
  btnPrimary:     { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  bct:            { fontSize: 10, textAlign: 'center', marginTop: 14 },
  // FAB — au-dessus de la navbar
  fab:     {
    position:        'absolute',
    bottom:          NAV_HEIGHT + 12,   // au-dessus de la navbar
    right:           16,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             7,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius:    30,
    elevation:       8,
    shadowColor:     '#E8890C',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.35,
    shadowRadius:    8,
  },
  fabIcon:  { fontSize: 17 },
  fabLabel: { fontSize: 13, fontWeight: '700' },
  fabHalo:  {
    position:     'absolute',
    bottom:       NAV_HEIGHT + 8,
    right:        6,
    width:        90,
    height:       54,
    borderRadius: 27,
  },
});