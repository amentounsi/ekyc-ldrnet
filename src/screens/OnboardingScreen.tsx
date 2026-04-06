/**
 * OnboardingScreen Component
 * Welcome screen with instructions before CIN scanning
 * Attijari Bank branded design
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import Svg, { Path, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, Typography, Spacing, BorderRadius, Strings } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingScreenProps {
  onStartScanning: () => void;
}

/**
 * Attijari Bank Logo Component (SVG recreation)
 */
const AttijariLogo: React.FC<{ size?: number }> = ({ size = 80 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="goldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#F5A623" />
          <Stop offset="100%" stopColor="#D4920E" />
        </LinearGradient>
        <LinearGradient id="redGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#E30613" />
          <Stop offset="100%" stopColor="#A0000F" />
        </LinearGradient>
      </Defs>
      {/* Gold top section */}
      <Rect x="5" y="5" width="90" height="45" rx="4" fill="url(#goldGradient)" />
      {/* Red bottom section */}
      <Rect x="5" y="50" width="90" height="45" rx="4" fill="url(#redGradient)" />
      {/* Stylized "AW" mountain shape */}
      <Path
        d="M15 55 L30 30 L45 55 L60 30 L75 55 L85 55"
        stroke="#1a1a1a"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Small house/window shape */}
      <Rect x="22" y="42" width="10" height="10" fill="#1a1a1a" />
    </Svg>
  );
};

/**
 * CIN Card Icon
 */
const CINCardIcon: React.FC = () => {
  return (
    <Svg width={120} height={80} viewBox="0 0 120 80">
      {/* Card outline */}
      <Rect
        x="2"
        y="2"
        width="116"
        height="76"
        rx="8"
        fill={Colors.backgroundLight}
        stroke={Colors.primary}
        strokeWidth="2"
      />
      {/* Photo placeholder */}
      <Rect x="10" y="15" width="30" height="40" rx="4" fill={Colors.border} />
      {/* Photo silhouette */}
      <Path
        d="M25 25 C30 25 33 30 33 35 C33 40 30 43 25 43 C20 43 17 40 17 35 C17 30 20 25 25 25 M25 45 C18 45 12 48 12 52 L38 52 C38 48 32 45 25 45"
        fill={Colors.textMuted}
      />
      {/* Text lines */}
      <Rect x="48" y="18" width="60" height="6" rx="2" fill={Colors.border} />
      <Rect x="48" y="30" width="50" height="5" rx="2" fill={Colors.border} />
      <Rect x="48" y="40" width="55" height="5" rx="2" fill={Colors.border} />
      <Rect x="48" y="50" width="40" height="5" rx="2" fill={Colors.border} />
      {/* Flag indicator */}
      <Rect x="10" y="60" width="20" height="10" rx="2" fill={Colors.primary} />
    </Svg>
  );
};

/**
 * Requirement Item Component
 */
const RequirementItem: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View style={styles.requirementItem}>
    <Text style={styles.requirementIcon}>{icon}</Text>
    <Text style={styles.requirementText}>{text}</Text>
  </View>
);

/**
 * OnboardingScreen Component
 */
export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onStartScanning }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      {/* Logo */}
      <View style={styles.logoContainer}>
        <AttijariLogo size={70} />
        <Text style={styles.brandName}>Attijari Bank</Text>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Card illustration */}
        <View style={styles.cardIllustration}>
          <CINCardIcon />
        </View>

        {/* Title */}
        <Text style={styles.title}>{Strings.onboarding.title}</Text>
        <Text style={styles.subtitle}>{Strings.onboarding.subtitle}</Text>

        {/* Requirements */}
        <View style={styles.requirementsContainer}>
          <RequirementItem icon="🪪" text={Strings.onboarding.requirement1} />
          <RequirementItem icon="💡" text={Strings.onboarding.requirement2} />
          <RequirementItem icon="✋" text={Strings.onboarding.requirement3} />
        </View>

        {/* Warning */}
        <View style={styles.warningContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>{Strings.onboarding.warning}</Text>
        </View>
      </View>

      {/* Start button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={onStartScanning}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>{Strings.onboarding.startButton}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
  },
  brandName: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginTop: Spacing.sm,
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  cardIllustration: {
    marginVertical: Spacing.xxxl,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.sizes.lg,
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
    lineHeight: 24,
  },
  requirementsContainer: {
    width: '100%',
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  requirementIcon: {
    fontSize: 24,
    marginRight: Spacing.md,
  },
  requirementText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.lg,
    flex: 1,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(227, 6, 19, 0.15)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
  },
  warningIcon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },
  warningText: {
    color: Colors.primary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
    flex: 1,
  },
  buttonContainer: {
    padding: Spacing.xxl,
    paddingBottom: 40,
  },
  startButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: Colors.textPrimary,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
});

export default OnboardingScreen;
