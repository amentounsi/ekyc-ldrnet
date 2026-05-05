// src/screens/SignatureScreen.tsx
import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, PanResponder, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type RootStackParamList = {
  Home:      undefined;
  Sign:      undefined;
  Recap:     undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, 'Sign'>;

interface Props {
  navigation: Nav;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CANVAS_HEIGHT = 160;
const STROKE_COLOR  = '#E8890C';
const STROKE_WIDTH  = 2.5;

// ─── Convertit les strokes en SVG path string ─────────────────────────────────

const strokeToPath = (stroke: Stroke): string => {
  if (stroke.points.length < 2) return '';
  const [first, ...rest] = stroke.points;
  return `M ${first.x} ${first.y} ` +
    rest.map(p => `L ${p.x} ${p.y}`).join(' ');
};

// ─── SignatureScreen ──────────────────────────────────────────────────────────

export const SignatureScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, completeStep, updateDossier, isDark } = useApp();
  const toastRef   = useRef<ToastRef>(null);
  const canvasRef  = useRef<View>(null);
  const canvasLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const [strokes,     setStrokes]     = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isSigned,    setIsSigned]    = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Animation bordure canvas
  const borderAnim = useRef(new Animated.Value(0)).current;
  const confirmAnim = useRef(new Animated.Value(1)).current;

  const glowBorder = useCallback(() => {
    Animated.sequence([
      Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(borderAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();
  }, [borderAnim]);

  const borderColor = borderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [colors.border, colors.gold],
  });

  // ── PanResponder — gestion du dessin ────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newStroke: Stroke = { points: [{ x: locationX, y: locationY }] };
        setCurrentStroke(newStroke);
        setIsSigned(true);
        glowBorder();
        // Haptic léger au début du tracé
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      },

      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentStroke(prev => {
          if (!prev) return null;
          return { points: [...prev.points, { x: locationX, y: locationY }] };
        });
      },

      onPanResponderRelease: () => {
        setCurrentStroke(prev => {
          if (prev && prev.points.length > 1) {
            setStrokes(s => [...s, prev]);
          }
          return null;
        });
      },
    })
  ).current;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleClear = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStrokes([]);
    setCurrentStroke(null);
    setIsSigned(false);
    setIsConfirmed(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!isSigned || strokes.length === 0) {
      toastRef.current?.show('يرجى التوقيع أولاً — Veuillez signer', colors.red);
      return;
    }

    // Haptic fort = succès
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Animation bouton
    Animated.sequence([
      Animated.timing(confirmAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(confirmAnim, { toValue: 1,    duration: 150, useNativeDriver: true }),
    ]).start();

    setIsConfirmed(true);

    // Sauvegarder dans le dossier (URI simulée sur web)
    await updateDossier({ signatureUri: 'signature_saved' });
    await completeStep(3);

    toastRef.current?.show(t('toastSign'), colors.green);

    // Naviguer vers Récap après 1s
    setTimeout(() => navigation.navigate('Recap'), 1000);
  }, [isSigned, strokes, colors, t, completeStep, updateDossier, navigation, confirmAnim]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.bgCard }]}
        >
          <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <AttijariLogo size={30} />
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>
            {t('step3Main')}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            {t('step3Sub')}
          </Text>
        </View>
        {/* Indicateur étape */}
        <View style={[styles.stepBadge, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.stepBadgeText, { color: colors.gold }]}>3 / 5</Text>
        </View>
      </View>

      <View style={[styles.container, { backgroundColor: colors.bg }]}>

        {/* Titre */}
        <Text style={[styles.title, { color: colors.textPri }]}>
          {t('step3Main')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          وقّع بإصبعك كما تفعل في الواقع · Signez avec votre doigt
        </Text>

        {/* Canvas de signature */}
        <Animated.View
          style={[
            styles.canvasWrapper,
            {
              backgroundColor: isDark ? '#0d0f14' : '#F8F6F2',
              borderColor,
            },
          ]}
          onLayout={(e) => {
            canvasLayout.current = e.nativeEvent.layout;
          }}
        >
          <View
            ref={canvasRef}
            style={styles.canvas}
            {...panResponder.panHandlers}
          >
            {/* SVG des traits */}
            <Svg
              width="100%"
              height={CANVAS_HEIGHT}
              style={StyleSheet.absoluteFillObject}
            >
              {/* Strokes terminées */}
              {strokes.map((stroke, i) => (
                <Path
                  key={i}
                  d={strokeToPath(stroke)}
                  stroke={isConfirmed ? colors.green : STROKE_COLOR}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
              {/* Stroke en cours */}
              {currentStroke && (
                <Path
                  d={strokeToPath(currentStroke)}
                  stroke={STROKE_COLOR}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )}
            </Svg>

            {/* Hint si vide */}
            {!isSigned && (
              <View style={styles.hint} pointerEvents="none">
                <Text style={[styles.hintText, { color: colors.textMuted }]}>
                  {t('signHere')} ✍
                </Text>
              </View>
            )}

            {/* Checkmark si confirmé */}
            {isConfirmed && (
              <View style={styles.confirmedOverlay} pointerEvents="none">
                <View style={[styles.confirmedBadge, { backgroundColor: colors.greenBg }]}>
                  <Text style={{ color: colors.green, fontSize: 12, fontWeight: '600' }}>
                    ✓ {t('signReady')}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Ligne de base (guide visuel) */}
          <View style={[styles.baseLine, { backgroundColor: colors.border }]} />
        </Animated.View>

        {/* Status + bouton effacer */}
        <View style={styles.statusRow}>
          <TouchableOpacity onPress={handleClear} activeOpacity={0.7}>
            <Text style={[styles.clearBtn, { color: colors.textMuted }]}>
              {t('clearSign')}
            </Text>
          </TouchableOpacity>
          <Text style={[
            styles.statusText,
            { color: isSigned ? colors.green : colors.textMuted },
          ]}>
            {isSigned ? t('signReady') : t('signNotDone')}
          </Text>
        </View>

        {/* Texte légal */}
        <View style={[styles.legalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={[styles.legalText, { color: colors.textMuted }]}>
            بتوقيعك، تؤكد موافقتك على شروط وأحكام فتح الحساب لدى
            البنك التجاري Attijari Bank Tunisie وفق الأحكام المنظِّمة لعمليات
            البنك المركزي التونسي.
          </Text>
          <Text style={[styles.legalTextFr, { color: colors.textMuted }]}>
            En signant, vous confirmez votre accord avec les CGU d'Attijari Bank Tunisie,
            conformément aux dispositions de la Banque Centrale de Tunisie.
          </Text>
        </View>

        {/* Boutons */}
        <Animated.View style={{ transform: [{ scale: confirmAnim }], marginTop: 12 }}>
          <TouchableOpacity
            style={[
              styles.btnPrimary,
              {
                backgroundColor: isSigned ? colors.gold : colors.border,
                opacity: isSigned ? 1 : 0.6,
              },
            ]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            disabled={!isSigned}
          >
            <Text style={[styles.btnPrimaryText, { color: isSigned ? colors.bg : colors.textMuted }]}>
              {isConfirmed ? '✓ ' + t('signReady') : t('confirmSign')}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnSecondaryText, { color: colors.textSec }]}>
            {t('back')} — Retour
          </Text>
        </TouchableOpacity>

      </View>

      <Toast ref={toastRef} />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width:          32,
    height:         32,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize:   11,
    fontWeight: '600',
  },
  headerSub: {
    fontSize: 9,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:      10,
  },
  stepBadgeText: {
    fontSize:   10,
    fontWeight: '600',
  },
  container: {
    flex:              1,
    paddingHorizontal: 16,
    paddingTop:        16,
    paddingBottom:     24,
  },
  title: {
    fontSize:   15,
    fontWeight: '600',
    textAlign:  'right',
    marginBottom: 4,
  },
  subtitle: {
    fontSize:     11,
    textAlign:    'right',
    marginBottom: 16,
    lineHeight:   1.6,
  },
  canvasWrapper: {
    borderRadius: 14,
    borderWidth:  1,
    overflow:     'hidden',
    marginBottom: 8,
    position:     'relative',
  },
  canvas: {
    height:   CANVAS_HEIGHT,
    width:    '100%',
    position: 'relative',
  },
  hint: {
    position:       'absolute',
    inset:          0,
    alignItems:     'center',
    justifyContent: 'center',
    pointerEvents:  'none',
  },
  hintText: {
    fontSize: 13,
  },
  confirmedOverlay: {
    position:       'absolute',
    bottom:         8,
    right:          10,
  },
  confirmedBadge: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      10,
  },
  baseLine: {
    height:          1,
    marginHorizontal: 20,
    marginBottom:    14,
    opacity:         0.3,
  },
  statusRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    marginBottom:    12,
    paddingHorizontal: 2,
  },
  clearBtn: {
    fontSize: 11,
  },
  statusText: {
    fontSize:   11,
    fontWeight: '500',
  },
  legalCard: {
    borderRadius: 12,
    borderWidth:  0.5,
    padding:      12,
    marginBottom: 4,
    gap:          6,
  },
  legalText: {
    fontSize:   10,
    textAlign:  'right',
    lineHeight: 18,
    direction:  'rtl',
  },
  legalTextFr: {
    fontSize:   10,
    lineHeight: 18,
    marginTop:  4,
  },
  btnPrimary: {
    width:           '100%',
    paddingVertical: 14,
    borderRadius:    14,
    alignItems:      'center',
    marginBottom:    8,
  },
  btnPrimaryText: {
    fontSize:      13,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },
  btnSecondary: {
    width:           '100%',
    paddingVertical: 12,
    borderRadius:    14,
    alignItems:      'center',
    borderWidth:     0.5,
  },
  btnSecondaryText: {
    fontSize:   12,
    fontWeight: '500',
  },
});