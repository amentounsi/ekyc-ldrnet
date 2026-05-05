// App.tsx — Attijari eKYC
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider }       from './src/context/AppContext';
import { HomeScreen }        from './src/screens/HomeScreen';
import { SplashScreen }      from './src/screens/SplashScreen';
import { LoginScreen }       from './src/screens/LoginScreen';
import { RegisterScreen }    from './src/screens/RegisterScreen';
import { OTPScreen }         from './src/screens/OTPScreen';
import { FormScreen }        from './src/screens/FormScreen';      // ← nouveau
import { SignatureScreen }   from './src/screens/SignatureScreen';
import { RecapScreen }       from './src/screens/RecapScreen';
import { BankCardScreen }    from './src/screens/BankCardScreen';
import { MapScreen }         from './src/screens/MapScreen';
import { SettingsScreen }    from './src/screens/SettingsScreen';
import { PINScreen }         from './src/screens/PINScreen';
import { ChatScreen }        from './src/screens/ChatScreen';
import { LivenessScreen }    from './src/screens/LivenessScreen';
import { CINScreen }         from './src/screens/CINScreen';
const Placeholder = ({ route }: any) => {
  const { View, Text, StyleSheet } = require('react-native');
  const s = StyleSheet.create({
    c:     { flex:1, backgroundColor:'#0F0D0A', alignItems:'center', justifyContent:'center', gap:12 },
    title: { color:'#E8890C', fontSize:20, fontWeight:'700' },
    sub:   { color:'#555',    fontSize:12 },
  });
  return (
    <View style={s.c}>
      <Text style={s.title}>{route.name}</Text>
      <Text style={s.sub}>🚧 En cours de développement...</Text>
    </View>
  );
};

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown:  false,
              animation:    'slide_from_right',
              contentStyle: { backgroundColor: '#0F0D0A' },
            }}
          >
            {/* ── Auth ─────────────────────────────────────────────── */}
            <Stack.Screen name="Splash"    component={SplashScreen}   />
            <Stack.Screen name="Login"     component={LoginScreen}    />
            <Stack.Screen name="Register"  component={RegisterScreen} />
            <Stack.Screen name="OTP"       component={OTPScreen}      />

            {/* ── eKYC Flow ────────────────────────────────────────── */}
            {/* Step 1 */ }
            <Stack.Screen name="Home"      component={HomeScreen}     />
            <Stack.Screen name="CIN"       component={CINScreen}      />
            {/* Step 2 */}
            <Stack.Screen name="Liveness"  component={LivenessScreen}    />
            {/* Step 3 — Formulaire ← nouveau */}
            <Stack.Screen name="Form"      component={FormScreen}     />
            {/* Step 4 */}
            <Stack.Screen name="Sign"      component={SignatureScreen} />
            {/* Step 5 */}
            <Stack.Screen name="Recap"     component={RecapScreen}    />
            <Stack.Screen name="Card"      component={BankCardScreen} />

            {/* ── Utilitaires ──────────────────────────────────────── */}
            <Stack.Screen name="Map"       component={MapScreen}      />
            <Stack.Screen name="Settings"  component={SettingsScreen} />
            <Stack.Screen name="PIN"       component={PINScreen}      />
            <Stack.Screen name="Chat"      component={ChatScreen}     />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}