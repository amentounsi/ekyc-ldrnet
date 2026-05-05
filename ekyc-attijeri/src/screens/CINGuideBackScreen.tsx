/**
 * CINGuideBackScreen — Guide screen before scanning the back (verso) of CIN
 * Shows illustration of back side + checklist + progress indicator (step 2 active)
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  BackHandler,
  ScrollView,
} from 'react-native';
import Svg, {
  Rect,
  Circle,
  Path,
  Ellipse,
  Line,
} from 'react-native-svg';
import { AttijariLogo } from '../components/AttijariLogo';

interface CINGuideBackScreenProps {
  onProceed: () => void;
  onBack?: () => void;
}

export const CINGuideBackScreen: React.FC<CINGuideBackScreenProps> = ({
  onProceed,
  onBack,
}) => {
  useEffect(() => {
    if (!onBack) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => handler.remove();
  }, [onBack]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#CC1B2B" />

      {/* Header */}
      <View style={styles.header}>
        <AttijariLogo size={36} />
        <Text style={styles.headerTitle}>Scan CIN</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Progress bar — step 2 active */}
        <View style={styles.progressRow}>
          {/* Step 1 — done */}
          <View style={styles.progressStep}>
            <View style={[styles.progressCircle, styles.progressCircleDone]}>
              <Svg width="12" height="12" viewBox="0 0 12 12">
                <Path d="M2 6l3 3 5-5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </Svg>
            </View>
            <Text style={[styles.progressLabel, { color: '#1DB954' }]}>Recto</Text>
          </View>
          <View style={[styles.progressLine, { backgroundColor: 'rgba(100,220,150,0.4)' }]} />
          {/* Step 2 — active */}
          <View style={styles.progressStep}>
            <View style={[styles.progressCircle, styles.progressCircleActive]}>
              <Text style={styles.progressCircleText}>2</Text>
            </View>
            <Text style={styles.progressLabel}>Verso</Text>
          </View>
          <View style={[styles.progressLine, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          {/* Step 3 — pending */}
          <View style={styles.progressStep}>
            <View style={styles.progressCircle}>
              <Text style={[styles.progressCircleText, { color: 'rgba(255,255,255,0.4)' }]}>3</Text>
            </View>
            <Text style={[styles.progressLabel, { color: 'rgba(255,255,255,0.4)' }]}>Résultat</Text>
          </View>
        </View>

        <Text style={styles.title}>Côté verso</Text>
        <Text style={styles.subtitle}>Retournez la carte — code-barres et empreinte</Text>

        {/* Card illustration — verso */}
        <View style={styles.cardContainer}>
          <Svg width="272" height="178" viewBox="0 0 272 178">
            {/* Shadow */}
            <Rect x="4" y="4" width="264" height="170" rx="16" fill="#C8C8D8" opacity="0.15"/>
            {/* Card background */}
            <Rect x="0" y="0" width="264" height="170" rx="16" fill="#C0B8CC"/>
            {/* Green validation border */}
            <Rect x="0" y="0" width="264" height="170" rx="16" fill="none" stroke="#1DB954" strokeWidth="4"/>
            {/* Accent + data lines left */}
            <Rect x="14" y="20" width="140" height="6" rx="3" fill="#7755AA"/>
            <Rect x="14" y="36" width="115" height="7" rx="3" fill="#4A4A5A"/>
            <Rect x="14" y="50" width="95"  height="7" rx="3" fill="#4A4A5A" opacity="0.75"/>
            <Rect x="14" y="66" width="105" height="7" rx="3" fill="#8855BB" opacity="0.8"/>
            <Rect x="14" y="80" width="85"  height="7" rx="3" fill="#8855BB" opacity="0.6"/>
            <Rect x="14" y="96" width="100" height="7" rx="3" fill="#4A4A5A" opacity="0.6"/>
            {/* Fingerprint — concentric ellipses */}
            <Ellipse cx="196" cy="72" rx="44" ry="50" fill="#B8A8C0" opacity="0.4"/>
            <Ellipse cx="196" cy="72" rx="38" ry="43" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.6"/>
            <Ellipse cx="196" cy="72" rx="30" ry="34" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.65"/>
            <Ellipse cx="196" cy="72" rx="22" ry="25" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.7"/>
            <Ellipse cx="196" cy="72" rx="14" ry="16" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.75"/>
            <Ellipse cx="196" cy="72" rx="7"  ry="8"  fill="none" stroke="#4A3A5A" strokeWidth="2"   opacity="0.8"/>
            <Circle  cx="196" cy="72" r="2.5"         fill="#4A3A5A" opacity="0.7"/>
            {/* Separator */}
            <Line x1="8" y1="126" x2="256" y2="126" stroke="#9A8AAA" strokeWidth="1.5" opacity="0.8"/>
            {/* Barcode area */}
            <Rect x="8" y="130" width="248" height="30" rx="4" fill="white" opacity="0.85"/>
            {/* Barcode bars */}
            <Rect x="16"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="20"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="23"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="28"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="31"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="35"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="40"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="43"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="47"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="52"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="55"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="59"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="64"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="67"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="71"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="76"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="79"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="83"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="88"  y="134" width="1" height="22" fill="#222"/>
            <Rect x="91"  y="134" width="2" height="22" fill="#222"/>
            <Rect x="95"  y="134" width="3" height="22" fill="#222"/>
            <Rect x="100" y="134" width="1" height="22" fill="#222"/>
            <Rect x="103" y="134" width="2" height="22" fill="#222"/>
            <Rect x="107" y="134" width="3" height="22" fill="#222"/>
            <Rect x="112" y="134" width="1" height="22" fill="#222"/>
            <Rect x="115" y="134" width="2" height="22" fill="#222"/>
            <Rect x="119" y="134" width="3" height="22" fill="#222"/>
            <Rect x="124" y="134" width="1" height="22" fill="#222"/>
            <Rect x="127" y="134" width="2" height="22" fill="#222"/>
            <Rect x="131" y="134" width="3" height="22" fill="#222"/>
            <Rect x="136" y="134" width="1" height="22" fill="#222"/>
            <Rect x="139" y="134" width="2" height="22" fill="#222"/>
            <Rect x="143" y="134" width="3" height="22" fill="#222"/>
            <Rect x="148" y="134" width="1" height="22" fill="#222"/>
            <Rect x="151" y="134" width="2" height="22" fill="#222"/>
            <Rect x="155" y="134" width="3" height="22" fill="#222"/>
            <Rect x="160" y="134" width="1" height="22" fill="#222"/>
            <Rect x="163" y="134" width="2" height="22" fill="#222"/>
            <Rect x="167" y="134" width="3" height="22" fill="#222"/>
            <Rect x="172" y="134" width="1" height="22" fill="#222"/>
            <Rect x="175" y="134" width="2" height="22" fill="#222"/>
            <Rect x="179" y="134" width="3" height="22" fill="#222"/>
            <Rect x="184" y="134" width="1" height="22" fill="#222"/>
            <Rect x="187" y="134" width="2" height="22" fill="#222"/>
            <Rect x="191" y="134" width="3" height="22" fill="#222"/>
            <Rect x="196" y="134" width="1" height="22" fill="#222"/>
            <Rect x="199" y="134" width="2" height="22" fill="#222"/>
            <Rect x="203" y="134" width="3" height="22" fill="#222"/>
            <Rect x="208" y="134" width="1" height="22" fill="#222"/>
            <Rect x="211" y="134" width="2" height="22" fill="#222"/>
            <Rect x="215" y="134" width="3" height="22" fill="#222"/>
            <Rect x="220" y="134" width="1" height="22" fill="#222"/>
            <Rect x="223" y="134" width="2" height="22" fill="#222"/>
            <Rect x="227" y="134" width="3" height="22" fill="#222"/>
            <Rect x="232" y="134" width="1" height="22" fill="#222"/>
            <Rect x="235" y="134" width="2" height="22" fill="#222"/>
            <Rect x="239" y="134" width="3" height="22" fill="#222"/>
            <Rect x="244" y="134" width="1" height="22" fill="#222"/>
            <Rect x="247" y="134" width="2" height="22" fill="#222"/>
            <Rect x="251" y="134" width="3" height="22" fill="#222"/>
          </Svg>
        </View>

        {/* Pill label */}
        <View style={styles.pill}>
          <Svg width="16" height="16" viewBox="0 0 16 16">
            <Path d="M8 2 L14 8 L8 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <Path d="M2 8 L8 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <Circle cx="8" cy="8" r="3" fill="none" stroke="white" strokeWidth="1.2" opacity="0.5"/>
          </Svg>
          <Text style={styles.pillText}>Retournez la carte</Text>
        </View>

        {/* Checklist */}
        <View style={styles.checklist}>
          <CheckItem ok text="Code-barres en bas bien visible" />
          <CheckItem ok text="Pas de reflets ni ombre sur le code-barres" />
          <CheckItem ok={false} text="Pas le recto — pas de photo de visage" />
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.ctaButton} onPress={onProceed} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Scanner le verso</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── CheckItem ────────────────────────────────────────────────────────────────

const CheckItem: React.FC<{ ok: boolean; text: string }> = ({ ok, text }) => (
  <View style={checkStyles.row}>
    <View style={[checkStyles.icon, { backgroundColor: ok ? 'rgba(29,185,84,0.12)' : 'rgba(204,27,43,0.12)' }]}>
      <Svg width="14" height="14" viewBox="0 0 14 14">
        {ok ? (
          <Path d="M2 7l4 4 6-6" stroke="#1DB954" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        ) : (
          <>
            <Line x1="3" y1="3" x2="11" y2="11" stroke="#CC1B2B" strokeWidth="2" strokeLinecap="round"/>
            <Line x1="11" y1="3" x2="3" y2="11" stroke="#CC1B2B" strokeWidth="2" strokeLinecap="round"/>
          </>
        )}
      </Svg>
    </View>
    <Text style={checkStyles.text}>{text}</Text>
  </View>
);

const checkStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  icon: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  text: { color: 'rgba(255,255,255,0.75)', fontSize: 13, flex: 1, lineHeight: 18 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    backgroundColor: '#CC1B2B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 14,
    gap: 10,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, width: '100%' },
  progressStep: { alignItems: 'center', gap: 4 },
  progressCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: { backgroundColor: '#CC1B2B' },
  progressCircleDone: { backgroundColor: '#1DB954' },
  progressCircleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  progressLine: { flex: 1, height: 0.5, marginHorizontal: 6, marginBottom: 14 },
  progressLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '500' },
  title: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  cardContainer: { marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 24,
  },
  pillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
  checklist: { width: '100%', marginBottom: 8 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: '#000000' },
  ctaButton: { backgroundColor: '#CC1B2B', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
