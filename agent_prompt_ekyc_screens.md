# Agent Prompt — Intégration des nouveaux écrans eKYC Attijari

## Contexte du projet

Tu travailles sur un projet React Native (Expo + react-native-vision-camera) nommé **ekyc-ettijeri**. C'est une application eKYC pour Attijari Bank Tunisie. Le projet utilise TypeScript, React Navigation (native stack), et des modules natifs Android (NDK/C++ via JNI) pour la détection de carte CIN.

---

## Architecture actuelle du flow CIN

```
App.tsx (Stack Navigator)
  └── "CIN" → CINScreen.tsx          ← orchestrateur du sous-flow
        ├── subScreen === 'scanning'  → CINScanScreen.tsx (CameraScreen)
        └── subScreen === 'result'   → CINResultScreen.tsx (ResultScreen)
```

**États internes de CINScanScreen :**
- `autoCaptureState: 'WAIT_FRONT' | 'WAIT_BACK' | 'FINISHED'`
- `ENABLE_AUTO_CAPTURE = false` → mode manuel, l'utilisateur appuie sur un bouton
- `expectedSide` dérivé : `'FRONT'` si WAIT_FRONT, `'BACK'` si WAIT_BACK
- Callback principal : `onScanComplete(frontImage, backImage, facePhoto, barcodeData)`

---

## Nouveaux écrans à créer

Il faut créer **4 nouveaux écrans/composants** et les insérer dans le flow CIN **avant** la caméra :

### Screen 1 — `CINIntroScreen` (fichier : `src/screens/CINIntroScreen.tsx`)
**Rôle :** Présente le process et les conditions requises avant de démarrer le scan.

**Contenu UI (basé sur screen_1.html — section "INTRO SCREEN") :**
- Header Attijari Bank rouge (`#CC1B2B`) avec logo circulaire blanc "A"
- Hero SVG : icône carte d'identité avec checkmark rouge
- Titre : "Scanner votre CIN"
- Sous-titre : "Suivez ces étapes pour une vérification rapide et réussie"
- Liste de 3 étapes numérotées :
  1. **Recto de la CIN** — "Présentez le côté avec votre photo, nom et numéro CIN" (cercle rouge)
  2. **Verso de la CIN** — "Retournez la carte — alignez le code-barres dans la zone" (cercle doré `#C8963C`)
  3. **Confirmation** — "Vérifiez vos données extraites et confirmez" (cercle vert `#1DB954`)
- Box "Conditions requises" avec 5 règles (icônes colorées) :
  - 💡 Bonne luminosité — évitez les zones sombres
  - 📋 Carte à plat, bien maintenue, sans pli
  - 🎯 Centrez la carte dans le cadre affiché
  - 🚫 Pas de reflets ni d'ombre sur la carte
  - 🔒 CIN tunisienne officielle valide uniquement
- Bouton CTA rouge plein : "Commencer la vérification" → navigue vers `CINGuideFrontScreen`

**Props :** `{ onStart: () => void }`

---

### Screen 2 — `CINGuideFrontScreen` (fichier : `src/screens/CINGuideFrontScreen.tsx`)
**Rôle :** Montre une illustration flat/cartoon du recto de la CIN avant que l'utilisateur lance la caméra.

**Contenu UI (basé sur screen2.html — section "GUIDE RECTO") :**
- Header Attijari rouge + logo
- Barre de progression 3 étapes : **1 Recto** (actif rouge) → 2 Verso → 3 Résultat
- Titre : "Côté face"
- Sous-titre : "Présentez ce côté — avec votre photo, nom et numéro"
- Carte SVG illustration flat (fond `#C8AEBF`, bordure verte `#1DB954`) :
  - Zone photo gauche : boîte rouge avec cercle caméra + silhouette cartoon (visage avec cheveux noirs, teint `#E8C4A0`)
  - Drapeau tunisien rouge en haut à droite (rectangle rouge + croissant + étoile)
  - Badge bouclier doré en haut à droite
  - Lignes de données (gris) + ligne violette (`#8855BB`) pour nom/prénom
  - Numéro CIN en bas (ligne pointillée)
- Pill label : "Ce côté avec votre photo" (icône personne)
- Checklist :
  - ✅ Votre photo et visage clairement visibles
  - ✅ Nom, prénom et numéro CIN lisibles
  - ❌ Pas le verso — pas le code-barres
- Bouton CTA rouge : "Scanner le recto" → navigue vers `CINScanScreen` en mode FRONT

**Props :** `{ onProceed: () => void }`

---

### Screen 3 — `CINGuideBackScreen` (fichier : `src/screens/CINGuideBackScreen.tsx`)
**Rôle :** Montre une illustration flat/cartoon du verso de la CIN, affiché **après** la capture du recto et **avant** la capture du verso.

**Contenu UI (basé sur screen2.html — section "GUIDE VERSO") :**
- Header Attijari rouge + logo
- Barre de progression : ✓ Recto (vert) → **2 Verso** (actif rouge) → 3 Résultat
- Titre : "Côté verso"
- Sous-titre : "Retournez la carte — code-barres et empreinte"
- Carte SVG illustration flat (fond `#C0B8CC`, bordure verte) :
  - Lignes de données à gauche avec accent violet
  - Grande empreinte digitale au centre-droit (ellipses concentriques `#4A3A5A`)
  - Séparateur horizontal
  - Bande code-barres noir sur fond blanc en bas (barres verticales noires sur `white`)
  - Badge "CODE-BARRES" en bas à droite
- Pill label : "Retournez la carte" (icône flip/rotation)
- Checklist :
  - ✅ Code-barres en bas bien visible
  - ✅ Pas de reflets ni ombre sur le code-barres
  - ❌ Pas le recto — pas de photo de visage
- Bouton CTA rouge : "Scanner le verso" → navigue vers `CINScanScreen` en mode BACK

**Props :** `{ onProceed: () => void }`

---

### Screen 4 — États de validation dans `CINScanScreen` (fichier existant : `src/screens/CINScanScreen.tsx`)
**Rôle :** Ajouter les overlays animés de succès/échec sur le cadre de scan existant.

**Overlay succès** (basé sur screen_1.html — `.overlay-success`) :
- Fond semi-transparent noir (`rgba(0,0,0,0.82)`)
- Cercle vert pulsant (`#1DB954`) avec checkmark animé (stroke-dashoffset → 0)
- Texte : "Recto validé ✓" ou "Verso validé ✓"
- Sous-texte contextuel
- Animation : `pulseGreen` (box-shadow pulsant)
- Apparaît 600ms après capture réussie

**Overlay échec** (basé sur screen_1.html — `.overlay-fail`) :
- Fond semi-transparent noir
- Cercle rouge pulsant (`#CC1B2B`) avec croix ×
- Titre : "Capture échouée"
- 3 tips (points dorés `#C8963C`) selon le type d'erreur
- Bouton "Réessayer" rouge → `resetOverlay()`
- Animation : `shakeX` sur le cadre SVG au moment de l'échec

**États de couleur du cadre SVG (coin markers) :**
- Défaut : blanc (`stroke: white`)
- Succès : vert (`stroke: #1DB954`) — transition 0.3s
- Échec : rouge (`stroke: #CC1B2B`) + animation shake

---

## Modifications à apporter dans les fichiers existants

### 1. `src/screens/CINScreen.tsx`

**Ajouter** le type de sous-écran pour les nouveaux états :
```typescript
type CINSubScreen = 'intro' | 'guide_front' | 'scanning_front' | 'guide_back' | 'scanning_back' | 'result';
```

**Modifier** la valeur initiale de `subScreen` :
```typescript
const [subScreen, setSubScreen] = useState<CINSubScreen>('intro');
```

**Ajouter** les handlers de navigation :
```typescript
const handleIntroStart = useCallback(() => setSubScreen('guide_front'), []);
const handleGuideFrontProceed = useCallback(() => setSubScreen('scanning_front'), []);
const handleGuideBackProceed = useCallback(() => setSubScreen('scanning_back'), []);
```

**Modifier** `handleScanComplete` pour intercepter après le recto et afficher le guide verso :
- Quand le recto est capturé (frontImage exist mais backImage non) → `setSubScreen('guide_back')`
- Quand recto + verso capturés → `setSubScreen('result')`

**Modifier** le render JSX pour inclure les 4 sous-écrans :
```tsx
{subScreen === 'intro' && <CINIntroScreen onStart={handleIntroStart} />}
{subScreen === 'guide_front' && <CINGuideFrontScreen onProceed={handleGuideFrontProceed} />}
{subScreen === 'scanning_front' && (
  <CINScanScreen ... expectedSideOverride="FRONT" onFrontCaptured={handleFrontCaptured} />
)}
{subScreen === 'guide_back' && <CINGuideBackScreen onProceed={handleGuideBackProceed} />}
{subScreen === 'scanning_back' && (
  <CINScanScreen ... expectedSideOverride="BACK" onScanComplete={handleScanComplete} />
)}
{subScreen === 'result' && validation && <CINResultScreen ... />}
```

**Importer** les nouveaux composants :
```typescript
import { CINIntroScreen } from './CINIntroScreen';
import { CINGuideFrontScreen } from './CINGuideFrontScreen';
import { CINGuideBackScreen } from './CINGuideBackScreen';
```

---

### 2. `src/screens/CINScanScreen.tsx`

**Ajouter** la prop `expectedSideOverride` pour forcer le côté attendu :
```typescript
interface CameraScreenProps {
  ...
  expectedSideOverride?: 'FRONT' | 'BACK';
  onFrontCaptured?: (frontImage: {...}, facePhoto: {...} | null) => void;
}
```

**Modifier** la logique d'`expectedSide` :
```typescript
const expectedSide = useMemo(() => {
  if (props.expectedSideOverride) return props.expectedSideOverride;
  return autoCaptureState === 'WAIT_FRONT' ? 'FRONT' : 'BACK';
}, [autoCaptureState, props.expectedSideOverride]);
```

**Ajouter** les états pour les overlays :
```typescript
const [captureOverlayState, setCaptureOverlayState] = useState<'idle' | 'success' | 'fail'>('idle');
const [captureOverlayMessage, setCaptureOverlayMessage] = useState('');
const [failTips, setFailTips] = useState<string[]>([]);
```

**Modifier** `handleManualCapturePress` pour déclencher les overlays :
- En cas de succès → `setCaptureOverlayState('success')` + message → après 1.5s appeler `onFrontCaptured` ou passer à BACK
- En cas d'échec (image floue, layout invalide, etc.) → `setCaptureOverlayState('fail')` + tips contextuels + animation shake

**Ajouter** les composants overlay dans le JSX (après le `<CINScanFrame>`) :
```tsx
{captureOverlayState === 'success' && (
  <CaptureSuccessOverlay
    message={captureOverlayMessage}
    onComplete={() => setCaptureOverlayState('idle')}
  />
)}
{captureOverlayState === 'fail' && (
  <CaptureFailOverlay
    tips={failTips}
    onRetry={() => { setCaptureOverlayState('idle'); setManualCaptureError(null); }}
  />
)}
```

---

### 3. Nouveau composant `src/components/CaptureSuccessOverlay.tsx`

```typescript
interface Props {
  message: string;       // ex: "Recto validé ✓"
  subMessage?: string;   // ex: "Passez au verso"
  onComplete: () => void;
}
```

UI : overlay noir semi-transparent, cercle vert animé `pulseGreen`, checkmark SVG avec animation `stroke-dashoffset`, texte, auto-dismiss après 1.5s.

---

### 4. Nouveau composant `src/components/CaptureFailOverlay.tsx`

```typescript
interface Props {
  title?: string;        // ex: "Capture échouée"
  tips: string[];        // ex: ["Tenez la carte immobile", ...]
  onRetry: () => void;
}
```

UI : overlay noir semi-transparent, cercle rouge pulsant `pulseRed`, croix SVG, tips avec points dorés, bouton "Réessayer" rouge.

---

## Charte graphique à respecter

| Token | Valeur |
|-------|--------|
| Rouge Attijari | `#CC1B2B` |
| Or | `#C8963C` |
| Vert succès | `#1DB954` |
| Fond caméra | `#000000` |
| Fond body | `#000000` |
| Texte principal | `#FFFFFF` |
| Texte secondaire | `rgba(255,255,255,0.45)` |

Fonts : `DM Sans` (ou `System` en fallback React Native).
Les mêmes constantes sont déjà disponibles dans `src/constants/cinTheme.ts` (`Colors`, `Typography`, `Spacing`, `BorderRadius`).

---

## Flow navigation complet attendu

```
CINScreen
  │
  ├─[subScreen='intro']──────────────► CINIntroScreen
  │                                        │ onStart()
  ├─[subScreen='guide_front']─────────► CINGuideFrontScreen
  │                                        │ onProceed()
  ├─[subScreen='scanning_front']──────► CINScanScreen (FRONT only)
  │                                        │ onFrontCaptured() → [succès overlay 1.5s]
  ├─[subScreen='guide_back']──────────► CINGuideBackScreen
  │                                        │ onProceed()
  ├─[subScreen='scanning_back']───────► CINScanScreen (BACK only)
  │                                        │ onScanComplete() → [succès overlay 1.5s]
  └─[subScreen='result']──────────────► CINResultScreen
                                           │ onConfirm() → navigation.navigate('Liveness')
                                           │ onRescan()  → retour à 'intro'
```

---

## Points techniques importants

1. **Ne pas casser le module natif** : `CardDetectorModule` (JNI/C++) et `BarcodeScannerModule` (ZXing) ne doivent pas être modifiés. Utiliser uniquement les hooks existants : `useCardDetection`, `useDetectionTimeout`.

2. **ENABLE_AUTO_CAPTURE reste `false`** : toute la logique auto-capture peut rester en place, seul le mode manuel est activé.

3. **CINScanScreen peut être monté deux fois** (une pour FRONT, une pour BACK) ou une seule fois avec `expectedSideOverride`. Choisir l'approche la plus simple : **une seule instance avec prop override** est recommandée pour éviter de dupliquer la logique caméra.

4. **Animations React Native** : utiliser `Animated.Value` + `Animated.timing` pour les effets de pulse et shake. Pas de Reanimated requis si non présent dans le projet.

5. **SVG** : utiliser `react-native-svg` (déjà présent dans le projet via `CINScanFrame.tsx` qui utilise `Svg`, `Path`, etc.).

6. **BackHandler Android** : dans les écrans guide, appuyer sur retour doit revenir à l'écran précédent du sous-flow (pas quitter l'app).

7. **Les illustrations SVG** pour les guides recto/verso sont définies dans les fichiers HTML de référence (`screen2.html`). Les convertir en composants `react-native-svg` fidèles.

---

## ⚠️ Remplacement des anciens écrans de scan caméra

### Ce qui existe actuellement et doit être remplacé

L'ancien `CINScanScreen.tsx` affiche pendant le scan :
- Un bandeau `guidanceBanner` avec emoji 🪪 / 🔄 et texte générique en anglais (`Strings.scanning.placeFront`, etc.)
- Un bouton manuel `TouchableOpacity` texte brut : `'Capture Front'` / `'Capture Back'`
- Un indicateur de progression avec deux `progressDot` simples
- Aucun guide visuel de quel côté présenter

**Ces éléments sont à remplacer intégralement** par la nouvelle UI des écrans de scan (`screen_1.html` — sections "SCAN RECTO" et "SCAN VERSO").

---

### Remplacement de l'UI de scan recto (dans `CINScanScreen.tsx` quand `expectedSide === 'FRONT'`)

**Supprimer :**
```tsx
// ❌ Supprimer ce bloc entier
<View style={styles.guidanceBanner}>
  {autoCaptureState === 'WAIT_FRONT' && (
    <>
      <Text style={styles.guidanceStep}>{Strings.scanning.stepFront}</Text>
      <Text style={styles.guidanceIcon}>🪪</Text>
      <Text style={styles.guidanceTitle}>{Strings.scanning.placeFront}</Text>
      <Text style={styles.guidanceSub}>{Strings.scanning.alignCard}</Text>
    </>
  )}
  ...
</View>

// ❌ Supprimer le bouton manuel brut
<View style={styles.manualCaptureContainer}>
  <TouchableOpacity style={styles.manualCaptureButton} onPress={handleManualCapturePress}>
    <Text style={styles.manualCaptureButtonText}>
      {expectedSide === 'FRONT' ? 'Capture Front' : 'Capture Back'}
    </Text>
  </TouchableOpacity>
</View>

// ❌ Supprimer l'indicateur de progression basique
<View style={styles.progressContainer}>
  <View style={[styles.progressDot, ...]} />
  <View style={styles.progressLine} />
  <View style={[styles.progressDot, ...]} />
</View>
```

**Remplacer par** la nouvelle UI du scan recto (inspirée de `screen_1.html`) :
- Texte d'instruction en haut : `"Placez le côté face de votre CIN dans le cadre"` — fond noir semi-transparent, centré, blanc
- Cadre SVG blanc épais (coin markers blanc `stroke-width=5`) avec à l'intérieur :
  - Silhouette de personne en bas à gauche (cercle tête + arc épaules, `stroke=white opacity=0.5`)
  - Icône caméra/photo en haut à gauche (rectangle + cercle, `stroke=white opacity=0.45`)
  - Bouclier/emblème en haut à droite (`stroke=white opacity=0.45`)
  - Ligne de scan rouge animée (`#CC1B2B`) qui balaie de haut en bas
- Pill de statut centré : point rouge clignotant + `"En attente de la carte..."` (ou jaune `"Détecté — qualité insuffisante"`, ou vert `"Prêt à capturer"`)
- Barre de progression 3 points : ● (rouge actif) — — ○ — — ○
- Bouton rouge plein en bas : icône caméra + `"Capturer le recto"` → `handleManualCapturePress()`

---

### Remplacement de l'UI de scan verso (dans `CINScanScreen.tsx` quand `expectedSide === 'BACK'`)

**Remplacer** le même bandeau et bouton par la nouvelle UI du scan verso :
- Texte d'instruction : `"Retournez la carte — placez le verso dans le cadre"`
- Cadre SVG blanc épais identique avec à l'intérieur :
  - Empreinte digitale au centre-droit (ellipses concentriques `stroke=white opacity décroissante`)
  - Ligne séparatrice horizontale blanche
  - Bande code-barres en bas : barres verticales blanches sur fond du cadre
  - Ligne de scan **dorée** (`#C8963C`) animée uniquement sur la zone code-barres (boucle rapide 1.4s)
- Pill de statut centré : point doré clignotant + `"Alignez le code-barres dans la zone..."`
- Barre de progression 3 points : ✓ (vert fait) — ● (rouge actif) — ○
- Bouton rouge plein en bas : `"Capturer le verso"` → `handleManualCapturePress()`

---

### Suppression du `resetButton` visible

**Supprimer** le bouton `"↺ Start Over"` flottant existant :
```tsx
// ❌ Supprimer
{autoCaptureState !== 'WAIT_FRONT' && (
  <TouchableOpacity style={styles.resetButton} onPress={resetCaptureSequence}>
    <Text style={styles.resetButtonText}>↺ Start Over</Text>
  </TouchableOpacity>
)}
```
Le "recommencer" sera géré via l'overlay d'échec (`CaptureFailOverlay` → bouton "Réessayer") et non plus via un bouton permanent visible.

---

### Suppression du `guidanceBanner` pour l'état FINISHED

```tsx
// ❌ Supprimer ce bloc — l'état FINISHED est maintenant géré par l'overlay succès
{autoCaptureState === 'FINISHED' && (
  <>
    <Text style={styles.guidanceIcon}>🎉</Text>
    <Text style={styles.guidanceTitle}>{Strings.result.title}</Text>
    <Text style={styles.guidanceCheckmark}>✅ Both sides captured</Text>
  </>
)}
```

---

### Résumé des éléments UI à supprimer dans `CINScanScreen.tsx`

| Élément | Style associé | Action |
|---------|---------------|--------|
| `guidanceBanner` View | `styles.guidanceBanner`, `guidanceStep`, `guidanceIcon`, `guidanceTitle`, `guidanceSub`, `guidanceCheckmark` | ❌ Supprimer |
| `progressContainer` View | `styles.progressContainer`, `progressDot`, `progressLine`, `progressDotActive`, `progressDotComplete` | ❌ Supprimer |
| `manualCaptureContainer` View | `styles.manualCaptureContainer`, `manualCaptureButton`, `manualCaptureButtonDisabled`, `manualCaptureButtonText`, `manualCaptureError` | ❌ Supprimer |
| `resetButton` TouchableOpacity | `styles.resetButton`, `resetButtonWithManual`, `resetButtonText` | ❌ Supprimer |

Tous ces styles peuvent être retirés du `StyleSheet.create({...})` en bas du fichier.

---

## Fichiers à créer

| Fichier | Type |
|---------|------|
| `src/screens/CINIntroScreen.tsx` | Nouveau |
| `src/screens/CINGuideFrontScreen.tsx` | Nouveau |
| `src/screens/CINGuideBackScreen.tsx` | Nouveau |
| `src/components/CaptureSuccessOverlay.tsx` | Nouveau |
| `src/components/CaptureFailOverlay.tsx` | Nouveau |

## Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/screens/CINScreen.tsx` | Nouveau type CINSubScreen + handlers + render |
| `src/screens/CINScanScreen.tsx` | Prop `expectedSideOverride` + overlays succès/échec |
