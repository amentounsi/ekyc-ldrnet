/**
 * CINGuideFrontScreen — Guide screen before scanning the front (recto) of CIN
 * Shows illustration of front side + checklist + progress indicator
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
  Text as SvgText,
} from 'react-native-svg';
import { AttijariLogo } from '../components/AttijariLogo';

interface CINGuideFrontScreenProps {
  onProceed: () => void;
  onBack?: () => void;
}

export const CINGuideFrontScreen: React.FC<CINGuideFrontScreenProps> = ({
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
        {/* Progress bar */}
        <View style={styles.progressRow}>
          <View style={styles.progressStep}>
            <View style={[styles.progressCircle, styles.progressCircleActive]}>
              <Text style={styles.progressCircleText}>1</Text>
            </View>
            <Text style={styles.progressLabel}>Recto</Text>
          </View>
          <View style={[styles.progressLine, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <View style={styles.progressStep}>
            <View style={styles.progressCircle}>
              <Text style={[styles.progressCircleText, { color: 'rgba(255,255,255,0.4)' }]}>2</Text>
            </View>
            <Text style={[styles.progressLabel, { color: 'rgba(255,255,255,0.4)' }]}>Verso</Text>
          </View>
          <View style={[styles.progressLine, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <View style={styles.progressStep}>
            <View style={styles.progressCircle}>
              <Text style={[styles.progressCircleText, { color: 'rgba(255,255,255,0.4)' }]}>3</Text>
            </View>
            <Text style={[styles.progressLabel, { color: 'rgba(255,255,255,0.4)' }]}>Résultat</Text>
          </View>
        </View>

        <Text style={styles.title}>Côté face</Text>
        <Text style={styles.subtitle}>Présentez ce côté — avec votre photo, nom et numéro</Text>

        {/* Card illustration */}
        <View style={styles.cardContainer}>
          <Svg width="272" height="178" viewBox="0 0 272 178">
            {/* Shadow */}
            <Rect x="4" y="4" width="264" height="170" rx="16" fill="#D8C8D8" opacity="0.15"/>
            {/* Card background */}
            <Rect x="0" y="0" width="264" height="170" rx="16" fill="#C8AEBF"/>
            {/* Green validation border */}
            <Rect x="0" y="0" width="264" height="170" rx="16" fill="none" stroke="#1DB954" strokeWidth="4"/>
            {/* Photo area */}
            <Rect x="14" y="14" width="54" height="44" rx="6" fill="#CC1B2B" opacity="0.85"/>
            <Circle cx="41" cy="30" r="9" fill="none" stroke="white" strokeWidth="2.2"/>
            <Circle cx="41" cy="30" r="3.5" fill="white"/>
            {/* Cartoon silhouette */}
            <Ellipse cx="41" cy="88" rx="22" ry="14" fill="#3A3A3A"/>
            <Ellipse cx="41" cy="94" rx="18" ry="20" fill="#E8C4A0"/>
            <Ellipse cx="41" cy="80" rx="22" ry="12" fill="#3A3A3A"/>
            <Ellipse cx="34" cy="92" rx="3" ry="3.5" fill="#2A2A2A"/>
            <Ellipse cx="48" cy="92" rx="3" ry="3.5" fill="#2A2A2A"/>
            <Path d="M35 101 Q41 106 47 101" fill="none" stroke="#8B6040" strokeWidth="1.8" strokeLinecap="round"/>
            <Rect x="35" y="112" width="12" height="10" rx="3" fill="#E8C4A0"/>
            <Path d="M20 138 Q20 122 41 122 Q62 122 62 138" fill="#5A5A7A"/>
            {/* PHOTO label */}
            <Rect x="14" y="118" width="54" height="14" rx="3" fill="#CC1B2B"/>
            <SvgText x="41" y="128" fontSize="7.5" fill="white" fontWeight="700" textAnchor="middle">PHOTO</SvgText>
            {/* Purple accent line */}
            <Rect x="78" y="20" width="170" height="6" rx="3" fill="#8855BB"/>
            {/* Data lines */}
            <Rect x="78" y="36" width="140" height="8" rx="3" fill="#4A4A5A"/>
            <Rect x="78" y="52" width="110" height="8" rx="3" fill="#4A4A5A" opacity="0.7"/>
            <Rect x="78" y="68" width="125" height="8" rx="3" fill="#4A4A5A" opacity="0.7"/>
            <Rect x="78" y="84" width="95"  height="8" rx="3" fill="#4A4A5A" opacity="0.5"/>
            <Rect x="78" y="102" width="90" height="10" rx="3" fill="#8855BB" opacity="0.7"/>
            {/* Gold shield top-right */}
            <Path d="M222 14 Q212 14 212 22 L212 38 Q212 50 222 54 Q232 50 232 38 L232 22 Q232 14 222 14 Z" fill="#C8963C"/>
            <Circle cx="222" cy="28" r="5" fill="#C8963C"/>
            {/* CIN number band */}
            <Path d="M0 148 L264 148 L264 162 Q264 170 248 170 L16 170 Q0 170 0 162 Z" fill="#B09AB0"/>
            <Rect x="14" y="156" width="100" height="6" rx="2" fill="rgba(255,255,255,0.3)"/>
          </Svg>
        </View>

        {/* Pill label */}
        <View style={styles.pill}>
          <Svg width="16" height="16" viewBox="0 0 16 16">
            <Circle cx="8" cy="5.5" r="3" fill="none" stroke="white" strokeWidth="1.5"/>
            <Path d="M2 14 Q2 10 8 10 Q14 10 14 14" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </Svg>
          <Text style={styles.pillText}>Ce côté avec votre photo</Text>
        </View>

        {/* Checklist */}
        <View style={styles.checklist}>
          <CheckItem ok text="Votre photo et visage clairement visibles" />
          <CheckItem ok text="Nom, prénom et numéro CIN lisibles" />
          <CheckItem ok={false} text="Pas le verso — pas le code-barres" />
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.ctaButton} onPress={onProceed} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Scanner le recto</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  text: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    backgroundColor: '#CC1B2B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 14,
    gap: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  progressStep: {
    alignItems: 'center',
    gap: 4,
  },
  progressCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: {
    backgroundColor: '#CC1B2B',
  },
  progressCircleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  progressLine: {
    flex: 1,
    height: 0.5,
    marginHorizontal: 6,
    marginBottom: 14,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '500',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  cardContainer: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
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
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  checklist: {
    width: '100%',
    marginBottom: 8,
  },
  footer: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: '#000000',
  },
  ctaButton: {
    backgroundColor: '#CC1B2B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
