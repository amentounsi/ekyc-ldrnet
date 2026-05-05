// src/screens/BankCardScreen.tsx
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const BankCardScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, t, dossier } = useApp();

  const cardAnim    = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;
  const confettiAnims = useRef(
    Array.from({ length: 12 }, () => ({
      y:   new Animated.Value(0),
      x:   new Animated.Value(0),
      op:  new Animated.Value(1),
      rot: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Carte apparaît
    Animated.spring(cardAnim, {
      toValue: 1, friction: 6, tension: 60, useNativeDriver: true,
    }).start();

    // Shimmer en boucle
    const shimmerLoop = () => {
      shimmerAnim.setValue(-1);
      Animated.timing(shimmerAnim, {
        toValue: 2, duration: 2500, useNativeDriver: true,
      }).start(() => setTimeout(shimmerLoop, 800));
    };
    shimmerLoop();

    // Confettis
    confettiAnims.forEach((a, i) => {
      const delay = i * 80;
      Animated.parallel([
        Animated.timing(a.y, { toValue: -120 - Math.random() * 80, duration: 900, delay, useNativeDriver: true }),
        Animated.timing(a.x, { toValue: (Math.random() - 0.5) * 160, duration: 900, delay, useNativeDriver: true }),
        Animated.timing(a.op, { toValue: 0, duration: 900, delay: delay + 400, useNativeDriver: true }),
        Animated.timing(a.rot, { toValue: 1, duration: 900, delay, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const CONF_COLORS = ['#E8890C', '#F5C518', '#1D9E75', '#fff', '#C8A96E', '#378ADD'];
  const name = dossier.nom_lat || 'BENSALEM M.A.';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <AttijariLogo size={30} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>Attijari eKYC</Text>
          <Text style={[styles.headerSub, { color: colors.green }]}>✓ Dossier soumis</Text>
        </View>
      </View>

      <View style={styles.container}>
        {/* Confettis */}
        <View style={styles.confettiZone} pointerEvents="none">
          {confettiAnims.map((a, i) => (
            <Animated.View
              key={i}
              style={[
                styles.confetti,
                {
                  backgroundColor: CONF_COLORS[i % CONF_COLORS.length],
                  left: 100 + (i * 20) % 160,
                  opacity: a.op,
                  transform: [
                    { translateY: a.y },
                    { translateX: a.x },
                    { rotate: a.rot.interpolate({ inputRange: [0,1], outputRange: ['0deg','720deg'] }) },
                  ],
                },
              ]}
            />
          ))}
        </View>

        {/* Titre */}
        <Text style={[styles.congrats, { color: colors.textPri }]}>{t('congrats')}</Text>
        <Text style={[styles.pending, { color: colors.textMuted }]}>{t('accountPending')}</Text>

        {/* Carte bancaire animée */}
        <Animated.View style={[
          styles.cardWrap,
          {
            transform: [
              { scale: cardAnim },
              { translateY: cardAnim.interpolate({ inputRange: [0,1], outputRange: [40, 0] }) },
            ],
            opacity: cardAnim,
          },
        ]}>
          <View style={[styles.bankCard, { backgroundColor: '#1a1208', borderColor: '#E8890C33' }]}>
            {/* Shimmer */}
            <Animated.View
              style={[
                styles.shimmer,
                {
                  transform: [{
                    translateX: shimmerAnim.interpolate({
                      inputRange:  [-1, 2],
                      outputRange: [-200, 400],
                    }),
                  }],
                },
              ]}
              pointerEvents="none"
            />

            {/* Header carte */}
            <View style={styles.cardHeader}>
              <View style={[styles.chip, { backgroundColor: '#F5C518' }]} />
              <AttijariLogo size={32} />
            </View>

            {/* Numéro */}
            <Text style={[styles.cardNumber, { color: colors.gold }]}>
              **** **** **** 4521
            </Text>

            {/* Footer */}
            <View style={styles.cardFooter}>
              <View>
                <Text style={[styles.cardFieldLabel, { color: colors.textMuted }]}>TITULAR</Text>
                <Text style={[styles.cardFieldVal, { color: colors.sand }]}>
                  {name.toUpperCase().slice(0, 20)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.cardFieldLabel, { color: colors.textMuted }]}>EXPIRE</Text>
                <Text style={[styles.cardFieldVal, { color: colors.sand }]}>12/28</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.bgCard, borderColor: colors.greenBg }]}>
          <Text style={[styles.infoTxt, { color: colors.textSec }]}>
            سيتم الاتصال بك من فريق Attijari Bank خلال 48 ساعة عمل لتفعيل حسابك.
          </Text>
          <Text style={[styles.infoTxtFr, { color: colors.textMuted }]}>
            Notre équipe vous contactera sous 48h ouvrables pour activer votre compte.
          </Text>
        </View>

        {/* Boutons */}
        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: colors.gold }]}
          onPress={() => navigation.navigate('Map')}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnPrimaryTxt, { color: colors.bg }]}>{t('findAgency')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: colors.border }]}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnSecondaryTxt, { color: colors.textSec }]}>{t('backHome')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  headerTitle:     { fontSize: 12, fontWeight: '600' },
  headerSub:       { fontSize: 10 },
  container:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  confettiZone:    { position: 'absolute', top: 40, left: 0, right: 0, height: 150, overflow: 'hidden' },
  confetti:        { position: 'absolute', width: 8, height: 8, borderRadius: 2, bottom: 0 },
  congrats:        { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  pending:         { fontSize: 12, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  cardWrap:        { width: '100%' },
  bankCard:        { borderRadius: 18, borderWidth: 1, padding: 20, overflow: 'hidden', position: 'relative' },
  shimmer:         { position: 'absolute', top: 0, bottom: 0, width: 80, backgroundColor: 'rgba(255,255,255,0.08)', transform: [{ skewX: '-20deg' }] },
  cardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  chip:            { width: 36, height: 26, borderRadius: 5, opacity: 0.9 },
  cardNumber:      { fontSize: 16, fontFamily: 'monospace', letterSpacing: 3, marginBottom: 20 },
  cardFooter:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardFieldLabel:  { fontSize: 9, marginBottom: 2 },
  cardFieldVal:    { fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  infoCard:        { borderRadius: 12, borderWidth: 0.5, padding: 14, width: '100%', gap: 6 },
  infoTxt:         { fontSize: 12, textAlign: 'right', lineHeight: 18 },
  infoTxtFr:       { fontSize: 11, lineHeight: 16 },
  btnPrimary:      { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnPrimaryTxt:   { fontSize: 13, fontWeight: '700' },
  btnSecondary:    { width: '100%', paddingVertical: 12, borderRadius: 14, alignItems: 'center', borderWidth: 0.5 },
  btnSecondaryTxt: { fontSize: 12 },
});