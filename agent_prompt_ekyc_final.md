# Agent Prompt — Intégration des nouveaux écrans eKYC Attijari (Plan Final)

## Contexte du projet

Tu travailles sur un projet React Native (Expo + react-native-vision-camera) nommé **ekyc-ettijeri**.
Application eKYC pour Attijari Bank Tunisie. Stack : TypeScript, React Navigation native stack, modules natifs Android NDK/C++ (JNI) pour la détection de carte CIN.

**Règle absolue :** Zéro modification sur la logique native/capture/validation.
Les fichiers `CardDetectorModule`, `BarcodeService`, `useCardDetection`, `CardDetector.h/.cpp`, `OfficialCINValidator` ne sont **jamais touchés**.

---

## Architecture actuelle du flow CIN

```
App.tsx (Stack Navigator)
  └── "CIN" → CINScreen.tsx           ← orchestrateur du sous-flow
        ├── subScreen === 'scanning'   → CINScanScreen.tsx  (CameraScreen export)
        └── subScreen === 'result'     → CINResultScreen.tsx (ResultScreen export)
```

**États internes clés de CINScanScreen :**
- `autoCaptureState: 'WAIT_FRONT' | 'WAIT_BACK' | 'FINISHED'`
- `ENABLE_AUTO_CAPTURE = false` → mode manuel uniquement
- `expectedSide` dérivé : `'FRONT'` si `WAIT_FRONT`, `'BACK'` si `WAIT_BACK`
- `onScanComplete(frontImage, backImage, facePhoto, barcodeData)` → callback principal
- Hook `useCardDetection` + `useDetectionTimeout` → ne pas modifier

---

## Flow final attendu

```
CINScreen (orchestrateur)
  │
  ├─ [intro]           → CINIntroScreen
  │                         │ onStart()
  ├─ [guide_front]     → CINGuideFrontScreen
  │                         │ onProceed()
  ├─ [scanning_front]  → CINScanScreen  (key="front", expectedSideOverride="FRONT")
  │                         │ onFrontCaptured(frontImage, facePhoto)
  │                         │   → stocke dans CINScreen + setSubScreen('guide_back')
  ├─ [guide_back]      → CINGuideBackScreen
  │                         │ onProceed()
  ├─ [scanning_back]   → CINScanScreen  (key="back",  expectedSideOverride="BACK")
  │                         │ onScanComplete(front, back, face, barcode)
  │                         │   → setSubScreen('processing')
  ├─ [processing]      → CINProcessingScreen           ← NOUVEAU
  │                         │ onComplete(validationResult)
  │                         │   → setValidation + setSubScreen('result')
  └─ [result]          → CINResultScreen
                             │ onConfirm() → navigation.navigate('Liveness', { cinData })
                             │ onRescan()  → reset tout + setSubScreen('intro')
```

**Décision d'architecture — instance CINScanScreen :**
Utiliser **une seule instance remontée via `key` prop** (pas deux renders séparés).
`<CINScanScreen key={subScreen} ... />` force un remount propre entre FRONT et BACK,
réinitialisant tous les états internes (overlays, qualityWarning, autoCaptureState).
Le debug panel se reset aussi entre les deux passes — comportement acceptable.

---

## Phase 1 — Nouveaux composants overlay (parallélisable)

### 1a. `src/components/CaptureSuccessOverlay.tsx`

**Props :**
```typescript
interface CaptureSuccessOverlayProps {
  message: string;        // ex: "Recto validé ✓"
  subMessage?: string;    // ex: "Passez au verso"
  onComplete: () => void; // appelé après auto-dismiss
}
```

**UI :**
- `View` absolute `StyleSheet.absoluteFill`, `backgroundColor: 'rgba(0,0,0,0.82)'`
- Cercle vert pulsant `#1DB954` : `Animated.loop` sur `scale` (1.0→1.12→1.0) + `opacity`
- Checkmark SVG via `react-native-svg` : `Path` avec `strokeDashoffset` animé `36→0` en 500ms
- Texte `message` blanc 18px bold
- Texte `subMessage` blanc 13px opacity 0.55
- Auto-dismiss : `setTimeout(onComplete, 1500)`
- Les coins du cadre parent doivent passer en vert → géré par prop `frameState` dans CINScanScreen (voir Phase 3)

**Animations React Native :**
```typescript
// Pulse vert
const pulseAnim = useRef(new Animated.Value(0)).current;
Animated.loop(
  Animated.sequence([
    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
  ])
).start();
```

---

### 1b. `src/components/CaptureFailOverlay.tsx`

**Props :**
```typescript
interface CaptureFailOverlayProps {
  title?: string;      // défaut: "Capture échouée"
  tips: string[];      // 2-3 conseils selon le type d'erreur
  onRetry: () => void; // reset overlay + réessayer
}
```

**UI :**
- `View` absolute `StyleSheet.absoluteFill`, même fond semi-transparent
- Cercle rouge pulsant `#CC1B2B` : même animation que succès mais en rouge
- Croix SVG : deux `Line` éléments react-native-svg
- Titre `title` blanc 18px bold
- Liste de tips : chaque ligne = cercle doré `#C8963C` 5px + texte 11px `rgba(255,255,255,0.65)`
- Bouton `"Réessayer"` : rouge plein `#CC1B2B`, border-radius 11, 80% largeur → `onRetry()`
- **Pas d'auto-dismiss** — attend que l'utilisateur appuie sur "Réessayer"

**Animation shake du cadre** (déclenchée depuis CINScanScreen au moment de l'échec, avant d'afficher l'overlay) :
```typescript
const shakeAnim = useRef(new Animated.Value(0)).current;
// Dans handleManualCapturePress en cas d'échec :
Animated.sequence([
  Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
  Animated.timing(shakeAnim, { toValue: 6,  duration: 60, useNativeDriver: true }),
  Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
  Animated.timing(shakeAnim, { toValue: 5,  duration: 60, useNativeDriver: true }),
  Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
]).start(() => setCaptureOverlayState('fail'));
// Le cadre SVG est wrappé dans <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
```

---

## Phase 2 — Nouveaux écrans guide (parallélisable)

### Règles communes à tous les écrans guide

- `StatusBar barStyle="light-content"` forcé dans chaque écran
- `BackHandler` Android géré dans chaque écran pour naviguer vers l'écran précédent du sous-flow (pas quitter l'app) — les écrans n'ont pas accès à `navigation` directement, ils reçoivent `onBack?: () => void` en prop optionnelle
- Fonts : `System` en React Native (pas DM Sans — non bundlé nativement)
- Couleurs depuis `src/constants/cinTheme.ts` : `Colors.primary (#E30613)`, `Colors.accent (#F5A623)`, `Colors.success (#00C853)`
  > Note : dans les maquettes HTML les valeurs sont `#CC1B2B` (rouge) et `#C8963C` (or) et `#1DB954` (vert). Utiliser les constantes `cinTheme.ts` existantes qui sont équivalentes, ou les valeurs exactes des maquettes si les constantes diffèrent légèrement — priorité à la fidélité visuelle des maquettes.
- ScrollView si contenu dépasse l'écran (notamment CINIntroScreen)

---

### 2a. `src/screens/CINIntroScreen.tsx`

**Props :** `{ onStart: () => void, onBack?: () => void }`

**UI complète :**

```
┌─────────────────────────────────────┐
│  [Header rouge]  Logo A  |  Titre   │
├─────────────────────────────────────┤
│  [Hero SVG]  Icône carte + checkmark│
│  "Scanner votre CIN"  (titre 20px)  │
│  "Suivez ces étapes..."  (sub 13px) │
│                                     │
│  ── Étapes ──                       │
│  ① [cercle rouge] Recto de la CIN   │
│     "Présentez le côté avec votre   │
│      photo, nom et numéro CIN"      │
│  ② [cercle or]   Verso de la CIN    │
│     "Retournez la carte — alignez   │
│      le code-barres dans la zone"   │
│  ③ [cercle vert] Confirmation       │
│     "Vérifiez vos données extraites │
│      et confirmez"                  │
│                                     │
│  ┌─ Conditions requises ──────────┐ │
│  │ 💡 Bonne luminosité            │ │
│  │ 📋 Carte à plat, sans pli      │ │
│  │ 🎯 Centrez dans le cadre       │ │
│  │ 🚫 Pas de reflets ni d'ombre   │ │
│  │ 🔒 CIN tunisienne officielle   │ │
│  └────────────────────────────────┘ │
│                                     │
│  [Bouton rouge] Commencer           │
└─────────────────────────────────────┘
```

Hero SVG (72×72) :
```tsx
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
```

Conditions box : `backgroundColor: 'rgba(255,255,255,0.04)'`, `borderWidth: 0.5`, `borderColor: 'rgba(255,255,255,0.1)'`, `borderRadius: 12`

Chaque condition : icône SVG dans boîte colorée 28×28 `borderRadius: 8` + texte 12px `rgba(255,255,255,0.7)`

---

### 2b. `src/screens/CINGuideFrontScreen.tsx`

**Props :** `{ onProceed: () => void, onBack?: () => void }`

**UI complète :**
- Header Attijari rouge
- Barre de progression 3 étapes inline :
  - Étape 1 "Recto" : cercle rouge plein `#CC1B2B`, texte blanc
  - Ligne `height:0.5` `backgroundColor: 'rgba(255,255,255,0.1)'`
  - Étape 2 "Verso" : cercle `rgba(255,255,255,0.12)`, texte `rgba(255,255,255,0.4)`
  - Ligne
  - Étape 3 "Résultat" : idem étape 2
- Titre : "Côté face" 19px bold blanc
- Sous-titre : "Présentez ce côté — avec votre photo, nom et numéro" 13px grisé
- **Card SVG illustration** (voir détails ci-dessous)
- Pill label "Ce côté avec votre photo" : icône personne SVG + texte 12px blanc, fond `rgba(255,255,255,0.06)`, bordure `rgba(255,255,255,0.12)`, `borderRadius: 20`
- Checklist (3 lignes) :
  - ✅ vert 22×22 + "Votre photo et visage clairement visibles"
  - ✅ vert + "Nom, prénom et numéro CIN lisibles"
  - ❌ rouge + "Pas le verso — pas le code-barres"
- Bouton CTA rouge : "Scanner le recto" → `onProceed()`

**Card SVG illustration recto** (272×178, inspirée de `screen2.html`) :
```tsx
<Svg width="272" height="178" viewBox="0 0 272 178">
  {/* Ombre */}
  <Rect x="4" y="4" width="264" height="170" rx="16" fill="#D8C8D8" opacity="0.15"/>
  {/* Fond carte */}
  <Rect x="0" y="0" width="264" height="170" rx="16" fill="#C8AEBF"/>
  {/* Bordure verte validée */}
  <Rect x="0" y="0" width="264" height="170" rx="16" fill="none" stroke="#1DB954" strokeWidth="4"/>
  {/* Boîte photo rouge haut-gauche */}
  <Rect x="14" y="14" width="54" height="44" rx="6" fill="#CC1B2B" opacity="0.85"/>
  <Circle cx="41" cy="36" r="10" fill="none" stroke="white" strokeWidth="2.5"/>
  <Circle cx="41" cy="36" r="4" fill="white"/>
  {/* Silhouette cartoon */}
  <Ellipse cx="41" cy="90" rx="22" ry="14" fill="#3A3A3A"/>
  <Ellipse cx="41" cy="96" rx="18" ry="20" fill="#E8C4A0"/>
  <Ellipse cx="41" cy="82" rx="22" ry="12" fill="#3A3A3A"/>
  <Ellipse cx="34" cy="94" rx="3" ry="3.5" fill="#2A2A2A"/>
  <Ellipse cx="48" cy="94" rx="3" ry="3.5" fill="#2A2A2A"/>
  <Path d="M35 103 Q41 108 47 103" fill="none" stroke="#8B6040" strokeWidth="1.8" strokeLinecap="round"/>
  <Rect x="35" y="114" width="12" height="10" rx="3" fill="#E8C4A0"/>
  <Path d="M20 140 Q20 124 41 124 Q62 124 62 140" fill="#5A5A7A"/>
  {/* Label PHOTO */}
  <Rect x="14" y="120" width="54" height="14" rx="3" fill="#CC1B2B"/>
  <SvgText x="41" y="130" fontSize="7.5" fill="white" fontWeight="700" textAnchor="middle">PHOTO</SvgText>
  {/* Ligne accent violette */}
  <Rect x="78" y="20" width="170" height="6" rx="3" fill="#8855BB"/>
  {/* Lignes de données */}
  <Rect x="78" y="36" width="140" height="8" rx="3" fill="#4A4A5A"/>
  <Rect x="78" y="52" width="110" height="8" rx="3" fill="#4A4A5A" opacity="0.7"/>
  <Rect x="78" y="68" width="125" height="8" rx="3" fill="#4A4A5A" opacity="0.7"/>
  <Rect x="78" y="84" width="95"  height="8" rx="3" fill="#4A4A5A" opacity="0.5"/>
  <Rect x="78" y="102" width="90" height="10" rx="3" fill="#8855BB" opacity="0.7"/>
  {/* Bouclier doré haut-droite */}
  <Path d="M222 14 Q212 14 212 22 L212 38 Q212 50 222 54 Q232 50 232 38 L232 22 Q232 14 222 14 Z" fill="#C8963C"/>
  <Circle cx="222" cy="28" r="5" fill="#C8963C"/>
  {/* Bande numéro CIN bas */}
  <Path d="M0 148 L264 148 L264 162 Q264 170 248 170 L16 170 Q0 170 0 162 Z" fill="#B09AB0"/>
  <Rect x="14" y="156" width="100" height="6" rx="2" fill="rgba(255,255,255,0.3)"/>
</Svg>
```

---

### 2c. `src/screens/CINGuideBackScreen.tsx`

**Props :** `{ onProceed: () => void, onBack?: () => void }`

**UI complète :**
- Header Attijari rouge
- Barre de progression 3 étapes :
  - Étape 1 "Recto" : cercle vert `#1DB954` + checkmark ✓
  - Ligne verte `rgba(100,220,150,0.4)`
  - Étape 2 "Verso" : cercle rouge actif `#CC1B2B`, texte blanc
  - Ligne `rgba(255,255,255,0.1)`
  - Étape 3 "Résultat" : grisé
- Titre : "Côté verso" 19px bold blanc
- Sous-titre : "Retournez la carte — code-barres et empreinte" 13px grisé
- **Card SVG illustration** (voir détails ci-dessous)
- Pill label "Retournez la carte" : icône rotation SVG + texte blanc
- Checklist :
  - ✅ vert + "Code-barres en bas bien visible"
  - ✅ vert + "Pas de reflets ni ombre sur le code-barres"
  - ❌ rouge + "Pas le recto — pas de photo de visage"
- Bouton CTA rouge : "Scanner le verso" → `onProceed()`

**Card SVG illustration verso** (272×178, inspirée de `screen2.html`) :
```tsx
<Svg width="272" height="178" viewBox="0 0 272 178">
  <Rect x="4" y="4" width="264" height="170" rx="16" fill="#C8C8D8" opacity="0.15"/>
  <Rect x="0" y="0" width="264" height="170" rx="16" fill="#C0B8CC"/>
  <Rect x="0" y="0" width="264" height="170" rx="16" fill="none" stroke="#1DB954" strokeWidth="4"/>
  {/* Accent violet + lignes données gauche */}
  <Rect x="14" y="20" width="140" height="6" rx="3" fill="#7755AA"/>
  <Rect x="14" y="36" width="115" height="7" rx="3" fill="#4A4A5A"/>
  <Rect x="14" y="50" width="95"  height="7" rx="3" fill="#4A4A5A" opacity="0.75"/>
  <Rect x="14" y="66" width="105" height="7" rx="3" fill="#8855BB" opacity="0.8"/>
  <Rect x="14" y="80" width="85"  height="7" rx="3" fill="#8855BB" opacity="0.6"/>
  <Rect x="14" y="96" width="100" height="7" rx="3" fill="#4A4A5A" opacity="0.6"/>
  {/* Empreinte digitale droite — ellipses concentriques */}
  <Ellipse cx="196" cy="72" rx="44" ry="50" fill="#B8A8C0" opacity="0.4"/>
  <Ellipse cx="196" cy="72" rx="38" ry="43" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.6"/>
  <Ellipse cx="196" cy="72" rx="30" ry="34" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.65"/>
  <Ellipse cx="196" cy="72" rx="22" ry="25" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.7"/>
  <Ellipse cx="196" cy="72" rx="14" ry="16" fill="none" stroke="#4A3A5A" strokeWidth="2.2" opacity="0.75"/>
  <Ellipse cx="196" cy="72" rx="7"  ry="8"  fill="none" stroke="#4A3A5A" strokeWidth="2"   opacity="0.8"/>
  <Circle  cx="196" cy="72" r="2.5"         fill="#4A3A5A" opacity="0.7"/>
  {/* Séparateur */}
  <Line x1="8" y1="126" x2="256" y2="126" stroke="#9A8AAA" strokeWidth="1.5" opacity="0.8"/>
  {/* Zone code-barres blanc */}
  <Rect x="8" y="130" width="248" height="30" rx="4" fill="white" opacity="0.85"/>
  {/* Barres code-barres noires — répéter le pattern */}
  <Rect x="16" y="134" width="2" height="22" rx="0.3" fill="#222"/>
  <Rect x="21" y="134" width="1" height="22" rx="0.3" fill="#222"/>
  <Rect x="25" y="134" width="3" height="22" rx="0.3" fill="#222"/>
  {/* ... répéter jusqu'à x=252 avec pattern 2/1/3/1/2/1/3 */}
  {/* (voir screen2.html pour le pattern complet) */}
</Svg>
```

---

### 2d. `src/screens/CINProcessingScreen.tsx` ← NOUVEAU — ÉCRAN D'ATTENTE

**Rôle :** Écran affiché entre la fin du scan verso et l'affichage du résultat. Donne un retour visuel pendant que `validateScan()` s'exécute et que les données sont traitées.

**Props :**
```typescript
interface CINProcessingScreenProps {
  frontCaptured: boolean;   // toujours true à ce stade
  backCaptured: boolean;    // toujours true à ce stade
  barcodeData: CINBarcodeData | null;
  facePhoto: { base64: string; width: number; height: number } | null;
  onComplete: (validation: ValidationResult) => void;
}
```

**Logique :**
```typescript
useEffect(() => {
  // Délai minimum pour que l'animation soit visible même si validation est synchrone
  const timer = setTimeout(() => {
    const validation = validateScan({ frontImage, backImage, facePhoto, barcodeData });
    onComplete(validation);
  }, 800); // 800ms minimum
  return () => clearTimeout(timer);
}, []);
```

**UI complète (basée sur `attijari_cin_scan_screens.html` — Écran 3 "Analyse en cours") :**

```
┌─────────────────────────────────────┐
│  [Header rouge] Logo A | Analyse... │
├─────────────────────────────────────┤
│                                     │
│         [Spinner ring rouge]        │
│          Logo "A" au centre         │
│                                     │
│    "Analyse de votre CIN"  (17px)   │
│  "Veuillez patienter..."   (13px)   │
│                                     │
│           ● ● ●  (dots animés)      │
│                                     │
│  ┌────────────────────────────────┐ │
│  │ ✓ Capture recto validée    OK  │ │
│  │ ✓ Capture verso validée    OK  │ │
│  │ ⟳ Lecture code-barres PDF417...│ │
│  │ ○ Extraction photo visage      │ │
│  │ ○ Vérification des données     │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Détail des étapes (5 steps) :**

| Index | Label | État initial |
|-------|-------|-------------|
| 0 | Capture recto validée | `done` (✓ vert) |
| 1 | Capture verso validée | `done` (✓ vert) |
| 2 | Lecture code-barres PDF417... | `active` (spinner rouge) |
| 3 | Extraction photo visage | `pending` (cercle grisé) |
| 4 | Vérification des données | `pending` (cercle grisé) |

Animation des steps : utiliser `useEffect` + `Animated.timing` pour faire progresser les étapes une par une avec des délais de 200ms entre chaque (purement cosmétique).

**Spinner ring :**
```typescript
const spinAnim = useRef(new Animated.Value(0)).current;
Animated.loop(
  Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: true })
).start();
const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
// <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]} />
```

**Dots animés :**
```typescript
// 3 dots avec Animated.loop + staggered delay
// dot1: 0ms delay, dot2: 200ms, dot3: 400ms
// Animation: scale 0.7→1→0.7 + opacity 0.5→1→0.5
```

**Strings à ajouter dans `src/constants/cinTheme.ts` :**
```typescript
processing: {
  headerTitle: 'Analyse en cours...',
  headerSub: 'Traitement de votre CIN',
  title: 'Analyse de votre CIN',
  subtitle: 'Veuillez patienter quelques instants...',
  step1: 'Capture recto validée',
  step2: 'Capture verso validée',
  step3: 'Lecture code-barres PDF417...',
  step4: 'Extraction photo visage',
  step5: 'Vérification des données',
},
```

---

## Phase 3 — Modification de `CINScanScreen.tsx` (UI uniquement)

### 3.1 — Ajout aux props

```typescript
interface CameraScreenProps {
  // ... props existantes conservées ...
  expectedSideOverride?: 'FRONT' | 'BACK';
  injectedFrontImage?: { base64: string; width: number; height: number } | null;
  onFrontCaptured?: (
    frontImage: { base64: string; width: number; height: number },
    facePhoto: { base64: string; width: number; height: number } | null
  ) => void;
}
```

### 3.2 — Modification de `expectedSide`

```typescript
const expectedSide = useMemo(() => {
  if (props.expectedSideOverride) return props.expectedSideOverride;
  return autoCaptureState === 'WAIT_FRONT' ? 'FRONT' : 'BACK';
}, [autoCaptureState, props.expectedSideOverride]);
```

### 3.3 — Nouveaux états overlay

```typescript
const [captureOverlayState, setCaptureOverlayState] = useState<'idle' | 'success' | 'fail'>('idle');
const [captureOverlayMessage, setCaptureOverlayMessage] = useState('');
const [captureOverlaySubMessage, setCaptureOverlaySubMessage] = useState('');
const [failTitle, setFailTitle] = useState('Capture échouée');
const [failTips, setFailTips] = useState<string[]>([]);
const shakeAnim = useRef(new Animated.Value(0)).current;
```

### 3.4 — Modification de `handleManualCapturePress`

Remplacer `setManualCaptureError(...)` par les overlays :

**En cas d'échec :**
```typescript
// Déterminer le type d'erreur et les tips contextuels
const triggerFailOverlay = (errorType: 'blur' | 'layout' | 'barcode') => {
  const tipsMap = {
    blur: [
      'Maintenez la carte immobile dans le cadre',
      'Améliorez l\'éclairage ambiant',
      'Évitez les reflets sur la carte',
    ],
    layout: [
      'Utilisez uniquement une CIN tunisienne officielle',
      'Assurez-vous que la carte est entière dans le cadre',
      'Tenez la carte horizontalement',
    ],
    barcode: [
      'Alignez le code-barres PDF417 dans la zone dorée',
      'Assurez une bonne luminosité — évitez les reflets',
      'Code-barres non endommagé et entièrement visible',
    ],
  };
  setFailTitle(errorType === 'barcode' ? 'Code-barres non lu' : 'Capture échouée');
  setFailTips(tipsMap[errorType]);
  // Shake animation d'abord, overlay ensuite
  Animated.sequence([...shakeSequence...]).start(() => setCaptureOverlayState('fail'));
};
```

**Deux branches distinctes pour le verso :**
- Erreur de **capture** (flou, layout invalide avant lecture barcode) → `triggerFailOverlay('blur')` ou `triggerFailOverlay('layout')`
- Erreur de **barcode** post-capture réussie (ZXing ne lit pas) → `triggerFailOverlay('barcode')`

**En cas de succès FRONT :**
```typescript
setCaptureOverlayMessage('Recto validé ✓');
setCaptureOverlaySubMessage('Passez au verso de la carte');
setCaptureOverlayState('success');
// onComplete de l'overlay → props.onFrontCaptured(frontImage, facePhoto)
```

**En cas de succès BACK :**
```typescript
setCaptureOverlayMessage('Verso validé ✓');
setCaptureOverlaySubMessage('Analyse en cours...');
setCaptureOverlayState('success');
// onComplete de l'overlay → props.onScanComplete(front, back, face, barcode)
// Note: front récupéré depuis props.injectedFrontImage
```

### 3.5 — Éléments UI à SUPPRIMER du JSX

| Bloc JSX | Condition de suppression |
|----------|--------------------------|
| `<View style={styles.guidanceBanner}>` | Supprimer entièrement (3 états : WAIT_FRONT, WAIT_BACK, FINISHED) |
| `<View style={styles.progressContainer}>` | Supprimer (2 dots simples) |
| `<View style={styles.manualCaptureContainer}>` | Supprimer (bouton texte brut + error text) |
| `<TouchableOpacity style={styles.resetButton}>` | Supprimer ("↺ Start Over") |

### 3.6 — Éléments UI à AJOUTER dans le JSX

Ajouter **après** `<CINScanFrame>` et **avant** le debug panel, dans cet ordre :

```tsx
{/* 1. Instruction text pill — haut de l'écran */}
<View style={styles.instructionPill}>
  <Text style={styles.instructionText}>
    {expectedSide === 'FRONT'
      ? 'Placez le côté face de votre CIN dans le cadre'
      : 'Retournez la carte — placez le verso dans le cadre'}
  </Text>
</View>

{/* 2. Status pill — sous le cadre */}
<View style={styles.statusRow}>
  <View style={[styles.statusPill, {
    backgroundColor: expectedSide === 'FRONT'
      ? 'rgba(204,27,43,0.12)'
      : 'rgba(200,150,60,0.12)',
    borderColor: expectedSide === 'FRONT'
      ? 'rgba(204,27,43,0.3)'
      : 'rgba(200,150,60,0.3)',
  }]}>
    <Animated.View style={[styles.statusDot, {
      backgroundColor: expectedSide === 'FRONT' ? '#CC1B2B' : '#C8963C',
      // blinkAnim opacity
    }]} />
    <Text style={styles.statusText}>
      {expectedSide === 'FRONT'
        ? 'En attente de la carte...'
        : 'Alignez le code-barres dans la zone...'}
    </Text>
  </View>
</View>

{/* 3. Progress 3 dots */}
<View style={styles.progressDotsRow}>
  {/* dot1: rouge actif si FRONT, vert done si BACK */}
  {/* dot2: rouge actif si BACK, grisé si FRONT */}
  {/* dot3: toujours grisé */}
</View>

{/* 4. Capture button */}
<View style={styles.captureButtonContainer}>
  <TouchableOpacity
    style={[styles.captureButton, manualCaptureBusy && styles.captureButtonDisabled]}
    onPress={handleManualCapturePress}
    disabled={manualCaptureBusy || captureOverlayState !== 'idle'}
  >
    <Svg width="18" height="18" viewBox="0 0 18 18">
      <Circle cx="9" cy="9" r="6.5" fill="none" stroke="white" strokeWidth="1.8"/>
      <Circle cx="9" cy="9" r="3" fill="white"/>
    </Svg>
    <Text style={styles.captureButtonText}>
      {manualCaptureBusy
        ? 'Vérification...'
        : expectedSide === 'FRONT'
        ? 'Capturer le recto'
        : 'Capturer le verso'}
    </Text>
  </TouchableOpacity>
</View>

{/* 5. Overlays (absolute, z-index élevé) */}
{captureOverlayState === 'success' && (
  <CaptureSuccessOverlay
    message={captureOverlayMessage}
    subMessage={captureOverlaySubMessage}
    onComplete={() => {
      setCaptureOverlayState('idle');
      // déclencher le callback approprié selon expectedSide
    }}
  />
)}
{captureOverlayState === 'fail' && (
  <CaptureFailOverlay
    title={failTitle}
    tips={failTips}
    onRetry={() => {
      setCaptureOverlayState('idle');
      setManualCaptureError(null);
    }}
  />
)}
```

### 3.7 — Styles à SUPPRIMER du `StyleSheet.create`

```
guidanceBanner, guidanceStep, guidanceIcon, guidanceTitle, guidanceSub, guidanceCheckmark,
progressContainer, progressDot, progressLine, progressDotActive, progressDotComplete,
manualCaptureContainer, manualCaptureButton, manualCaptureButtonDisabled,
manualCaptureButtonText, manualCaptureError,
resetButton, resetButtonWithManual, resetButtonText
```

### 3.8 — Debug panel

Le panel debug (`showDebugInfo`) reste **inchangé et fonctionnel** en mode `__DEV__`.
Il est positionné en bas, après les nouveaux boutons.
Aucune modification à son contenu ou sa logique.

---

## Phase 4 — Modification de `CINScreen.tsx`

### 4.1 — Nouveau type CINSubScreen

```typescript
type CINSubScreen =
  | 'intro'
  | 'guide_front'
  | 'scanning_front'
  | 'guide_back'
  | 'scanning_back'
  | 'processing'       // ← NOUVEAU
  | 'result';
```

### 4.2 — État initial

```typescript
const [subScreen, setSubScreen] = useState<CINSubScreen>('intro'); // ← était 'scanning'
```

### 4.3 — État supplémentaire pour stocker le recto

```typescript
// Stockage intermédiaire du recto capturé (entre scanning_front et scanning_back)
const [capturedFrontData, setCapturedFrontData] = useState<{
  frontImage: { base64: string; width: number; height: number };
  facePhoto: { base64: string; width: number; height: number } | null;
} | null>(null);
```

### 4.4 — Handlers

```typescript
const handleIntroStart = useCallback(() => setSubScreen('guide_front'), []);

const handleGuideFrontProceed = useCallback(() => setSubScreen('scanning_front'), []);

const handleGuideBackProceed = useCallback(() => setSubScreen('scanning_back'), []);

// Appelé par CINScanScreen quand le recto est capturé avec succès
const handleFrontCaptured = useCallback((
  frontImage: { base64: string; width: number; height: number },
  facePhoto: { base64: string; width: number; height: number } | null
) => {
  setCapturedFrontData({ frontImage, facePhoto });
  setSubScreen('guide_back');
}, []);

// Appelé par CINScanScreen quand recto + verso + barcode sont prêts
const handleScanComplete = useCallback((
  frontImage: { base64: string; width: number; height: number },
  backImage:  { base64: string; width: number; height: number },
  facePhoto:  { base64: string; width: number; height: number } | null,
  barcodeData: CINBarcodeData | null
) => {
  setScanResult({ frontImage, backImage, facePhoto, barcodeData });
  setSubScreen('processing'); // ← au lieu de 'result' directement
}, []);

// Appelé par CINProcessingScreen quand la validation est terminée
const handleProcessingComplete = useCallback((validationResult: ValidationResult) => {
  setValidation(validationResult);
  setSubScreen('result');
}, []);

// Reset complet → retour à l'intro
const handleRescan = useCallback((_side: 'front' | 'back' | 'both') => {
  setScanResult({ frontImage: null, backImage: null, facePhoto: null, barcodeData: null });
  setCapturedFrontData(null);
  setValidation(null);
  setSubScreen('intro');
  // Note: resetCaptureSequence() n'est plus nécessaire ici car
  // le remount via key prop de CINScanScreen réinitialise CardDetectorModule automatiquement
}, []);

const handleConfirm = useCallback(() => {
  navigation.navigate('Liveness', {
    cinData: {
      frontImage: scanResult.frontImage,
      backImage:  scanResult.backImage,
      facePhoto:  scanResult.facePhoto,
      barcodeData: scanResult.barcodeData,
    },
  });
}, [navigation, scanResult]);
```

### 4.5 — Render JSX complet

```tsx
return (
  <View style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

    {subScreen === 'intro' && (
      <CINIntroScreen onStart={handleIntroStart} />
    )}

    {subScreen === 'guide_front' && (
      <CINGuideFrontScreen
        onProceed={handleGuideFrontProceed}
        onBack={() => setSubScreen('intro')}
      />
    )}

    {subScreen === 'scanning_front' && (
      <CINScanScreen
        key="front"
        cameraPosition="back"
        enableTorch={false}
        showDebugInfo={__DEV__}
        isVisible={true}
        expectedSideOverride="FRONT"
        onFrontCaptured={handleFrontCaptured}
      />
    )}

    {subScreen === 'guide_back' && (
      <CINGuideBackScreen
        onProceed={handleGuideBackProceed}
        onBack={() => setSubScreen('guide_front')}
      />
    )}

    {subScreen === 'scanning_back' && (
      <CINScanScreen
        key="back"
        cameraPosition="back"
        enableTorch={false}
        showDebugInfo={__DEV__}
        isVisible={true}
        expectedSideOverride="BACK"
        injectedFrontImage={capturedFrontData?.frontImage ?? null}
        onScanComplete={handleScanComplete}
      />
    )}

    {subScreen === 'processing' && (
      <CINProcessingScreen
        frontCaptured={true}
        backCaptured={true}
        barcodeData={scanResult.barcodeData}
        facePhoto={scanResult.facePhoto}
        onComplete={handleProcessingComplete}
      />
    )}

    {subScreen === 'result' && validation && (
      <CINResultScreen
        frontImage={scanResult.frontImage}
        backImage={scanResult.backImage}
        facePhoto={scanResult.facePhoto ?? capturedFrontData?.facePhoto ?? null}
        barcodeData={scanResult.barcodeData}
        validation={validation}
        onConfirm={handleConfirm}
        onRescan={handleRescan}
      />
    )}
  </View>
);
```

### 4.6 — BackHandler Android dans CINScreen

```typescript
useEffect(() => {
  const backAction = () => {
    // Mapping retour : chaque sous-écran sait où revenir
    const backMap: Partial<Record<CINSubScreen, CINSubScreen>> = {
      guide_front:    'intro',
      scanning_front: 'guide_front',
      guide_back:     'guide_front',  // retour au guide front (pas rescanner)
      scanning_back:  'guide_back',
      processing:     null as any,    // bloqué pendant processing
      result:         null as any,    // géré par onRescan
    };
    const prev = backMap[subScreen];
    if (prev) {
      setSubScreen(prev);
      return true; // empêche la navigation système
    }
    return false; // laisse React Navigation gérer (intro → sort du flow CIN)
  };
  const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
  return () => backHandler.remove();
}, [subScreen]);
```

---

## Modifications de `src/constants/cinTheme.ts`

Ajouter dans l'objet `Strings` :

```typescript
processing: {
  headerTitle: 'Analyse en cours...',
  headerSub: 'Traitement de votre CIN',
  title: 'Analyse de votre CIN',
  subtitle: 'Veuillez patienter quelques instants...',
  step1: 'Capture recto validée',
  step2: 'Capture verso validée',
  step3: 'Lecture code-barres PDF417...',
  step4: 'Extraction photo visage',
  step5: 'Vérification des données',
},
```

---

## Charte graphique de référence

| Token | Valeur hex | Usage |
|-------|------------|-------|
| Rouge Attijari | `#CC1B2B` | Header, boutons CTA, cercle rouge |
| Or | `#C8963C` | Tips dots, scan verso, bouclier |
| Vert succès | `#1DB954` | Overlay succès, bordure carte, step done |
| Fond écrans | `#000000` | Tous les écrans guide et scan |
| Texte principal | `#FFFFFF` | Titres |
| Texte secondaire | `rgba(255,255,255,0.45)` | Sous-titres, descriptions |
| Violet accent | `#8855BB` | Lignes CIN recto |
| Chair cartoon | `#E8C4A0` | Visage silhouette |

> Les constantes `cinTheme.ts` existantes (`Colors.primary = '#E30613'`) sont légèrement différentes des valeurs des maquettes. **Priorité à la fidélité visuelle des maquettes** : utiliser les valeurs hex directes ci-dessus pour les nouveaux composants, ou mettre à jour `Colors.primary` à `#CC1B2B` si l'équipe est d'accord.

---

## Récapitulatif des fichiers

### Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/screens/CINIntroScreen.tsx` | Écran intro — process + conditions |
| `src/screens/CINGuideFrontScreen.tsx` | Guide illustration recto |
| `src/screens/CINGuideBackScreen.tsx` | Guide illustration verso |
| `src/screens/CINProcessingScreen.tsx` | ⭐ Écran d'attente analyse |
| `src/components/CaptureSuccessOverlay.tsx` | Overlay succès animé |
| `src/components/CaptureFailOverlay.tsx` | Overlay échec + tips |

### Fichiers à modifier

| Fichier | Changements |
|---------|-------------|
| `src/screens/CINScreen.tsx` | Type CINSubScreen (7 états) + handlers + render |
| `src/screens/CINScanScreen.tsx` | Props overlay + nouvelle UI + suppression ancienne UI |
| `src/constants/cinTheme.ts` | Ajout section `Strings.processing` |

### Fichiers à ne PAS toucher

```
src/hooks/useCardDetection.ts
src/hooks/useDetectionTimeout.ts
src/native/BarcodeService.ts
src/components/CINScanFrame.tsx
src/components/CaptureTransition.tsx
src/components/TimeoutReminder.tsx
android/app/src/main/cpp/CardDetector.cpp
android/app/src/main/java/.../CardDetectorModule.java
android/app/src/main/java/.../BarcodeScannerModule.java
```

---

## Checklist de vérification finale

- [ ] App démarre → `CINIntroScreen` s'affiche (fond noir, header rouge)
- [ ] Bouton "Commencer" → `CINGuideFrontScreen` (illustration recto + progress step 1)
- [ ] Bouton "Scanner le recto" → caméra avec instruction + cadre blanc + pill rouge + bouton rouge
- [ ] Erreur capture → overlay rouge shake + tips + bouton "Réessayer" → reset
- [ ] Succès recto → overlay vert 1.5s auto-dismiss → `CINGuideBackScreen` (progress step 2)
- [ ] Bouton "Scanner le verso" → caméra avec pill doré + scan line doré + bouton rouge
- [ ] Erreur barcode → overlay rouge avec tips barcode spécifiques
- [ ] Succès verso → overlay vert 1.5s → `CINProcessingScreen` (spinner + 5 étapes)
- [ ] Après 800ms minimum → `CINResultScreen`
- [ ] "Rescanner" → retour à `CINIntroScreen`
- [ ] Bouton retour Android fonctionne dans chaque étape
- [ ] Panel debug (`showDebugInfo`) toujours fonctionnel en `__DEV__`
- [ ] Aucun fichier natif modifié
