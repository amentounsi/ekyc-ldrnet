/**
 * CINIntroScreen — Introduction screen for CIN scanning flow
 * Shows process overview, conditions, and start button
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  BackHandler,
} from 'react-native';
import Svg, { Circle, Rect, Path, Ellipse } from 'react-native-svg';
import { AttijariLogo } from '../components/AttijariLogo';

interface CINIntroScreenProps {
  onStart: () => void;
  onBack?: () => void;
}

export const CINIntroScreen: React.FC<CINIntroScreenProps> = ({ onStart, onBack }) => {
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
        <Text style={styles.headerTitle}>Vérification d'identité</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroContainer}>
          <Svg width="72" height="72" viewBox="0 0 72 72">
            <Circle cx="36" cy="36" r="35" fill="rgba(204,27,43,0.1)" stroke="rgba(204,27,43,0.3)" strokeWidth="1.5"/>
            <Rect x="16" y="22" width="40" height="28" rx="4" fill="none" stroke="white" strokeWidth="2"/>
            <Circle cx="27" cy="32" r="5" fill="none" stroke="white" strokeWidth="1.8"/>
            <Path d="M18 50 Q18 42 27 42 Q36 42 36 50" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            <Rect x="40" y="30" width="12" height="2" rx="1" fill="rgba(255,255,255,0.5)"/>
            <Rect x="40" y="34" width="9" height="2" rx="1" fill="rgba(255,255,255,0.35)"/>
            <Rect x="40" y="38" width="11" height="2" rx="1" fill="rgba(255,255,255,0.35)"/>
            <Circle cx="54" cy="52" r="10" fill="#CC1B2B"/>
            <Path d="M50 52l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </Svg>
        </View>

        <Text style={styles.title}>Scanner votre CIN</Text>
        <Text style={styles.subtitle}>Suivez ces étapes pour scanner votre carte d'identité nationale tunisienne</Text>

        {/* Steps */}
        <View style={styles.stepsContainer}>
          {/* Step 1 */}
          <View style={styles.stepRow}>
            <View style={[styles.stepCircle, { backgroundColor: '#CC1B2B' }]}>
              <Text style={styles.stepNumber}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Recto de la CIN</Text>
              <Text style={styles.stepDesc}>Présentez le côté avec votre photo, nom et numéro CIN</Text>
            </View>
          </View>

          {/* Step 2 */}
          <View style={styles.stepRow}>
            <View style={[styles.stepCircle, { backgroundColor: '#C8963C' }]}>
              <Text style={styles.stepNumber}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Verso de la CIN</Text>
              <Text style={styles.stepDesc}>Retournez la carte — alignez le code-barres dans la zone</Text>
            </View>
          </View>

          {/* Step 3 */}
          <View style={styles.stepRow}>
            <View style={[styles.stepCircle, { backgroundColor: '#1DB954' }]}>
              <Text style={styles.stepNumber}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Confirmation</Text>
              <Text style={styles.stepDesc}>Vérifiez vos données extraites et confirmez</Text>
            </View>
          </View>
        </View>

        {/* Conditions box */}
        <View style={styles.conditionsBox}>
          <Text style={styles.conditionsTitle}>Conditions requises</Text>

          <ConditionRow icon="light" text="Bonne luminosité ambiante" color="#F5C518" />
          <ConditionRow icon="flat" text="Carte à plat, sans pli ni dommage" color="#4A9EFF" />
          <ConditionRow icon="center" text="Centrez la carte dans le cadre" color="#CC1B2B" />
          <ConditionRow icon="noreflect" text="Pas de reflets ni d'ombres" color="#C8963C" />
          <ConditionRow icon="official" text="CIN tunisienne officielle uniquement" color="#1DB954" />
        </View>
      </ScrollView>

      {/* CTA Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.85}>
          <Text style={styles.startButtonText}>Commencer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Condition row sub-component ─────────────────────────────────────────────

type ConditionIconType = 'light' | 'flat' | 'center' | 'noreflect' | 'official';

const ConditionRow: React.FC<{ icon: ConditionIconType; text: string; color: string }> = ({
  icon,
  text,
  color,
}) => (
  <View style={condStyles.row}>
    <View style={[condStyles.iconBox, { backgroundColor: `${color}22` }]}>
      <ConditionIcon type={icon} color={color} />
    </View>
    <Text style={condStyles.text}>{text}</Text>
  </View>
);

const ConditionIcon: React.FC<{ type: ConditionIconType; color: string }> = ({ type, color }) => {
  const w = 16;
  const h = 16;
  switch (type) {
    case 'light':
      return (
        <Svg width={w} height={h} viewBox="0 0 16 16">
          <Circle cx="8" cy="8" r="3.5" fill={color} />
          <Path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6l1.4 1.4M3 13l1.4-1.4M11.6 4.4l1.4-1.4"
            stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        </Svg>
      );
    case 'flat':
      return (
        <Svg width={w} height={h} viewBox="0 0 16 16">
          <Rect x="1" y="5" width="14" height="9" rx="2" fill="none" stroke={color} strokeWidth="1.5"/>
          <Path d="M4 5V3a2 2 0 014 0v2" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        </Svg>
      );
    case 'center':
      return (
        <Svg width={w} height={h} viewBox="0 0 16 16">
          <Circle cx="8" cy="8" r="2.5" fill={color}/>
          <Path d="M2 2h3M2 2v3M11 2h3M14 2v3M2 14h3M2 14v-3M11 14h3M14 14v-3"
            stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        </Svg>
      );
    case 'noreflect':
      return (
        <Svg width={w} height={h} viewBox="0 0 16 16">
          <Circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.5"/>
          <Path d="M4 12L12 4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        </Svg>
      );
    case 'official':
      return (
        <Svg width={w} height={h} viewBox="0 0 16 16">
          <Path d="M8 1L6 6H1L5 9.5L3.5 15L8 11.5L12.5 15L11 9.5L15 6H10Z"
            fill={color} opacity="0.9"/>
        </Svg>
      );
  }
};

const condStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  text: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
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
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  heroContainer: {
    marginBottom: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 28,
    paddingHorizontal: 10,
  },
  stepsContainer: {
    width: '100%',
    marginBottom: 24,
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  stepNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  stepDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
  conditionsBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  conditionsTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  footer: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: '#000000',
  },
  startButton: {
    backgroundColor: '#CC1B2B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
