/**
 * CINProcessingScreen — Processing/analysis screen shown between scan completion and result
 * Runs validateScan() with a minimum visible delay, showing animated progress steps
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AttijariLogo } from '../components/AttijariLogo';
import { validateScan, ValidationResult } from '../services/validationService';
import BarcodeService from '../native/BarcodeService';
import { Strings } from '../constants/cinTheme';
import type { CINBarcodeData } from '../types/barcode';

interface CINProcessingScreenProps {
  frontCaptured: boolean;
  backCaptured: boolean;
  frontImage: { base64: string; width: number; height: number } | null;
  backImage: { base64: string; width: number; height: number } | null;
  barcodeData: CINBarcodeData | null;
  facePhoto: { base64: string; width: number; height: number } | null;
  onComplete: (validation: ValidationResult, barcodeData: CINBarcodeData | null) => void;
}

type StepState = 'done' | 'active' | 'pending';

interface ProcessingStep {
  label: string;
  state: StepState;
}

export const CINProcessingScreen: React.FC<CINProcessingScreenProps> = ({
  frontImage,
  backImage,
  barcodeData,
  facePhoto,
  onComplete,
}) => {
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Dot blink anims
  const dot1 = useRef(new Animated.Value(0.5)).current;
  const dot2 = useRef(new Animated.Value(0.5)).current;
  const dot3 = useRef(new Animated.Value(0.5)).current;

  const [steps, setSteps] = useState<ProcessingStep[]>([
    { label: Strings.processing.step1, state: 'done' },
    { label: Strings.processing.step2, state: 'done' },
    { label: Strings.processing.step3, state: 'active' },
    { label: Strings.processing.step4, state: 'pending' },
    { label: Strings.processing.step5, state: 'pending' },
  ]);

  useEffect(() => {
    // Spinner
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
    ).start();

    // Staggered dot blink
    const makeDotLoop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.4, duration: 350, useNativeDriver: true }),
        ])
      );
    makeDotLoop(dot1, 0).start();
    makeDotLoop(dot2, 200).start();
    makeDotLoop(dot3, 400).start();

    // Scan barcode from back image then validate
    let cancelled = false;
    const run = async () => {
      // Step 3 active (barcode) — already set as initial state
      let scannedBarcode: CINBarcodeData | null = barcodeData ?? null;
      if (!scannedBarcode && backImage?.base64) {
        try {
          console.log('[PROCESSING] Starting barcode scan...');
          const scanResult = await BarcodeService.scanFromBase64(backImage.base64);
          if (scanResult.found && scanResult.parsed) {
            scannedBarcode = scanResult.parsed;
            console.log('[PROCESSING] Barcode scanned:', scannedBarcode);
          } else {
            console.log('[PROCESSING] Barcode not found:', scanResult.error);
          }
        } catch (err) {
          console.error('[PROCESSING] Barcode scan error:', err);
        }
      }
      if (cancelled) return;

      // Step 3 done, step 4 active (face extraction)
      setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, state: 'done' } : i === 3 ? { ...s, state: 'active' } : s));
      await new Promise(r => setTimeout(r, 250));
      if (cancelled) return;

      // Step 4 done, step 5 active (verification)
      setSteps(prev => prev.map((s, i) => i === 3 ? { ...s, state: 'done' } : i === 4 ? { ...s, state: 'active' } : s));
      await new Promise(r => setTimeout(r, 250));
      if (cancelled) return;

      // Step 5 done, run validation
      setSteps(prev => prev.map((s, i) => i === 4 ? { ...s, state: 'done' } : s));
      await new Promise(r => setTimeout(r, 200));
      if (cancelled) return;

      const validation = validateScan({ frontImage, backImage, facePhoto, barcodeData: scannedBarcode });
      onComplete(validation, scannedBarcode);
    };
    run();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#CC1B2B" />

      {/* Header */}
      <View style={styles.header}>
        <AttijariLogo size={36} />
        <View>
          <Text style={styles.headerTitle}>{Strings.processing.headerTitle}</Text>
          <Text style={styles.headerSub}>{Strings.processing.headerSub}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Spinner */}
        <View style={styles.spinnerContainer}>
          <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]} />
          <View style={styles.spinnerCenter}>
            <AttijariLogo size={44} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{Strings.processing.title}</Text>
        <Text style={styles.subtitle}>{Strings.processing.subtitle}</Text>

        {/* Animated dots */}
        <View style={styles.dotsRow}>
          {[dot1, dot2, dot3].map((d, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
          ))}
        </View>

        {/* Steps list */}
        <View style={styles.stepsList}>
          {steps.map((step, i) => (
            <StepRow key={i} step={step} />
          ))}
        </View>
      </View>
    </View>
  );
};

// ─── StepRow ──────────────────────────────────────────────────────────────────

const StepRow: React.FC<{ step: { label: string; state: StepState } }> = ({ step }) => {
  const spinRef = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step.state === 'active') {
      Animated.loop(
        Animated.timing(spinRef, { toValue: 1, duration: 700, useNativeDriver: true })
      ).start();
    } else {
      spinRef.stopAnimation();
      spinRef.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.state]);

  const rotate = spinRef.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.iconArea}>
        {step.state === 'done' && (
          <View style={stepStyles.doneCircle}>
            <Svg width="12" height="12" viewBox="0 0 12 12">
              <Path d="M2 6l3 3 5-5" stroke="#1DB954" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </Svg>
          </View>
        )}
        {step.state === 'active' && (
          <Animated.View style={[stepStyles.activeRing, { transform: [{ rotate }] }]} />
        )}
        {step.state === 'pending' && (
          <View style={stepStyles.pendingCircle} />
        )}
      </View>
      <Text style={[
        stepStyles.label,
        step.state === 'done' && stepStyles.labelDone,
        step.state === 'active' && stepStyles.labelActive,
        step.state === 'pending' && stepStyles.labelPending,
      ]}>
        {step.label}
      </Text>
      {step.state === 'done' && (
        <Text style={stepStyles.ok}>OK</Text>
      )}
    </View>
  );
};

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  iconArea: { width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  doneCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(29,185,84,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#CC1B2B',
    borderTopColor: 'transparent',
  },
  pendingCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  label: { flex: 1, fontSize: 13 },
  labelDone: { color: 'rgba(255,255,255,0.75)' },
  labelActive: { color: '#FFFFFF', fontWeight: '600' },
  labelPending: { color: 'rgba(255,255,255,0.3)' },
  ok: { color: '#1DB954', fontSize: 11, fontWeight: '700' },
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
    gap: 12,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  spinnerContainer: {
    width: 96,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  spinnerRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: '#CC1B2B',
    borderTopColor: 'rgba(204,27,43,0.2)',
  },
  spinnerCenter: {
    position: 'absolute',
  },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#CC1B2B',
  },
  stepsList: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginTop: 8,
  },
});
