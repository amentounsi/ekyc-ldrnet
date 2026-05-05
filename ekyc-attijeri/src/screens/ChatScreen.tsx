// src/screens/ChatScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';

type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

interface Message {
  id:   number;
  text: string;
  from: 'user' | 'bot';
  time: string;
}

const FAQ = [
  { q: 'كيف أفتح حساب؟',              a: 'قم بإتمام جميع مراحل eKYC: مسح البطاقة، فيديو التحقق، التوقيع، ثم أرسل الملف.' },
  { q: 'Combien de temps ?',           a: 'Le processus prend moins de 5 minutes. Votre compte sera activé sous 48h ouvrables.' },
  { q: 'ما هي الوثائق المطلوبة؟',       a: 'بطاقة التعريف الوطنية سارية المفعول فقط. لا حاجة لوثائق أخرى.' },
  { q: 'J\'ai oublié mon PIN',         a: 'Allez dans Paramètres → PIN Sécurité → Réinitialiser. Une vérification OTP sera requise.' },
  { q: 'هل التطبيق آمن؟',              a: 'نعم، جميع بياناتك مشفرة ومحمية وفق معايير البنك المركزي التونسي.' },
  { q: 'Comment trouver une agence ?', a: 'Allez dans l\'onglet Agences → activez le GPS → les agences proches s\'affichent sur la carte.' },
];

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export const ChatScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id:   0,
      text: 'مرحباً! أنا المساعد الآلي لـ Attijari Bank. كيف يمكنني مساعدتك؟ 🏦',
      from: 'bot',
      time: now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);

  const addMessage = (text: string, from: 'user' | 'bot') => {
    setMessages(prev => [...prev, { id: Date.now(), text, from, time: now() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleFAQ = (q: string, a: string) => {
    addMessage(q, 'user');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      addMessage(a, 'bot');
    }, 600);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    addMessage(text, 'user');
    setTyping(true);

    // Réponse automatique simple
    setTimeout(() => {
      setTyping(false);
      const lower = text.toLowerCase();
      let reply = 'شكراً على سؤالك! فريقنا سيرد عليك خلال دقائق. يمكنك أيضاً الاتصال على 71 148 000.';
      if (lower.includes('حساب') || lower.includes('compte'))
        reply = 'لفتح حساب، يرجى إكمال جميع مراحل eKYC. اضغط على "ابدأ الآن" في الصفحة الرئيسية.';
      else if (lower.includes('pin') || lower.includes('رمز'))
        reply = 'لإعادة تعيين PIN، اذهب إلى الإعدادات ← PIN Sécurité.';
      else if (lower.includes('agence') || lower.includes('وكالة'))
        reply = 'يمكنك إيجاد أقرب الوكالات من خلال تفعيل GPS في قسم "الوكالات".';
      addMessage(reply, 'bot');
    }, 800);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.bgCard }]}>
          <Text style={{ color: colors.textSec, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <View style={[styles.botAvatar, { backgroundColor: colors.bgCard, borderColor: colors.gold }]}>
          <Text style={{ fontSize: 16 }}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPri }]}>Support Attijari</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={[styles.onlineDot, { backgroundColor: colors.green }]} />
            <Text style={[styles.headerSub, { color: colors.green }]}>En ligne · متصل</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg => (
            <View
              key={msg.id}
              style={[
                styles.msgWrap,
                { alignItems: msg.from === 'user' ? 'flex-end' : 'flex-start' },
              ]}
            >
              <View style={[
                styles.bubble,
                msg.from === 'user'
                  ? { backgroundColor: colors.gold, borderBottomRightRadius: 2 }
                  : { backgroundColor: colors.bgCard, borderBottomLeftRadius: 2, borderColor: colors.border, borderWidth: 0.5 },
              ]}>
                <Text style={[
                  styles.bubbleTxt,
                  { color: msg.from === 'user' ? colors.bg : colors.textPri },
                ]}>
                  {msg.text}
                </Text>
              </View>
              <Text style={[styles.timeStamp, { color: colors.textMuted }]}>{msg.time}</Text>
            </View>
          ))}

          {/* Typing indicator */}
          {typing && (
            <View style={styles.msgWrap}>
              <View style={[styles.bubble, { backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 0.5 }]}>
                <Text style={[styles.bubbleTxt, { color: colors.textMuted }]}>...</Text>
              </View>
            </View>
          )}

          {/* FAQ rapide */}
          {messages.length === 1 && (
            <View style={styles.faqSection}>
              <Text style={[styles.faqTitle, { color: colors.textMuted }]}>أسئلة شائعة — FAQ rapide</Text>
              {FAQ.map((item, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.faqBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                  onPress={() => handleFAQ(item.q, item.a)}
                >
                  <Text style={[styles.faqTxt, { color: colors.textSec }]}>{item.q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={[styles.inputBar, { backgroundColor: colors.bgCard, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.inp, { backgroundColor: colors.bgDark2, color: colors.textPri, borderColor: colors.border }]}
            placeholder="اكتب سؤالك..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.gold }]}
            onPress={handleSend}
          >
            <Text style={{ color: colors.bg, fontSize: 16 }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  backBtn:         { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  botAvatar:       { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  onlineDot:       { width: 6, height: 6, borderRadius: 3 },
  headerTitle:     { fontSize: 12, fontWeight: '600' },
  headerSub:       { fontSize: 9 },
  messagesContent: { padding: 14, paddingBottom: 8, gap: 8 },
  msgWrap:         { marginVertical: 2 },
  bubble:          { maxWidth: '80%', padding: 10, borderRadius: 14 },
  bubbleTxt:       { fontSize: 13, lineHeight: 20 },
  timeStamp:       { fontSize: 9, marginTop: 2, marginHorizontal: 4 },
  faqSection:      { marginTop: 12, gap: 6 },
  faqTitle:        { fontSize: 10, textAlign: 'center', marginBottom: 4 },
  faqBtn:          { padding: 10, borderRadius: 10, borderWidth: 0.5 },
  faqTxt:          { fontSize: 12, textAlign: 'right' },
  inputBar:        { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 0.5 },
  inp:             { flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 0.5, fontSize: 13 },
  sendBtn:         { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});