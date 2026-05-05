// src/screens/LivenessScreen.tsx
// Liveness Detection — Attijari eKYC PFE
// 3 frames · MiniFASNet via FastAPI · Seuil strict · Auto-retry si frame échoue

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';

// ─── CONFIG ─────────────────────────────────────────────
// Remplace par l'IP de ton PC (ipconfig -> Adresse IPv4)
const API_URL = 'http://192.168.1.11:8000';
const THRESHOLD = 0.60;
const N_FRAMES  = 3;
const DELAY_MS  = 1200;

// ─── Types ──────────────────────────────────────────────
type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav }
type Phase = 'idle' | 'capturing' | 'analyzing' | 'success' | 'fail' | 'reset';
type FrameState = 'idle' | 'active' | 'ok' | 'fail';
interface FrameScore { score: number; passed: boolean }

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const pct   = (n: number)  => `${Math.round(n * 100)}%`;

// ─── Badge frame ────────────────────────────────────────
const FrameBadge: React.FC<{ state: FrameState; label: string; colors: any }> = ({ state, label, colors }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (state === 'ok' || state === 'fail') {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1,   duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [state]);

  const bg     = state==='ok' ? '#1D9E7522' : state==='fail' ? '#E24B4A22' : state==='active' ? '#E8890C22' : colors.bgCard;
  const border = state==='ok' ? '#1D9E75'   : state==='fail' ? '#E24B4A'   : state==='active' ? '#E8890C'   : colors.border;
  const icon   = state==='ok' ? '✓'         : state==='fail' ? '✗'         : state==='active' ? '●'         : label;
  const color  = state==='ok' ? '#1D9E75'   : state==='fail' ? '#E24B4A'   : state==='active' ? '#E8890C'   : colors.textMuted;

  return (
    <Animated.View style={[{ width:40,height:40,borderRadius:20,borderWidth:2,alignItems:'center',justifyContent:'center', backgroundColor:bg, borderColor:border, transform:[{scale:scaleAnim}] }]}>
      <Text style={{ fontSize:15, fontWeight:'700', color }}>{icon}</Text>
    </Animated.View>
  );
};

// ═══════════════════════════════════════════════════════
export const LivenessScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, completeStep } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase,        setPhase]        = useState<Phase>('idle');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [frameStates,  setFrameStates]  = useState<FrameState[]>(Array(N_FRAMES).fill('idle'));
  const [frameScores,  setFrameScores]  = useState<(FrameScore|null)[]>(Array(N_FRAMES).fill(null));
  const [attempt,      setAttempt]      = useState(1);
  const [errMsg,       setErrMsg]       = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim    = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const fadeMsg      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== 'idle') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue:1.05, duration:800, useNativeDriver:true }),
      Animated.timing(pulseAnim, { toValue:1,    duration:800, useNativeDriver:true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase]);

  const animProg = (to: number, dur=500) =>
    Animated.timing(progressAnim, { toValue:to, duration:dur, useNativeDriver:false }).start();

  const shake = () =>
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration:60, useNativeDriver:true }),
      Animated.timing(shakeAnim, { toValue: -10, duration:60, useNativeDriver:true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration:60, useNativeDriver:true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration:60, useNativeDriver:true }),
    ]).start();

  const showMsg = () => {
    fadeMsg.setValue(0);
    Animated.timing(fadeMsg, { toValue:1, duration:350, useNativeDriver:true }).start();
  };

  const updateFrame = (idx: number, st: FrameState) =>
    setFrameStates(prev => { const n=[...prev] as FrameState[]; n[idx]=st; return n; });

  const resetAll = useCallback((newAttempt: number) => {
    setPhase('reset');
    setCurrentFrame(0);
    setFrameStates(Array(N_FRAMES).fill('idle'));
    setFrameScores(Array(N_FRAMES).fill(null));
    setAttempt(newAttempt);
    animProg(0, 700);
    showMsg();
    setTimeout(() => { setPhase('idle'); setErrMsg(''); }, 1800);
  }, []);

  const startCapture = async () => {
    if (!cameraRef.current || phase !== 'idle') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setPhase('capturing');
    setErrMsg('');
    setFrameScores(Array(N_FRAMES).fill(null));
    setFrameStates(Array(N_FRAMES).fill('idle'));
    animProg(0);

    const photos: string[] = [];

    for (let i = 0; i < N_FRAMES; i++) {
      setCurrentFrame(i + 1);
      updateFrame(i, 'active');
      animProg(Math.round(((i + 0.5) / N_FRAMES) * 100));
      await delay(300);

      try {
        const photo = await cameraRef.current.takePictureAsync({ quality:0.7, base64:true, skipProcessing:false });
        if (!photo?.base64) throw new Error('vide');
        photos.push(photo.base64);
      } catch {
        updateFrame(i, 'fail');
        setPhase('fail');
        setErrMsg('Erreur capture caméra — Réessayez');
        shake(); animProg(0, 800);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => resetAll(attempt + 1), 2500);
        return;
      }

      updateFrame(i, 'ok');
      animProg(Math.round(((i + 1) / N_FRAMES) * 100));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (i < N_FRAMES - 1) await delay(DELAY_MS);
    }

    setPhase('analyzing');
    setCurrentFrame(0);

    try {
      const res = await fetch(`${API_URL}/predict`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ images: photos, user_id: `attempt_${attempt}` }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();

      const scores: FrameScore[] = (result.scores as number[]).map(s => ({ score:s, passed: s >= THRESHOLD }));
      setFrameScores(scores);
      const failIdx = scores.findIndex(s => !s.passed);

      if (result.is_real && failIdx === -1) {
        setPhase('success');
        setFrameStates(Array(N_FRAMES).fill('ok'));
        animProg(100);
        showMsg();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => { completeStep(2); navigation.navigate('Form'); }, 2000);
      } else {
        setFrameStates(scores.map(s => s.passed ? 'ok' : 'fail') as FrameState[]);
        setPhase('fail');
        shake();
        animProg(0, 900);
        setErrMsg(`Frame ${failIdx+1} échouée · Score: ${pct(scores[failIdx].score)} < ${pct(THRESHOLD)}\nإعادة التحقق تلقائياً`);
        showMsg();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => resetAll(attempt + 1), 2800);
      }
    } catch (err: any) {
      setPhase('fail');
      shake();
      animProg(0, 800);
      setErrMsg(err.message?.includes('Network') || err.message?.includes('fetch')
        ? `Serveur inaccessible\n${API_URL}\nVérifie que FastAPI tourne`
        : `Erreur: ${err.message}`);
      showMsg();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => resetAll(attempt + 1), 3000);
    }
  };

  const ringColor =
    phase==='success' ? '#1D9E75' : phase==='fail' ? '#E24B4A' :
    phase==='analyzing' ? '#E8890C' : '#1D9E75';

  const barColor =
    phase==='success' ? '#1D9E75' : phase==='fail' ? '#E24B4A' : '#E8890C';

  const progressWidth = progressAnim.interpolate({ inputRange:[0,100], outputRange:['0%','100%'] });

  const minScore = frameScores.every(Boolean) ? Math.min(...frameScores.map(s=>s!.score)) : null;

  const instAr =
    phase==='idle'      ? 'انظر للكاميرا مباشرة' :
    phase==='capturing' ? `لا تتحرك — Frame ${currentFrame}/${N_FRAMES}` :
    phase==='analyzing' ? 'تحليل بواسطة MiniFASNet...' :
    phase==='success'   ? '✓ تم التحقق بنجاح !' :
    phase==='fail'      ? '⚠ إعادة التحقق...' :
                          `جولة ${attempt} — ابق ثابتاً`;

  const instFr =
    phase==='idle'      ? 'Regardez directement la caméra' :
    phase==='capturing' ? `Ne bougez pas · Capture ${currentFrame}/${N_FRAMES}` :
    phase==='analyzing' ? 'Analyse MiniFASNet en cours...' :
    phase==='success'   ? '✓ Vérification réussie !' :
    phase==='fail'      ? '⚠ Réinitialisation...' :
                          `Cycle ${attempt} · Repositionnez-vous`;

  if (!permission) return <View style={[S.center,{backgroundColor:colors.bg}]}><ActivityIndicator color={colors.gold}/></View>;

  if (!permission.granted) return (
    <SafeAreaView style={[S.safe,{backgroundColor:colors.bg}]}>
      <View style={S.center}>
        <Text style={{fontSize:40,marginBottom:12}}>📷</Text>
        <Text style={[S.permTitle,{color:colors.textPri}]}>Permission caméra requise</Text>
        <Text style={[S.permSub,{color:colors.textMuted}]}>La détection de vivacité nécessite la caméra frontale</Text>
        <TouchableOpacity style={[S.btn,{backgroundColor:colors.gold}]} onPress={requestPermission}>
          <Text style={[S.btnTxt,{color:colors.bg}]}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[S.safe,{backgroundColor:colors.bg}]} edges={['top']}>

      <View style={[S.hdr,{borderBottomColor:colors.border}]}>
        <TouchableOpacity style={[S.back,{backgroundColor:colors.bgCard}]}
          onPress={()=>navigation.goBack()}
          disabled={phase==='capturing'||phase==='analyzing'}>
          <Text style={{color:colors.textSec,fontSize:18}}>‹</Text>
        </TouchableOpacity>
        <View style={{flex:1,marginLeft:10}}>
          <Text style={[S.hTitle,{color:colors.textPri}]}>التحقق الحي</Text>
          <Text style={[S.hSub,{color:colors.textMuted}]}>Liveness · MiniFASNet · {N_FRAMES} frames</Text>
        </View>
        <View style={[S.badge,{backgroundColor:colors.gold+'22',borderColor:colors.gold}]}>
          <Text style={{color:colors.gold,fontSize:9,fontWeight:'700'}}>الجولة {attempt}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={S.body} showsVerticalScrollIndicator={false}>

        {/* Anneau caméra */}
        <Animated.View style={[S.ring, { borderColor:ringColor,
          transform:[{translateX:shakeAnim},{scale:phase==='idle'?pulseAnim:1}] }]}>
          <CameraView ref={cameraRef} style={S.cam} facing="front"/>
          {phase==='analyzing' && (
            <View style={S.ov}>
              <ActivityIndicator size="large" color={colors.gold}/>
              <Text style={{color:'#fff',fontSize:11,marginTop:6,fontWeight:'600'}}>MiniFASNet...</Text>
            </View>
          )}
          {phase==='success' && (
            <View style={[S.ov,{backgroundColor:'#1D9E7566'}]}>
              <Text style={{fontSize:44,color:'#fff'}}>✓</Text>
              <Text style={{color:'#fff',fontSize:12,fontWeight:'700',marginTop:4}}>Real Face</Text>
            </View>
          )}
          {phase==='fail' && (
            <View style={[S.ov,{backgroundColor:'#E24B4A44'}]}>
              <Text style={{fontSize:44,color:'#fff'}}>✗</Text>
            </View>
          )}
          {phase==='capturing' && (
            <View style={S.rec}>
              <Text style={{color:'#E8890C',fontSize:9,fontWeight:'700'}}>● REC</Text>
            </View>
          )}
        </Animated.View>

        {/* Instruction */}
        <View style={{alignItems:'center',gap:2,minHeight:34}}>
          <Text style={[S.iAr,{color:phase==='success'?'#1D9E75':phase==='fail'?'#E24B4A':colors.textPri}]}>{instAr}</Text>
          <Text style={[S.iFr,{color:colors.textMuted}]}>{instFr}</Text>
        </View>

        {/* Badges 3 frames */}
        <View style={{flexDirection:'row',gap:16,justifyContent:'center'}}>
          {Array.from({length:N_FRAMES}).map((_,i)=>(
            <FrameBadge key={i} state={frameStates[i]} label={String(i+1)} colors={colors}/>
          ))}
        </View>

        {/* Barre progression */}
        <View style={{width:'100%',gap:5}}>
          <View style={[S.progBg,{backgroundColor:colors.bgCard,borderColor:colors.border}]}>
            <Animated.View style={[S.progFill,{width:progressWidth,backgroundColor:barColor}]}/>
          </View>
          <View style={{flexDirection:'row',justifyContent:'space-between'}}>
            <Text style={{fontSize:9,color:colors.textMuted}}>
              {phase==='analyzing'?'Envoi API...':
               phase==='success'  ?'✓ 3/3 validées':
               phase==='fail'     ?'⚠ Réinitialisation':
               `${Math.max(currentFrame,0)} / ${N_FRAMES} frames`}
            </Text>
            <Text style={{fontSize:9,color:colors.textMuted}}>Seuil : {pct(THRESHOLD)}</Text>
          </View>
        </View>

        {/* Scores */}
        {frameScores.some(s=>s!==null) && (
          <View style={{flexDirection:'row',gap:6,width:'100%'}}>
            {frameScores.map((fs,i)=>(
              <View key={i} style={[S.chip,{backgroundColor:colors.bgCard,borderColor:colors.border}]}>
                <Text style={{fontSize:9,color:colors.textMuted,marginBottom:2}}>F{i+1}</Text>
                <Text style={{fontSize:13,fontWeight:'700',color:fs===null?colors.textMuted:fs.passed?'#1D9E75':'#E24B4A'}}>
                  {fs===null?'—':pct(fs.score)}
                </Text>
                {fs!==null && <Text style={{fontSize:8,color:fs.passed?'#1D9E75':'#E24B4A'}}>{fs.passed?'✓':'✗'}</Text>}
              </View>
            ))}
            {minScore!==null && (
              <View style={[S.chip,{flex:1.4,backgroundColor:colors.bgCard,borderColor:colors.border}]}>
                <Text style={{fontSize:9,color:colors.textMuted,marginBottom:2}}>Min</Text>
                <Text style={{fontSize:13,fontWeight:'700',color:phase==='success'?'#1D9E75':'#E24B4A'}}>{pct(minScore)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Message */}
        {(errMsg!==''||phase==='success') && (
          <Animated.View style={[S.msg,{
            backgroundColor:phase==='success'?'#1D9E7514':'#E24B4A14',
            borderColor:    phase==='success'?'#1D9E75'  :'#E24B4A',
            opacity:fadeMsg,
          }]}>
            {phase==='success'?(
              <>
                <Text style={{fontSize:12,fontWeight:'700',color:'#1D9E75',textAlign:'right'}}>✓ وجه حقيقي مؤكد</Text>
                <Text style={{fontSize:10,lineHeight:16,color:colors.textMuted,textAlign:'right'}}>
                  min = {minScore!==null?pct(minScore):'—'} · 3/3 frames · Seuil strict
                </Text>
              </>
            ):(
              <>
                <Text style={{fontSize:12,fontWeight:'700',color:'#E24B4A',textAlign:'right'}}>⚠ تحقق فاشل</Text>
                <Text style={{fontSize:10,lineHeight:16,color:colors.textMuted,textAlign:'right'}}>{errMsg}</Text>
              </>
            )}
          </Animated.View>
        )}

        {/* Boutons */}
        {(phase==='idle'||phase==='reset') && (
          <TouchableOpacity style={[S.btn,{backgroundColor:phase==='reset'?colors.bgCard:colors.gold}]}
            onPress={startCapture} disabled={phase==='reset'} activeOpacity={0.85}>
            {phase==='reset'
              ?<ActivityIndicator size="small" color={colors.gold}/>
              :<Text style={[S.btnTxt,{color:colors.bg}]}>بدء التحقق — Lancer</Text>}
          </TouchableOpacity>
        )}
        {(phase==='capturing'||phase==='analyzing') && (
          <View style={[S.btn,{backgroundColor:colors.bgCard,borderColor:colors.border,borderWidth:0.5}]}>
            <ActivityIndicator size="small" color={colors.gold} style={{marginRight:8}}/>
            <Text style={{color:colors.textMuted,fontSize:13}}>
              {phase==='analyzing'?'MiniFASNet analyse...':`Capture ${currentFrame}/${N_FRAMES}...`}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={[S.info,{backgroundColor:colors.bgCard,borderColor:colors.border}]}>
          <Text style={{fontSize:9,textAlign:'center',lineHeight:14,color:colors.textMuted}}>
            MiniFASNet V2 · Silent Anti-Spoofing · {N_FRAMES} frames · min {'>'} {pct(THRESHOLD)}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const S = StyleSheet.create({
  safe:    {flex:1},
  center:  {flex:1,alignItems:'center',justifyContent:'center',padding:24,gap:16},
  hdr:     {flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingVertical:10,borderBottomWidth:0.5},
  back:    {width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center'},
  hTitle:  {fontSize:13,fontWeight:'600'},
  hSub:    {fontSize:9},
  badge:   {borderRadius:6,borderWidth:0.5,paddingHorizontal:8,paddingVertical:3},
  body:    {padding:16,alignItems:'center',gap:14,paddingBottom:24},
  ring:    {width:190,height:190,borderRadius:95,borderWidth:3,overflow:'hidden'},
  cam:     {width:'100%',height:'100%'},
  ov:      {...StyleSheet.absoluteFillObject,backgroundColor:'#00000077',alignItems:'center',justifyContent:'center'},
  rec:     {position:'absolute',top:10,left:10,backgroundColor:'#0F0D0A99',borderRadius:6,paddingHorizontal:6,paddingVertical:3},
  iAr:     {fontSize:12,fontWeight:'600',textAlign:'center'},
  iFr:     {fontSize:10,textAlign:'center'},
  progBg:  {width:'100%',height:8,borderRadius:4,overflow:'hidden',borderWidth:0.5},
  progFill:{height:'100%',borderRadius:4},
  chip:    {flex:1,borderRadius:10,borderWidth:0.5,padding:8,alignItems:'center'},
  msg:     {width:'100%',borderRadius:12,borderWidth:0.5,padding:12,gap:4},
  btn:     {width:'100%',paddingVertical:14,borderRadius:14,alignItems:'center',flexDirection:'row',justifyContent:'center'},
  btnTxt:  {fontSize:14,fontWeight:'700'},
  info:    {width:'100%',borderRadius:10,borderWidth:0.5,padding:9},
  permTitle:{fontSize:16,fontWeight:'600',textAlign:'center'},
  permSub: {fontSize:13,textAlign:'center',lineHeight:20},
});