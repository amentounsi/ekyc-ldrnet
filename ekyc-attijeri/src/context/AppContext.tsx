// src/context/AppContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, COLORS_LIGHT } from '../constants/colors';
import { T, Lang } from '../constants/translations';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StepStatus {
  1: boolean; // CIN
  2: boolean; // Liveness
  3: boolean; // Formulaire ← nouveau (était Signature)
  4: boolean; // Signature   ← décalé
  5: boolean; // Récapitulatif ← décalé (Maps supprimé des étapes)
}

export interface DossierData {
  cin_number:    string;
  nom_ar:        string;
  prenom_ar:     string;
  nom_lat:       string;
  prenom_lat:    string;
  dob:           string;
  pob:           string;
  expiry:        string;
  signatureUri:  string | null;
  selfieUri:     string | null;
  submittedAt:   string | null;
  // Formulaire
  telephone:     string;
  email:         string;
  adresse:       string;
  situationPro:  string;
  revenuMensuel: string;
  typeCompte:    string;
}

export interface AppState {
  isDark:       boolean;
  colors:       typeof COLORS;
  toggleTheme:  () => void;
  lang:         Lang;
  t:            (key: string) => string;
  setLang:      (l: Lang) => void;
  steps:        StepStatus;
  progress:     number;
  completeStep: (n: keyof StepStatus) => void;
  dossier:      DossierData;
  updateDossier:(data: Partial<DossierData>) => void;
  isOnline:     boolean;
  hasPin:       boolean;
  pinValue:     string;
  setPin:       (pin: string) => void;
  bioEnabled:   boolean;
  setBio:       (v: boolean) => void;
  rating:       number;
  setRating:    (n: number) => void;
}

// ─── Valeurs par défaut ───────────────────────────────────────────────────────

const defaultDossier: DossierData = {
  cin_number:    '',
  nom_ar:        '',
  prenom_ar:     '',
  nom_lat:       '',
  prenom_lat:    '',
  dob:           '',
  pob:           '',
  expiry:        '',
  signatureUri:  null,
  selfieUri:     null,
  submittedAt:   null,
  telephone:     '',
  email:         '',
  adresse:       '',
  situationPro:  '',
  revenuMensuel: '',
  typeCompte:    'Courant',
};

const defaultSteps: StepStatus = { 1: false, 2: false, 3: false, 4: false, 5: false };

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppState>({} as AppState);
export const useApp = () => useContext(AppContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark,      setIsDark]      = useState(true);
  const [lang,        setLangState]   = useState<Lang>('ar');
  const [steps,       setSteps]       = useState<StepStatus>(defaultSteps);
  const [dossier,     setDossier]     = useState<DossierData>(defaultDossier);
  const [isOnline,    setIsOnline]    = useState(true);
  const [hasPin,      setHasPin]      = useState(false);
  const [pinValue,    setPinValue]    = useState('');
  const [bioEnabled,  setBioEnabled]  = useState(false);
  const [rating,      setRatingState] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const savedTheme   = await AsyncStorage.getItem('att_theme');
        const savedLang    = await AsyncStorage.getItem('att_lang');
        const savedSteps   = await AsyncStorage.getItem('att_steps');
        const savedDossier = await AsyncStorage.getItem('att_dossier');
        const savedPin     = await AsyncStorage.getItem('att_pin');
        const savedBio     = await AsyncStorage.getItem('att_bio');

        if (savedTheme)   setIsDark(savedTheme === 'dark');
        if (savedLang)    setLangState(savedLang as Lang);
        if (savedSteps)   setSteps(JSON.parse(savedSteps));
        if (savedDossier) setDossier({ ...defaultDossier, ...JSON.parse(savedDossier) });
        if (savedPin)     { setPinValue(savedPin); setHasPin(true); }
        if (savedBio)     setBioEnabled(savedBio === 'true');
      } catch (e) {
        console.log('Storage load error:', e);
      }
    })();
  }, []);

  const colors = isDark ? COLORS : COLORS_LIGHT;

  const toggleTheme = useCallback(async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem('att_theme', next ? 'dark' : 'light');
  }, [isDark]);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem('att_lang', l);
  }, []);

  const t = useCallback((key: string): string => {
    return T[lang]?.[key] || T['fr']?.[key] || key;
  }, [lang]);

  const completeStep = useCallback(async (n: keyof StepStatus) => {
    const next = { ...steps, [n]: true };
    setSteps(next);
    await AsyncStorage.setItem('att_steps', JSON.stringify(next));
  }, [steps]);

  const progress = Math.round(
    (Object.values(steps).filter(Boolean).length / 5) * 100
  );

  const updateDossier = useCallback(async (data: Partial<DossierData>) => {
    const next = { ...dossier, ...data };
    setDossier(next);
    await AsyncStorage.setItem('att_dossier', JSON.stringify(next));
  }, [dossier]);

  const setPin = useCallback(async (pin: string) => {
    setPinValue(pin);
    setHasPin(!!pin);
    await AsyncStorage.setItem('att_pin', pin);
  }, []);

  const setBio = useCallback(async (v: boolean) => {
    setBioEnabled(v);
    await AsyncStorage.setItem('att_bio', String(v));
  }, []);

  const setRating = useCallback((n: number) => setRatingState(n), []);

  return (
    <AppContext.Provider value={{
      isDark, colors, toggleTheme,
      lang, t, setLang,
      steps, progress, completeStep,
      dossier, updateDossier,
      isOnline, hasPin, pinValue, setPin,
      bioEnabled, setBio,
      rating, setRating,
    }}>
      {children}
    </AppContext.Provider>
  );
};