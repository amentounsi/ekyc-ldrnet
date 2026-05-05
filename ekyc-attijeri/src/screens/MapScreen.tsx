// src/screens/MapScreen.tsx
// ✅ 207 agences officielles Attijari Bank (site officiel attijaribank.com.tn)
// ✅ 0 API, 0 clé, 100% offline — GPS uniquement
// ✅ Types : branch | lsb | dam | box | ca
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Linking, Platform, ActivityIndicator, Animated, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { AttijariLogo } from '../components/AttijariLogo';
import { Toast, ToastRef } from '../components/Toast';

// ─── Types ────────────────────────────────────────────
type AgencyType = 'branch' | 'lsb' | 'dam' | 'box' | 'ca';

interface Agency {
  id:         string;
  name:       string;
  address:    string;
  phone:      string;
  email:      string;
  lat:        number;
  lng:        number;
  isOpen:     boolean;
  closeTime:  string;
  type:       AgencyType;
  distKm?:    number;
  distLabel?: string;
}

// ─── Config par type ──────────────────────────────────
const TYPE_CONFIG: Record<AgencyType, { label: string; emoji: string; color: string; bgKey: string; alwaysOpen: boolean }> = {
  branch: { label: 'وكالة',          emoji: '🏦', color: '#E8890C', bgKey: 'orangeBg', alwaysOpen: false },
  lsb:    { label: 'Libre-Service',  emoji: '🏧', color: '#378ADD', bgKey: 'blueBg',   alwaysOpen: true  },
  dam:    { label: 'DAR Al Macharii',emoji: '💸', color: '#9B59B6', bgKey: 'purpleBg', alwaysOpen: false },
  box:    { label: 'Box Aéroport',   emoji: '✈️',  color: '#2ECC71', bgKey: 'greenBg',  alwaysOpen: true  },
  ca:     { label: "Centre d'Aff.",  emoji: '🏢', color: '#C0392B', bgKey: 'redBg',    alwaysOpen: false },
};

// ─── Utilitaires ──────────────────────────────────────
const haversine = (la1:number,lo1:number,la2:number,lo2:number) => {
  const R=6371,dL=(la2-la1)*Math.PI/180,dG=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dG/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
const fmtDist = (km:number) => km<1?`${Math.round(km*1000)}م`:`${km.toFixed(1)}كم`;

const checkBankOpen = (): { isOpen: boolean; closeTime: string } => {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours()*60+now.getMinutes();
  if (day===0) return { isOpen:false, closeTime:'' };
  if (day===6) return { isOpen: time>=480&&time<780, closeTime:'13:00' };
  return { isOpen: time>=480&&time<1080, closeTime:'18:00' };
};

// ─── 207 Agences officielles Attijari Bank ─────────────
const RAW_AGENCIES = [
  { id: "1", name: "Libre service-bancaire EL Manar", address: "16 avenue abdelaziz al saoud, 2092", phone: "", email: "", lat: 36.842204, lng: 10.164458, type: "lsb" as const },
  { id: "2", name: "Libre service-bancaire Ennasr", address: "39 bis Avenue Hédi nouira – Ennasr II, 2037", phone: "", email: "", lat: 36.855989, lng: 10.15976, type: "lsb" as const },
  { id: "3", name: "AGENCE ZAGHOUANE", address: "AVENUE DE L'INDEPENDANCE, 1100", phone: "70 641 290", email: "agence.ZAGHOUANE@attijaribank.com.tn", lat: 36.4002232, lng: 10.1442667, type: "branch" as const },
  { id: "4", name: "AGENCE EL FAHS", address: "CENTRE MAJUS , AV ; HABIB BOURGUIBA – EL FAHS, 1140", phone: "70 641 300", email: "agence.elfahs@attijaribank.com.tn", lat: 36.373373, lng: 9.903632, type: "branch" as const },
  { id: "5", name: "SUCCURSALE DU SIÈGE", address: "24 Rue Hédi Karray Centre Urbain Nord , 1080", phone: "70 642 000", email: "ag.succsiège@attijaribank.com.tn", lat: 36.84548, lng: 10.1841405, type: "ca" as const },
  { id: "6", name: "AGENCE TAMAYOUZ", address: "LOTS B15, IMMEUBLE TAMATOUZ, CENTRE URBAIN NORD, 1082", phone: "70 641 420", email: "agence.tamayouz@attijaribank.com.tn", lat: 36.849792, lng: 10.198265, type: "branch" as const },
  { id: "7", name: "AGENCE SIDI BOU SAID", address: "12 AVENUE HABIB BOURGUIBA, 2026", phone: "70 640 060", email: "agence.SidiBousaid@attijaribank.com.tn", lat: 36.869537, lng: 10.343656, type: "branch" as const },
  { id: "8", name: "AGENCE MUTUELLEVILLE", address: "Angle 63 Avenue Jugurtha et 2 Rue Mutuelle Ville, 1082 Tunis", phone: "70 641 610", email: "ag.mutuelleville@attijaribank.com.tn", lat: 36.82978, lng: 10.17059, type: "branch" as const },
  { id: "9", name: "AGENCE MONTPLAISIR", address: "IMMEUBLE AZIZ, RUE 8368 MONTPLAISIR, 1073", phone: "70 641 210", email: "agence.montplaisir@attijaribank.com.tn", lat: 36.821819, lng: 10.194238, type: "branch" as const },
  { id: "10", name: "AGENCE MENZAH 1", address: "10 Av. Charles Nicole, 1004", phone: "70 641 620", email: "ag.menzah1@attijaribank.com.tn", lat: 36.8369879, lng: 10.1813409, type: "branch" as const },
  { id: "11", name: "AGENCE LES BERGES DU LAC", address: "RUE DU  LAC ANNECY, 1053", phone: "70 641 010", email: "agence.LAC@attijaribank.com.tn", lat: 36.832801, lng: 10.230683, type: "branch" as const },
  { id: "12", name: "AGENCE LE BARDO", address: "131 BOULEVARD 20 MARS LE BARDO, 2000", phone: "70 640 750", email: "agence.Bardo@attijaribank.com.tn", lat: 36.807848, lng: 10.139293, type: "branch" as const },
  { id: "13", name: "AGENCE LA GOULETTE", address: "10 FRAHAT HACHED, 2060", phone: "70 640 350", email: "agence.LaGoulette@attijaribank.com.tn", lat: 36.815575, lng: 10.304349, type: "branch" as const },
  { id: "14", name: "AGENCE JARDINS EL MENZAH", address: "RDC l'immeuble Al Menzah Al Aalia, 2094", phone: "70 642 290", email: "ag.lesjardinsdelmenzah@attijaribank.com.tn", lat: 36.849334, lng: 10.138822, type: "branch" as const },
  { id: "15", name: "AGENCE HABIB BOURGUIBA", address: "17 Avenue Habib Bourguiba- Tunis, 1000", phone: "70 641 790", email: "ag.habibbourguiba@attijaribank.com.tn", lat: 36.8002721, lng: 10.1855518, type: "branch" as const },
  { id: "16", name: "AGENCE EZZOUHOUR", address: "20 BIS RUE 4001, CITE EZZOUHOUR II, 2052", phone: "70 641 280", email: "agence.EZZOUHOUR@attijaribank.com.tn", lat: 36.794297, lng: 10.132434, type: "branch" as const },
  { id: "17", name: "AGENCE EL MECHTEL", address: "10 AVENUE OULED HAFOUZ, 1006", phone: "70 640 700", email: "agence.Mechtel@attijaribank.com.tn", lat: 36.81319, lng: 10.17318, type: "branch" as const },
  { id: "18", name: "AGENCE EL MANAR", address: "16 AVENUE ABDELAZIZ AL SAOUD EL MANAR II, 2092", phone: "70 640 580", email: "agence.Manar@attijaribank.com.tn", lat: 36.842204, lng: 10.164458, type: "branch" as const },
  { id: "19", name: "AGENCE EL HRAIRIA", address: "233 AVENUE HRAIRIA, EL HRAIRIA, 2052", phone: "70 641 380", email: "agence.elhrairia@attijaribank.com.tn", lat: 36.789525, lng: 10.114708, type: "branch" as const },
  { id: "20", name: "AGENCE BARDO CENTRE", address: "Angle de avenue Habib Bourguiba et rue Abdelhamid Tlili, 2000", phone: "70 641 510", email: "bardo.centre@attijaribank.com.tn", lat: 36.809754, lng: 10.138975, type: "branch" as const },
  { id: "21", name: "AGENCE AVENUE DE PARIS II", address: "14 AVENUE DE PARIS, 1000", phone: "70 641 040", email: "agence.AvenueParis2@attijaribank.com.tn", lat: 36.804419, lng: 10.182611, type: "branch" as const },
  { id: "22", name: "AGENCE AV.MED V TUNIS", address: "3 PLACE PASTEUR BELVEDERE, 1002", phone: "70 640 030", email: "agence.Mohamed5@attijaribank.com.tn", lat: 36.8212562, lng: 10.1789876, type: "branch" as const },
  { id: "23", name: "AGENCE AV. CARTHAGE", address: "13 bis, avenue de Carthage, 1001", phone: "70 641 530", email: "avenue.carthage@attiiaribank.com.tn.", lat: 36.796808, lng: 10.18159, type: "branch" as const },
  { id: "24", name: "AGENCE TOZEUR", address: "AVENUE HABIB BOURGUIBA, 2200", phone: "70 640 200", email: "agence.Tozeur@attijaribank.com.tn", lat: 33.295462, lng: 10.326913, type: "branch" as const },
  { id: "25", name: "AGENCE NAFTA", address: "AVENUE HABIB BOURGUIBA, 2240", phone: "70 640 230", email: "agence.nefta@attijaribank.com.tn", lat: 33.872403, lng: 7.883842, type: "branch" as const },
  { id: "26", name: "AGENCE TATAOUINE", address: "21 AVENUE FARHAT HACHED, 3200", phone: "70 640 170", email: "agence.Tataouine@attijaribank.com.tn", lat: 32.927408, lng: 10.44823, type: "branch" as const },
  { id: "27", name: "AGENCE REMADA", address: "PLACE DE L'INDEPENDANCE, 3240", phone: "70 640 780", email: "agence.Remada@attijaribank.com.tn", lat: 32.3154354, lng: 10.3984097, type: "branch" as const },
  { id: "28", name: "AGENCE GHOMRASSEN", address: "AVENUE HABIB BOURGUIBA, 3220", phone: "70 640 300", email: "agence.ghomrassen@attijaribank.com.tn", lat: 33.058531, lng: 10.33621, type: "branch" as const },
  { id: "29", name: "AGENCE SOUSSE SENGHOR", address: "2, AVENUE LEOPOL CEDAR SENGHOR, 4000", phone: "70 641 160", email: "agence.Senghor@attijaribank.com.tn", lat: 33.178095, lng: 10.442424, type: "branch" as const },
  { id: "30", name: "AGENCE BIR LAHMAR", address: "43 AVENUE HABIB BOURGUIBA - BIR LAHMAR, 3212", phone: "70 640 740", email: "agence.BirLahmar@attijaribank.com.tn", lat: 33.178095, lng: 10.442424, type: "branch" as const },
  { id: "31", name: "AGENCE SOUSSE SAHLOUL", address: "BOULEVARD YASSER ARRAFAT, 4054", phone: "70 641 080", email: "agence.Sahloul@attijaribank.com.tn", lat: 35.83731, lng: 10.597074, type: "branch" as const },
  { id: "32", name: "AGENCE SOUSSE MENCHIA", address: "Avenue 14 Janvier, Route Touristique Kantaoui, El Menchia – Hammam Sousse, 4017", phone: "70 641 930", email: "ag.soussemenchia@attijaribank.com.tn", lat: 35.866751, lng: 10.606469, type: "branch" as const },
  { id: "33", name: "AGENCE SOUSSE ERRIADH", address: "RESIDENCE HELA ROUTE PERIPHERIQUE SOUSSE-MONASTIR CITE ERRIADH, 4023", phone: "70 641 220", email: "agence.SousseErriadh@attijaribank.com.tn", lat: 35.809053, lng: 10.608757, type: "branch" as const },
  { id: "34", name: "AGENCE SOUSSE ENNAKHIL", address: "Boulevard Ennakhil Khezama - Sousse, 4051", phone: "70 641 750", email: "ag.sousseennakhil@attijaribank.com.tn", lat: 35.851949, lng: 10.615154, type: "branch" as const },
  { id: "35", name: "AGENCE SOUSSE  H.BOURGUIBA", address: "PLACE FARHAT HACHED, 4000", phone: "70 640 430", email: "agence.Sousse2@attijaribank.com.tn", lat: 35.8299218, lng: 10.640574, type: "branch" as const },
  { id: "36", name: "AGENCE M’SAKEN", address: "RUE TAHAR HCHICHA, 4070", phone: "70 640 670", email: "agence.Msaken@attijaribank.com.tn", lat: 35.731782, lng: 10.580293, type: "branch" as const },
  { id: "37", name: "AGENCE HAMMAM SOUSSE", address: "AGENCE HAMMAM SOUSSE, 4011", phone: "70 641 020", email: "agence.HammamSousse@attijaribank.com.tn", lat: 35.859611, lng: 10.599644, type: "branch" as const },
  { id: "38", name: "AGENCE BOUFICHA", address: "AVENUE HEDI CHAKER, 4010", phone: "70 640 520", email: "agence.Bouficha@attijaribank.com.tn", lat: 36.301949, lng: 10.453207, type: "branch" as const },
  { id: "39", name: "AGENCE SOUSSE BAB JEDID", address: "18 AVENUE HABIB THAMEUR, 4000", phone: "70 640 110", email: "agence.SousseBabjedid@attijaribank.com.tn", lat: 35.826505, lng: 10.641372, type: "branch" as const },
  { id: "40", name: "AGENCE SILIANA", address: "AVENUE HABIB BOURGUIBA - siliana, 6100", phone: "70 640 970", email: "agence.Seliana@attijaribank.com.tn", lat: 36.086383, lng: 9.37163, type: "branch" as const },
  { id: "41", name: "AGENCE SIDI BOUZID", address: "AVENUE FARHAT HACHED, 9100", phone: "70 640 220", email: "agence.SidiBouzid@attijaribank.com.tn", lat: 35.038045, lng: 9.489905, type: "branch" as const },
  { id: "42", name: "AGENCE OULED HAFFOUZ", address: "N°15, CITE COMMERCIALE OULED HAFFOUZ, 9180", phone: "70 640 460", email: "agence.OuledHaffouz@attijaribank.com.tn", lat: 35.0819323, lng: 9.8690759, type: "branch" as const },
  { id: "43", name: "AGENCE SFAX ZEPHIR", address: "IMMEUBLE ZAPHYR, AVENUE MAJIDA BOULILA, 3027", phone: "70 641 100", email: "agence.sfaxZaphir@attijaribank.com.tn", lat: 34.736948, lng: 10.749517, type: "branch" as const },
  { id: "44", name: "AGENCE SFAX NASRIA", address: "IMMEUBLE DES ETOILES, 25  AVENUE MAJIDA BOULILA, 3002", phone: "70 641 370", email: "agence.NASRIA@attijaribank.com.tn", lat: 34.746148, lng: 10.759788, type: "branch" as const },
  { id: "45", name: "AGENCE SFAX MENZEL CHAKER", address: "Route Menzel chaker, 3020", phone: "70 642 310", email: "ag.sfaxmenzelchaker@attijaribank.com.tn", lat: 34.755092, lng: 10.707434, type: "branch" as const },
  { id: "46", name: "AGENCE SFAX LES JARDINS", address: "17, Avenue 5 août, 3002", phone: "70 641 590", email: "sfax.jardins@attijaribank.com.tn", lat: 34.743556, lng: 10.764139, type: "branch" as const },
  { id: "47", name: "AGENCE SFAX LAFRANE", address: "Immeuble 'Lafrane Center', Angle avenue Majida boulila et route Lafrane, 3027", phone: "70 022 158", email: "sfax.lafrane@attijaribank.com.tn", lat: 34.74273, lng: 10.754081, type: "branch" as const },
  { id: "48", name: "AGENCE SFAX INTILAKA", address: "N° 61, rue Haffouz Sfax El Medina, 3000", phone: "70 641 430", email: "agence.intilaka@attijaribank.com.tn", lat: 36.8403528, lng: 10.1385998, type: "branch" as const },
  { id: "49", name: "AGENCE SFAX HACHED", address: "AVENUE FARHAT HACHED SFAX, 3000", phone: "70 641 340", email: "agence.sfaxHached@attijaribank.com.tn", lat: 34.740387, lng: 10.754656, type: "branch" as const },
  { id: "50", name: "AGENCE SFAX HABIB THAMEUR", address: "ANGLE AVENUE ABOU KACHEM ECCEHBBI ET RUE HABIB THAMEUR SFAX, 3000", phone: "70 641 170", email: "agence.sfaxthameur@attijaribank.com.tn", lat: 34.73193, lng: 10.765966, type: "branch" as const },
  { id: "51", name: "AGENCE SFAX EL JADIDA", address: "17 AVENUE 14 Janvier 2011, 3000", phone: "70 640 690", email: "agence.Sfax2000@attijaribank.com.tn", lat: 34.737383, lng: 10.755835, type: "branch" as const },
  { id: "52", name: "AGENCE SFAX EL HABIB", address: "AV. DE LA JORDANIE CITE EL HABIB, 3052", phone: "70 641 360", email: "agence.elhabib@attijaribank.com.tn", lat: 34.71944, lng: 10.720597, type: "branch" as const },
  { id: "53", name: "AGENCE SFAX EL BOUSTEN", address: "ROUTE DE MAHDIA KM 2,5 SFAX, 3002", phone: "70 641 120", email: "agence.SfaxBousten@attijaribank.com.tn", lat: 34.75972, lng: 10.771745, type: "branch" as const },
  { id: "54", name: "AGENCE SAKIET EZZIT", address: "Route de Tunis KM 7 - Sakiet Ezzit, 3021", phone: "70 641 760", email: "ag.sakietezzit@attijaribank.com.tn", lat: 34.808571, lng: 10.761181, type: "branch" as const },
  { id: "55", name: "AGENCE MAHRES", address: "Immeuble Moncef Rekik, Rte GP1 - Mahrès, 3060", phone: "70 641 670", email: "ag.mahres@attijaribank.com.tn", lat: 34.521827, lng: 10.494196, type: "branch" as const },
  { id: "56", name: "AGENCE JEBENIANA", address: "18 PLACE 02 MARS, 3080", phone: "70 640 480", email: "agence.jebeniana@attijaribank.com.tn", lat: 35.032111, lng: 10.909932, type: "branch" as const },
  { id: "57", name: "AGENCE GREMDA", address: "Diar Ismail ,rue 1° Mai Route Gremda km 5.5 Sfax, 3062", phone: "70 642 210", email: "ag.gremda@attijaribank.com.tn", lat: 34.780401, lng: 10.723865, type: "branch" as const },
  { id: "58", name: "AGENCE SOLIMAN", address: "AVENUE HABIB BOURGUIBA, 8020", phone: "70 640 320", email: "agence.Soliman@attijaribank.com.tn", lat: 36.6946, lng: 10.495036, type: "branch" as const },
  { id: "59", name: "AGENCE NABEUL LES JARDINS", address: "08 Avenue Mongi BALI, Nabeul, 8000", phone: "70 641 820", email: "ag.nabeul2@attijaribank.com.tn", lat: 36.45818, lng: 10.737574, type: "branch" as const },
  { id: "60", name: "AGENCE NABEUL", address: "AVENUE HABIB THAMEUR, 8000", phone: "70 641 250", email: "agence.Nabeul2@attijaribank.com.tn", lat: 36.453211, lng: 10.733951, type: "branch" as const },
  { id: "61", name: "AGENCE MREZGA", address: "Résidence INES route de Nabeul Hammamet MC 28 face à la clinique les violettes, Mrezga Hammamet 8050", phone: "70 641 980", email: "ag.mrezga@attijaribank.com.tn", lat: 36.431324, lng: 10.68319, type: "branch" as const },
  { id: "62", name: "AGENCE MENZEL TEMIME", address: "50 AVENUE DE L'ENVIRONNEMENT, 8080", phone: "70 641 310", email: "agence.MenzelTemime@attijaribank.com.tn", lat: 36.77929, lng: 10.993216, type: "branch" as const },
  { id: "63", name: "AGENCE MENZEL BOUZELFA", address: "Av Habib BOURGUIBA - Menzel Bouzelfa, 8010", phone: "70 641 850", email: "ag.menzelbouzelfa@attijaribank.com.tn", lat: 36.67773, lng: 10.584754, type: "branch" as const },
  { id: "64", name: "AGENCE KORBA", address: "169 Avenue Habib Bourguiba - Korba, 8070", phone: "70 641 720", email: "ag.korba@attijaribank.com.tn", lat: 36.3417, lng: 10.5127, type: "branch" as const },
  { id: "65", name: "AGENCE KELIBIA", address: "AVENUE HABIB BOURGUIBA, 8090", phone: "70 640 540", email: "agence.Kelibia@attijaribank.com.tn", lat: 36.841018, lng: 11.0829939, type: "branch" as const },
  { id: "66", name: "AGENCE HAMMAMET", address: "AVENUE DU KOWEIT, 8050", phone: "70 640 180", email: "agence.hammamet@attijaribank.com.tn", lat: 36.37262, lng: 10.54262, type: "branch" as const },
  { id: "67", name: "AGENCE GROMBALIA", address: "Angle rue farhat hached et rue hédi chaker - GROMBALIA, 8030", phone: "70 641 710", email: "ag.grombalia@attijaribank.com.tn", lat: 36.597838, lng: 10.497709, type: "branch" as const },
  { id: "68", name: "AGENCE DAR CHAABANE", address: "AVENUE HABIB BOURGUIBA, 8011", phone: "70 640 510", email: "agence.Darchaabane@attijaribank.com.tn", lat: 36.463929, lng: 10.747508, type: "branch" as const },
  { id: "69", name: "AGENCE BOU ARGOUB", address: "Avenue de la Révolution, 8040", phone: "70 640 560", email: "agence.Bouargoub@attijaribank.com.tn", lat: 36.527475, lng: 10.554457, type: "branch" as const },
  { id: "70", name: "AGENCE BENI KHIAR", address: "Avenue Habib Bourguiba – Béni Khiar, 8060", phone: "70 641 970", email: "ag.benikhiar@attijaribank.com.tn", lat: 36.466915, lng: 10.77773, type: "branch" as const },
  { id: "71", name: "AGENCE BARRAKET ESSAHEL", address: "AVENUE MOHAMED V MANARET EL HAMMAMET, 8056", phone: "70 640 940", email: "agence.BarraketEssahel@attijaribank.com.tn", lat: 36.4049888, lng: 10.5256453, type: "branch" as const },
  { id: "72", name: "AGENCE ZARMDINE", address: "AVENUE HABIB BOURGUIBA, 5040", phone: "70 640 280", email: "agence.zeramdine@attijaribank.com.tn", lat: 35.5710411, lng: 10.7329407, type: "branch" as const },
  { id: "73", name: "AGENCE TEBOULBA", address: "AVENUE DE LA VICTOIRE, 5080", phone: "70 640 290", email: "agence.teboulba@attijaribank.com.tn", lat: 35.642404, lng: 10.966839, type: "branch" as const },
  { id: "74", name: "AGENCE MONASTIR EL HELIA", address: "IMMEUBLE RHIM CENTRE, AVENUE TAIEB MHIRI, 5000", phone: "70 641 350", email: "agence.elhelia@attijaribank.com.tn", lat: 35.767316, lng: 10.82207, type: "branch" as const },
  { id: "75", name: "AGENCE MONASTIR", address: "13 IMMEUBLE STAR, 5000", phone: "70 640 450", email: "agence.monastir@attijaribank.com.tn", lat: 35.773691, lng: 10.828824, type: "branch" as const },
  { id: "76", name: "AGENCE MOKNINE", address: "13 AVENUE HABIB BOURGUIBA, 5050", phone: "70 640 550", email: "agence.Moknine@attijaribank.com.tn", lat: 35.628699, lng: 10.899901, type: "branch" as const },
  { id: "77", name: "AGENCE KSAR HELLAL", address: "AVENUE HABIB BOURGUIBA, 5070 KSAR HELLAL", phone: "70 640 210", email: "agence.Ksarhellal@attijaribank.com.tn", lat: 35.643512, lng: 10.890751, type: "branch" as const },
  { id: "78", name: "AGENCE JEMMAL", address: "19 AVENUE DE LA REPUBLIQUE, 5020", phone: "70 640 370", email: "agence.Jammel@attijaribank.com.tn", lat: 35.6258994, lng: 10.7610279, type: "branch" as const },
  { id: "79", name: "AGENCE ZARZIS MOUENSA", address: "Souk El Mouensa, 4144", phone: "70 642 180", email: "ag.zarziselmouensa@attijaribank.com.tn", lat: 33.505785, lng: 11.098445, type: "branch" as const },
  { id: "80", name: "AGENCE ZARZIS", address: "10 AVENUE MOHAMED V, 4170", phone: "70 640 160", email: "agence.Zarzis@attijaribank.com.tn", lat: 33.504947, lng: 11.109588, type: "branch" as const },
  { id: "81", name: "AGENCE Z FRANCHE", address: "ZONE FRANCHE DE ZARZIS , 4137", phone: "70 640 830", email: "agence.Zarzis2@attijaribank.com.tn", lat: 33.29156, lng: 11.06001, type: "branch" as const },
  { id: "82", name: "AGENCE MEDENINE IBN ARAFA", address: "Angle route de Tataouine et rue Ibn Arafa , 4100", phone: "70 642 280", email: "ag.medenineibnarafa@attijaribank.com.tn", lat: 33.3389, lng: 10.4869, type: "branch" as const },
  { id: "83", name: "AGENCE MEDENINE", address: "AVENUE HABIB BOURGUIBA - MEDENINE, 4100", phone: "70 640 140", email: "agence.Medenine@attijaribank.com.tn", lat: 33.20506, lng: 10.29167, type: "branch" as const },
  { id: "84", name: "AGENCE JERBA MIDOUN", address: "ANGLE DE AVENUE HABIB BOURGUIBA & RUE DE CARTHAGE MIDOUN CENTRE, 4116", phone: "70 640 660", email: "agence.JerbaMidoun@attijaribank.com.tn", lat: 33.808668, lng: 10.990824, type: "branch" as const },
  { id: "85", name: "AGENCE JERBA HOUMET SOUK", address: "AVENUE HABIB BOURGUIBA - HOUMT SOUK JERBA, 4180", phone: "70 640 150", email: "agence.HoumtEssouk@attijaribank.com.tn", lat: 33.875142, lng: 10.857779, type: "branch" as const },
  { id: "86", name: "AGENCE JERBA EL MAY", address: "RUE YOUSSEF LABBASSI, 4175", phone: "70 640 630", email: "agence.JerbaElmay@attijaribank.com.tn", lat: 33.797338, lng: 10.882798, type: "branch" as const },
  { id: "87", name: "AGENCE BEN GARDANE", address: "AVENUE DES MARTYRS ET ROUTE DE TUNIS, 4160", phone: "70 640 190", email: "agence.BenGuerdane@attijaribank.com.tn", lat: 33.138552, lng: 11.220431, type: "branch" as const },
  { id: "88", name: "AGENCE OUED ELLIL", address: "22 AVENUE HABIB BOURGUIBA, 2021", phone: "70 641 110", email: "agence.Ouedellil@attijaribank.com.tn", lat: 36.832343, lng: 10.04084, type: "branch" as const },
  { id: "89", name: "AGENCE MANNOUBA", address: "1 AVENUE HABIB BOURGUIBA MANNOUBA, 2010", phone: "70 641 390", email: "agence.MANOUBA@attijaribank.com.tn", lat: 36.80969, lng: 10.092914, type: "branch" as const },
  { id: "90", name: "AGENCE DEN DEN", address: "AVENUE DE L'INDEPENDANCE, 2011", phone: "70 640 050", email: "agence.DenDen@attijaribank.com.tn", lat: 36.80254, lng: 10.11356, type: "branch" as const },
  { id: "91", name: "AGENCE MAHDIA", address: "12 AVENUE FARHAT HACHED , 5100", phone: "70 640 400", email: "agence.Mahdia@attijaribank.com.tn", lat: 35.502372, lng: 11.067244, type: "branch" as const },
  { id: "92", name: "AGENCE KSOUR ESSAF", address: "Avenue Habib Thameur Route de Sfax - Ksour Essaf, 5180", phone: "70 641 900", email: "ag.ksouressaf@attijaribank.com.tn", lat: 35.420653, lng: 10.999056, type: "branch" as const },
  { id: "93", name: "AGENCE EL DJEM", address: "AVENUE TAIEB MHIRI, 5060", phone: "70 640 960", email: "agence.eljem@attijaribank.com.tn", lat: 35.29287, lng: 10.708487, type: "branch" as const },
  { id: "94", name: "AGENCE BOUMERDES", address: "12 AVENUE FARHAT HACHED, 5110", phone: "70 640 490", email: "agence.Boumerdes@attijaribank.com.tn", lat: 35.456769, lng: 10.729323, type: "branch" as const },
  { id: "95", name: "AGENCE TAJEROUINE", address: "AVENUE HABIB BOURGUIBA, 7150", phone: "70 640 360", email: "agence.Tajerouine@attijaribank.com.tn", lat: 35.891571, lng: 8.552906, type: "branch" as const },
  { id: "96", name: "AGENCE LE KEF", address: "IMMEUBLE CTAMA, AVENUE HABIB BOURGUIBA, 7100", phone: "70 640 590", email: "agence.Kef@attijaribank.com.tn", lat: 36.178549, lng: 8.713413, type: "branch" as const },
  { id: "97", name: "AGENCE DJERISSA", address: "AVENUE HABIB BOURGUIBA, 7114", phone: "70 640 720", email: "agence.Jerissa@attijaribank.com.tn", lat: 35.844015, lng: 8.6262504, type: "branch" as const },
  { id: "98", name: "AGENCE SOUK EL AHAD", address: "AVENUE HABIB BOURGUIBA, 4230", phone: "70 640 680", email: "agence.SoukLahad@attijaribank.com.tn", lat: 33.778491, lng: 8.850724, type: "branch" as const },
  { id: "99", name: "AGENCE KEBILI", address: "AVENUE HABIB BOURGUIBA, 4200", phone: "70 640 410", email: "agence.Kebili@attijaribank.com.tn", lat: 33.705691, lng: 8.964892, type: "branch" as const },
  { id: "100", name: "AGENCE GOLAA", address: "Avenue 20 Mars, Cité Izdihar - Golaa, 4234", phone: "70 642 340", email: "agence.golaa@attijaribank.com.tn", lat: 33.482132, lng: 9.007408, type: "branch" as const },
  { id: "101", name: "AGENCE DOUZ", address: "AVENUE HABIB BOURGUIBA, 4260", phone: "70 640 500", email: "agence.Douz@attijaribank.com.tn", lat: 33.454915, lng: 9.023945, type: "branch" as const },
  { id: "102", name: "AGENCE KASSERINE", address: "10 PLACE DES MARTYRS , 1200", phone: "70 640 530", email: "agence.Kasserine@attijaribank.com.tn", lat: 35.167793, lng: 8.834289, type: "branch" as const },
  { id: "103", name: "AGENCE KAIROUAN", address: "AV DOCTEUR HAMDA LAOUANI, 3100", phone: "70 640 330", email: "agence.Kairouan@attijaribank.com.tn", lat: 35.673702, lng: 10.10166, type: "branch" as const },
  { id: "104", name: "AGENCE EL AGHALIBA KAIROUAN", address: "AVENUE BAIT EL HECKMA MANSOURA, 3100", phone: "70 641 090", email: "agence.AGHALIBA@attijaribank.com.tn", lat: 35.673702, lng: 10.10166, type: "branch" as const },
  { id: "105", name: "AGENCE TABARKA", address: "RESIDENCE PORTO CORALLO, 8110", phone: "70 640 730", email: "agence.Tabarka@attijaribank.com.tn", lat: 36.955421, lng: 8.759723, type: "branch" as const },
  { id: "106", name: "AGENCE JENDOUBA", address: "RUE ALI BELHOUANE JENDOUBA, 8100", phone: "70 640 620", email: "agence.jendouba@attijaribank.com.tn", lat: 36.5008344, lng: 8.780342, type: "branch" as const },
  { id: "107", name: "AGENCE BOU SALEM", address: "37 Rue Salah Ben Youssef - BOU SALEM, 8170", phone: "70 641 660", email: "ag.bousalem@attijaribank.com.tn", lat: 36.610075, lng: 8.973523, type: "branch" as const },
  { id: "108", name: "AGENCE REDEYEF", address: "16 AVENUE HABIB BOURGUIBA, 2120", phone: "70 640 250", email: "agence.Redaef@attijaribank.com.tn", lat: 34.379597, lng: 8.148774, type: "branch" as const },
  { id: "109", name: "AGENCE MOULARES", address: "RTE DE GAFSA MOULARES, 2110", phone: "70 640 600", email: "agence.Omelarais@attijaribank.com.tn", lat: 34.49576, lng: 8.2832767, type: "branch" as const },
  { id: "110", name: "AGENCE METLAOUI", address: "6 PLACE 2 MARS 1934 METLAOUI, 2130", phone: "70 640 240", email: "agence.metlaoui@attijaribank.com.tn", lat: 34.316179, lng: 8.405357, type: "branch" as const },
  { id: "111", name: "AGENCE GAFSA PLACE DU MARCHE", address: "6 PLACE DU MARCHE - GAFSA, 2100", phone: "70 640 130", email: "agence.gafsa@attijaribank.com.tn", lat: 34.4176, lng: 8.7914, type: "branch" as const },
  { id: "112", name: "AGENCE GAFSA PLACE D'AFRIQUE", address: "AVENUE TAEIB MHIRI, 2100", phone: "70 640 570", email: "agence.Gafsa2@attijaribank.com.tn", lat: 34.416269, lng: 8.791578, type: "branch" as const },
  { id: "113", name: "AGENCE GAFSA L'ENVIRONNEMENT", address: "17 Bvd de l'environnement - GAFSA, 2133", phone: "70 641 630", email: "ag.gafsalenvironnement@attijaribank.com.tn", lat: 34.4228159, lng: 8.7784312, type: "branch" as const },
  { id: "114", name: "AGENCE GAFSA KSAR", address: "Place de la Terre - GAFSA, 2100", phone: "70 641 640", email: "ag.gafsaksar@attijaribank.com.tn", lat: 34.404557, lng: 8.798823, type: "branch" as const },
  { id: "115", name: "AGENCE METOUIA", address: "5 AVENUE HABIB BOURGUIBA, 6010", phone: "70 640 640", email: "agence.metouia@attijaribank.com.tn", lat: 33.999259, lng: 10.000587, type: "branch" as const },
  { id: "116", name: "AGENCE MARETH", address: "Angle rue de gabès et route GP1 - Mareth, 6080", phone: "70 641 690", email: "ag.mareth@attijaribank.com.tn", lat: 33.618229, lng: 10.2844998, type: "branch" as const },
  { id: "117", name: "AGENCE GABES EL MENZEL", address: "93 AVENUE DE LA REPUBLIQUE, 6000", phone: "70 640 650", email: "agence.GabesMenzel@attijaribank.com.tn", lat: 33.880881, lng: 10.090711, type: "branch" as const },
  { id: "118", name: "AGENCE GABES", address: "AVENUE HABIB BOURGUIBA GABES, 6000", phone: "70 640 120", email: "agence.gabes@attijaribank.com.tn", lat: 33.887207, lng: 10.104187, type: "branch" as const },
  { id: "119", name: "AGENCE MENZEL JEMIL", address: "AVENUE H.BOURGUIBA, 7080", phone: "70 640 470", email: "agence.MenzelJemil@attijaribank.com.tn", lat: 37.238147, lng: 9.913745, type: "branch" as const },
  { id: "120", name: "AGENCE MENZEL BOURGUIBA", address: "RUE 17 JANVIER MENZEL BOURGUIBA, 7050", phone: "70 640 610", email: "agence.MLBourguiba@attijaribank.com.tn", lat: 37.155189, lng: 9.79287, type: "branch" as const },
  { id: "121", name: "AGENCE MATEUR", address: "2 Rue FARHAT HACHAD - Mateur, 7030", phone: "70 642 220", email: "ag.mateur@attijaribank.com.tn", lat: 37.037809, lng: 9.671048, type: "branch" as const },
  { id: "122", name: "AGENCE EL ALIA", address: "Avenue Habib Bourguiba –EL ALIA, 7016", phone: "70 642 230", email: "ag.elalia@attijaribank.com.tn", lat: 37.170431, lng: 10.031281, type: "branch" as const },
  { id: "123", name: "AGENCE BIZERTE VILLE", address: "Angle de avenue Taieb M'hiri et rue Habib Thameur, 7000", phone: "70 641 270", email: "bizerte.ville@attiiaribank.com.tn", lat: 37.271199, lng: 9.872129, type: "branch" as const },
  { id: "124", name: "AGENCE BIZERTE EL JALAA", address: "Avenue 14 Janvier, 7000", phone: "70 642 190", email: "ag.bizerteeljalaa@attijaribank.com.tn", lat: 37.283065, lng: 9.858985, type: "branch" as const },
  { id: "125", name: "AGENCE BIZERTE", address: "ANGLE RUE HABIB THAMEUR ET RUE MONCEF BEY, 7000", phone: "70 640 260", email: "agence.Bizerte@attijaribank.com.tn", lat: 37.270778, lng: 9.87144, type: "branch" as const },
  { id: "126", name: "AGENCE FOUCHANA", address: "Avenue de l’Indépendance - Fouchana, 2082", phone: "70 641 130", email: "agence.fouchana@attijaribank.com.tn", lat: 36.696083, lng: 10.167405, type: "branch" as const },
  { id: "127", name: "AGENCE EL MOUROUJ 3", address: "Rue 14 Janvier 2011 n°1, 2074", phone: "70 641 870", email: "ag.elmourouj3@attijaribank.com.tn", lat: 36.721539, lng: 10.215201, type: "branch" as const },
  { id: "128", name: "AGENCE BEN AROUS VILLE", address: "42 Avenue HABIB BOURGUIBA -BEN AROUS, 2013", phone: "70 641 860", email: "ag.benarousville@attijaribank.com.tn", lat: 36.753114, lng: 10.223294, type: "branch" as const },
  { id: "129", name: "AGENCE BEJA", address: "AVENUE HABIB BOURGUIBA, 9000", phone: "70 640 310", email: "agence.Beja@attijaribank.com.tn", lat: 36.723771, lng: 9.18592, type: "branch" as const },
  { id: "130", name: "AGENCE SIDI THABET", address: "AVENUE H.BOURGUIBA, 2020", phone: "70 640 930", email: "agence.SidiThabet@attijaribank.com.tn", lat: 36.908451, lng: 10.042155, type: "branch" as const },
  { id: "131", name: "AGENCE M'NIHLA", address: "Route de Bizerte – M’nihla, 2094", phone: "70 642 330", email: "ag.mnihla@attijaribank.com.tn", lat: 36.868234, lng: 10.117163, type: "branch" as const },
  { id: "132", name: "AGENCE INTILAKA", address: "10, Avenue Ibn Khaldoun, Cité Ettadhamen 1064", phone: "70 641 560", email: "ag.intilaka@attijaribank.com", lat: 36.839633, lng: 10.116693, type: "branch" as const },
  { id: "133", name: "AGENCE HEDI NOUIRA", address: "RESIDENCE OSALIS GARDEN, AVENUE HEDI NOUIRA 2037", phone: "70 641 150", email: "agence.annasr2@attijaribank.com.tn", lat: 36.864843, lng: 10.168277, type: "branch" as const },
  { id: "134", name: "AGENCE EL MENZAH 6", address: "147, Avenue Othmen Ibn Affen - El Menzah 6, 2091", phone: "70 641 890", email: "ag.elmenzah6@attijaribank.com.tn", lat: 36.847104, lng: 10.167891, type: "branch" as const },
  { id: "135", name: "AGENCE LES JARDINS DE CARTHAGE", address: "Lotissements les jardins de carthage Horizon, Tunis 2089", phone: "70 642 320", email: "ag.lesjardinsdecarthage@attijaribank.com.tn", lat: 36.8579953, lng: 10.2929457, type: "branch" as const },
  { id: "136", name: "AGENCE BORJ LOUZIR", address: "15 Rue Mustapha Mohsen Borj Louzir, Ariana 2073", phone: "70 642 260", email: "ag.borjlouzir@attijaribank.com.tn", lat: 36.8651312, lng: 10.2011583, type: "branch" as const },
  { id: "137", name: "AGENCE ARIANA NORD", address: "24 rue ibn khaldoun (en face de l’hopital Mahmoud el Matri, Ariana 2080", phone: "70642240", email: "ag.ariananord@attijaribank.com.tn", lat: 36.869, lng: 10.183, type: "branch" as const },
  { id: "138", name: "CENTRE D'AFFAIRES DU SIÈGE", address: "24, Rue Hédi Karray Centre Urbain Nord, Tunis 1080", phone: "70 012 715", email: "ag.centreaffaire217@attijaribank.com.tn", lat: 36.8463921, lng: 10.1882496, type: "ca" as const },
  { id: "139", name: "AGENCE RIADH EL ANDALOUS", address: "Résidence Omrane 10 – GP 8 Cité El Ghazela, Ariana 2058", phone: "70 641 920", email: "ag.riadhelandalous@attijaribank.com.tn", lat: 36.879317, lng: 10.179759, type: "branch" as const },
  { id: "140", name: "AGENCE CARTHAGE BYRSA", address: "Angle  Avenue Habib Bourguiba et  Rue 2 mars 1934, Carthage Byrsa 2016", phone: "70 641 880", email: "ag.carthagebyrsa@attijaribank.com.tn", lat: 36.845486, lng: 10.321748, type: "branch" as const },
  { id: "141", name: "AGENCE BOUMHEL", address: "Boulevard de l’environnement- Résidence « Nozha Gaieb », Boumhel Bassatine 2097", phone: "70 641 810", email: "ag.boumhel@attijaribank.com.tn", lat: 36.729191, lng: 10.30831, type: "branch" as const },
  { id: "142", name: "AGENCE MANAR 1", address: "Résidence Jinène Hannibal EL Manar, 2092", phone: "70 641 770", email: "ag.manar1@attijaribank.com.tn", lat: 36.834907, lng: 10.138484, type: "branch" as const },
  { id: "143", name: "AGENCE AIN ZAGHOUAN", address: "Avenue Khaled Ibn Walid – Ain Zaghouan, Tunis 2046", phone: "70 641 740", email: "ag.ainzaghouan@attijaribank.com.tn", lat: 36.861774, lng: 10.277321, type: "branch" as const },
  { id: "144", name: "AGENCE MENZAH 9", address: "40,41 Avenue Taher Ben Ammar, Centre Commercial Aïda Menzah9, Tunis 2050", phone: "70 641 730", email: "ag.menzah9@attijaribank.com.tn", lat: 36.844755, lng: 10.153881, type: "branch" as const },
  { id: "145", name: "AGENCE MARSA 2", address: "Place Moncef Bey (Angle Rue Abdelaaziz Chtioui), La marsa 2070", phone: "70 641 680", email: "ag.marsa2@attijaribank.com.tn", lat: 36.880178, lng: 10.326812, type: "branch" as const },
  { id: "146", name: "AGENCE BOUGARNIN", address: "Angle Av de la République GP1 et Rue de Monastir, Hammam Lif 2050", phone: "70 641 650", email: "ag.bougarnin@attijaribank.com.tn", lat: 36.730418, lng: 10.330146, type: "branch" as const },
  { id: "147", name: "AGENCE MENZAH 1", address: "10 Av. Charles Nicole, Menzah 1  1004", phone: "70 641 620", email: "ag.menzah1@attijaribank.com.tn", lat: 36.8369879, lng: 10.1813409, type: "branch" as const },
  { id: "148", name: "AGENCE MEGRINE", address: "31, avenue habib Bourguiba, Mégrine 2033", phone: "70 641 570", email: "ag.megrine@attijaribank.com.tn", lat: 36.769515, lng: 10.236066, type: "branch" as const },
  { id: "149", name: "AGENCE EZZAHRA", address: "Immeuble 'Ezzahra Center', Avenue Habib Bourguiba, Ezzahra 2034", phone: "70 641 550", email: "ag.ezzahra@attijaribank.com.tn", lat: 36.739688, lng: 10.302584, type: "branch" as const },
  { id: "150", name: "AGENCE KHEIREDDINE PACHA", address: "Avenue Kheireddine Pacha, montplaisir, Tunis 1002", phone: "70 641 540", email: "kheireddine.pacha@attijaribank.com.tn", lat: 36.821356, lng: 10.188806, type: "branch" as const },
  { id: "151", name: "AGENCE MENZAH 5", address: "18, avenue de la liberté, Ariana 2080", phone: "70 641 500", email: "agence.MENZAH5@attijaribank.com.tn", lat: 36.848292, lng: 10.175194, type: "branch" as const },
  { id: "152", name: "AGENCE DAR FADHAL", address: "Résidence SALMA, avenue Taieb MHIRI, Tunis 2036", phone: "70 641 470", email: "agence.darfadhal@attijaribank.com.tn", lat: 36.8613563, lng: 10.2535282, type: "branch" as const },
  { id: "153", name: "AGENCE CITE EL KHADRA", address: "Angle de avenue Louis Braille &rue Mohamed CHNIK , Tunis 1003", phone: "70 641 460", email: "agence.Citeelkhadra@attijaribank.com.tn", lat: 36.82894, lng: 10.19156, type: "branch" as const },
  { id: "154", name: "AGENCE LAC MARINA", address: "AVENUE TAHAR HADDAD, IMMEUBLE LLOYD, LES BERGES DU LAC, Tunis 1053", phone: "70 641 450", email: "agence.lacmarina@attijaribank.com.tn", lat: 36.835744, lng: 10.241588, type: "branch" as const },
  { id: "155", name: "CENTRE DAR AL MACHARII ARIANA", address: "Avenue Habib Bourguiba, Nvelle Ariana 2080", phone: "70 641 440", email: "agence.lesjasmins@attijaribank.com.tn", lat: 36.849713, lng: 10.183074, type: "dam" as const },
  { id: "156", name: "AGENCE BAB SOUIKA", address: "CENTRE COMMERCIAL BAB SOUIKA - EL HALFAOUINE, PLACE BAB SOUIKA, Tunis 1006", phone: "70 641 410", email: "agence.babsouika@attijaribank.com.tn", lat: 36.80446, lng: 10.168546, type: "branch" as const },
  { id: "157", name: "AGENCE MENZAH 8", address: "IMMEUBLE MESSAI, AVENUE OTHMAN IBN AFFANE, Ariana 2080", phone: "70 641 330", email: "agence.Menzah8@attijaribank.com.tn", lat: 36.855196, lng: 10.16944, type: "branch" as const },
  { id: "158", name: "AGENCE MOUROUJ 1", address: "24 AVENUE DES MARTYRS, Ben Arous 2074", phone: "70 641 320", email: "agence.elmourouj1@attijaribank.com.tn", lat: 36.737757, lng: 10.2068, type: "branch" as const },
  { id: "159", name: "AGENCE LES ROSERAIES", address: "IMMEUBLE YESMINA, ANGLE DE AVENUE TAIEB MHIRI ET RUE CHEDLY KTARI, Ariana 2080", phone: "70 641 260", email: "agence.ROSERAIES@attijaribank.com.tn", lat: 36.859565, lng: 10.196102, type: "branch" as const },
  { id: "160", name: "AGENCE NOUVELLE ARIANA", address: "ANGLE DE L AVENUE MUSTAPHA HJAIEJ ET AVENUE EL MILAHA, Tunis 2080", phone: "70 641 240", email: "agence.NouvelleAriana@attijaribank.com.tn", lat: 36.856495, lng: 10.178735, type: "branch" as const },
  { id: "161", name: "AGENCE LES JARDINS DU LAC", address: "ANGLE DE L’IMMEUBLE YESMINE DU LAC, LES JARDINS DU LAC, LA GOULETTE, Tunis 1053", phone: "70 641 230", email: "agence.jardinsLac@attijaribank.com.tn", lat: 36.847911, lng: 10.269618, type: "branch" as const },
  { id: "162", name: "AGENCE MONTPLAISIR", address: "IMMEUBLE AZIZ, RUE 8368 MONTPLAISIR, Tunis 1073", phone: "70 641 210", email: "agence.montplaisir@attijaribank.com.tn", lat: 36.821819, lng: 10.194238, type: "branch" as const },
  { id: "163", name: "AGENCE EL GHAZELA", address: "ANGLE DE AVENUE FETHI ZOUHEIR ET RUE DE PALESTINE, Ariana 2083", phone: "70 641 200", email: "agence.ELGHAZALA@attijaribank.com.tn", lat: 36.889307, lng: 10.18133, type: "branch" as const },
  { id: "164", name: "AGENCE CHARGUIA EXPOSITION", address: "IMMEUBLE KSONTINI RUE 8600 Z.I. CHARGUIA, Tunis 2035", phone: "70 641 190", email: "agence.charguiaparcexpo@attijaribank.com.tn", lat: 36.8370625, lng: 10.2024375, type: "branch" as const },
  { id: "165", name: "AGENCE BEN AROUS", address: "59, AVENUE DE FRANCE, Ben Arous 2013", phone: "70 641 180", email: "agence.benarous@attijaribank.com.tn", lat: 36.763549, lng: 10.226741, type: "branch" as const },
  { id: "166", name: "AGENCE SOUKRA", address: "ANGLE DE L'AVENUE DE L'UMA ET RUE EL MOEZ IBN BADIS, Ariana 2036", phone: "70 641 140", email: "agence.Soukra@attijaribank.com.tn", lat: 36.8635, lng: 10.21433, type: "branch" as const },
  { id: "167", name: "AGENCE ENNASR II", address: "39 BIS AVENUE HEDI NOUIRA, Ariana 2037", phone: "70 641 070", email: "agence.ennasr2@attijaribank.com.tn", lat: 36.855989, lng: 10.15976, type: "branch" as const },
  { id: "168", name: "AGENCE BELVEDERE II 106", address: "95, AVENUE DE LA LIBERTE, Tunis Belvédère 1002", phone: "70 641 060", email: "agence.SuccSiege@attijaribank.com.tn", lat: 36.816142, lng: 10.180053, type: "branch" as const },
  { id: "169", name: "AGENCE BAB JEDID", address: "19 ET 21 RUE BAB JEDID, Tunis 1000", phone: "70 641 030", email: "agence.Bebjdid@attijaribank.com.tn", lat: 36.792341, lng: 10.175645, type: "branch" as const },
  { id: "170", name: "AGENCE LE PASSAGE", address: "53, AVENUE DE PARIS, Tunis 1000", phone: "70 640 860", email: "agence.Passage@attijaribank.com.tn", lat: 36.8066, lng: 10.1802, type: "branch" as const },
  { id: "171", name: "AGENCE LA MARSA", address: "RESIDENCE ESPLANADE AVENUE HABIB BOURGUIBA, Marsa Plage 2007", phone: "70 640 820", email: "agence.Marsa@attijaribank.com.tn", lat: 36.884129, lng: 10.331849, type: "branch" as const },
  { id: "172", name: "CA CHARGUIA", address: "Rue 8600, ZI Charguia I, Tunis Carthage 2035", phone: "70 640 800", email: "agence.Charguia1@attijaribank.com.tn", lat: 36.838425, lng: 10.20313, type: "ca" as const },
  { id: "173", name: "CA MEGRINE", address: "GP1,km 5.5, Ben Arous 2013", phone: "70 640 790", email: "megrine@attijaribank.com.tn", lat: 36.76441, lng: 10.227109, type: "ca" as const },
  { id: "174", name: "CA BELVEDERE", address: "5, Place Pasteur, Tunis 1002", phone: "70 640 440", email: "agence.centreaffaire044@attijaribank.com.tn", lat: 36.821637, lng: 10.179136, type: "ca" as const },
  { id: "175", name: "AGENCE LE KRAM", address: "165 AVENUE HABIB BOURGUIBA, Le Kram 2015", phone: "70 640 380", email: "agence.LeKram@attijaribank.com.tn", lat: 36.832288, lng: 10.315908, type: "branch" as const },
  { id: "176", name: "AGENCE LA GOULETTE", address: "10 FRAHAT HACHED, La goulette 2060", phone: "70 640 350", email: "agence.LaGoulette@attijaribank.com.tn", lat: 36.815575, lng: 10.304349, type: "branch" as const },
  { id: "177", name: "CENTRE D'AFFAIRES SFAX CHEBBI", address: "Rue Abou El Kacem CHEBBI, Sfax 3000", phone: "70 640 010", email: "agence.sfax@attijaribank.com.tn", lat: 34.73193, lng: 10.765966, type: "ca" as const },
  { id: "178", name: "CENTRE D'AFFAIRES SOUSSE CENTRE", address: "Avenue Hbib BOURGUIBA, Sousse 4000", phone: "70 640 770", email: "agence.SousseCenter@attijaribank.com.tn", lat: 35.832159, lng: 10.64039, type: "ca" as const },
  { id: "179", name: "CENTRE D'AFFAIRES CHARGUIA", address: "Rue 8600, ZI Charguia I, 2035", phone: "70 640 800", email: "agence.Charguia1@attijaribank.com.tn", lat: 36.838425, lng: 10.20313, type: "ca" as const },
  { id: "180", name: "CENTRE D'AFFAIRES MEGRINE", address: "GP1,km 5.5, BEN AROUS 2013", phone: "70 640 790", email: "megrine@attijaribank.com.tn", lat: 36.76441, lng: 10.227109, type: "ca" as const },
  { id: "181", name: "CENTRE D'AFFAIRES BELVEDERE", address: "5, Place Pasteur, Tunis 1002", phone: "70 640 440", email: "agence.centreaffaire044@attijaribank.com.tn", lat: 36.821637, lng: 10.179136, type: "ca" as const },
  { id: "182", name: "CENTRE D'AFFAIRES AVENUE PARIS", address: "14, Avenue de Paris, Tunis 1002", phone: "70 640 100", email: "agence.AvenueParis@attijaribank.com.tn", lat: 36.800605, lng: 10.181211, type: "ca" as const },
  { id: "183", name: "Libre-service bancaire TUNIS", address: "17, Avenue Habib Bourguiba, Tunis 1000", phone: "", email: "", lat: 36.8002721, lng: 10.1855518, type: "lsb" as const },
  { id: "184", name: "Libre-service bancaire SFAX", address: "Résidence les Jasmins, Route de Tunis Km 1,5 MOULINVILLE, 3002", phone: "", email: "", lat: 34.75322, lng: 10.76183, type: "lsb" as const },
  { id: "185", name: "Libre-service bancaire SOUSSE", address: "3, Immeuble Gribaâ, Avenue la Perle du Sahel - Khzama Est, 4051", phone: "", email: "", lat: 35.809053, lng: 10.724155, type: "lsb" as const },
  { id: "186", name: "Libre-service bancaire ARIANA", address: "40, Avenue Habib Bourguiba – Nouvelle Ariana, 2080", phone: "", email: "", lat: 36.849713, lng: 10.183074, type: "lsb" as const },
  { id: "187", name: "Box Aéroport de Djerba", address: "Aéroport de Djerba", phone: "70 640 000", email: "", lat: 33.8716, lng: 10.77493, type: "box" as const },
  { id: "188", name: "Box Aéroport Tunis Carthage", address: "Aéroport Tunis Carthage", phone: "71 754 400", email: "", lat: 36.84761, lng: 10.21735, type: "box" as const },
  { id: "189", name: "DAR AL MACHARII SFAX", address: "Résidence les Jasmins, Route de Tunis Km 1,5 MOULINVILLE, 3002", phone: "70 641 490", email: "adam.sfax@attijaribank.com.tn", lat: 34.75322, lng: 10.76183, type: "dam" as const },
  { id: "190", name: "DAR AL MACHARII SOUSSE", address: "3, Immeuble Gribaâ, Avenue la Perle du Sahel - Khzama EST, 4051", phone: "70 641 780", email: "dam.sousse@attijaribank.com.tn", lat: 35.809053, lng: 10.724155, type: "dam" as const },
  { id: "191", name: "DAR AL MACHARII ARIANA", address: "40 Avenue Habib Bourguiba – NOUVELLE ARIANA, 2080", phone: "70 641 440", email: "dam.lesjasmins@attijaribank.com.tn", lat: 36.849713, lng: 10.183074, type: "dam" as const },
  { id: "192", name: "Succursale Entreprises Sfax", address: "ANGLE AV. 05 AOUT ET ROUTE DE LA MAHDIA IMMEUBLE LE CARREFOUR - SFAX, 3002", phone: "70 640 390", email: "Succursale.sfax@attijaribank.com.tn", lat: 34.7435585, lng: 10.7633048, type: "ca" as const },
  { id: "193", name: "Succursale Entreprises Néapolis", address: "27, Angle AV. Habib Thameur et Rue Marbella 8000 - Nabeul, 8000", phone: "70 022 027", email: "Succursale.neapolis@attijaribank.com.tn", lat: 36.45322, lng: 10.730855, type: "ca" as const },
  { id: "194", name: "Succursale Entreprises Bizerte", address: "142, Route Corniche - Erraouabi, 7000", phone: "70 642 350", email: "Succursale.bizerte@attijaribank.com.tn", lat: 37.297386, lng: 9.867688, type: "ca" as const },
  { id: "195", name: "AGENCE BARCELONE", address: "9, RUE DE HOLLANDE, Tunis 1000", phone: "70 640 340", email: "agence.barcelone@attijaribank.com.tn", lat: 36.797903, lng: 10.179996, type: "branch" as const },
  { id: "196", name: "CA AVENUE PARIS", address: "14, Avenue de Paris - Tunis, Tunis 1002", phone: "70 640 100", email: "agence.AvenueParis@attijaribank.com.tn", lat: 36.800605, lng: 10.181211, type: "ca" as const },
  { id: "197", name: "AGENCE RADES", address: "34 AVENUE FARHAT HACHED, Rades 2040", phone: "70 640 090", email: "agence.Rades@attijaribank.com.tn", lat: 36.767045, lng: 10.271853, type: "branch" as const },
  { id: "198", name: "AGENCE HAMMAM LIF", address: "AVENUE HABIB BOURGUIBA, Hammam-Lif 2050", phone: "70 640 080", email: "agence.HammamLif@attijaribank.com.tn", lat: 36.730278, lng: 10.335847, type: "branch" as const },
  { id: "199", name: "AGENCE ARIANA", address: "9, AVENUE HABIB BOURGUIBA, Ariana 2080", phone: "70 640 070", email: "agence.Ariana@attijaribank.com.tn", lat: 36.8576339, lng: 10.1883674, type: "branch" as const },
  { id: "200", name: "AGENCE PLACE M.BEY TUNIS", address: "89 RUE HOUSSINE BOUZAYENNE, Tunis 1001", phone: "70 640 040", email: "agence.MoncefBey@attijaribank.com.tn", lat: 36.793988, lng: 10.184918, type: "branch" as const },
  { id: "201", name: "AGENCE AV.MED V   TUNIS", address: "3, PLACE PASTEUR BELVEDERE , Tunis 1002", phone: "70 640 000", email: "agence.Mohamed5@attijaribank.com.tn", lat: 36.8212562, lng: 10.1789876, type: "branch" as const },
  { id: "202", name: "AGENCE AV.LIBERTE TUNIS", address: "45, AVENUE DE LA LIBERTE, Tunis 1002", phone: "70 640 020", email: "agence.Liberte@attijaribank.com.tn", lat: 36.8106008, lng: 10.1794529, type: "branch" as const },
  { id: "203", name: "AGENCE BACH HAMBA", address: "56, AVENUE HABIB BOURGUIBA , Tunis 1000", phone: "70 640 000", email: "agence.Bachamba@attijaribank.com.tn", lat: 36.799924, lng: 10.183537, type: "branch" as const },
  { id: "204", name: "Agence Mahdia", address: "Avenue Habib Bourguiba, Mahdia 4116", phone: "70 640 660", email: "", lat: 35.5047495, lng: 11.0433022, type: "branch" as const },
  { id: "205", name: "Agence Sousse", address: "Avenue Habib Bourguiba, Sousse 4116", phone: "70 640 660", email: "", lat: 35.8283991, lng: 10.583035, type: "branch" as const },
  { id: "206", name: "Agence Nabeul", address: "Avenue Habib Bourguiba, Nabeul 4116", phone: "70 640 660", email: "", lat: 36.45031891817, lng: 10.713967855072, type: "branch" as const },
  { id: "207", name: "Agence Djerba", address: "Avenue Habib Bourguiba, Jerba 4116", phone: "70 640 660", email: "", lat: 33.7691623, lng: 10.8797693, type: "branch" as const },
];

// ─── Marqueur Attijari ────────────────────────────────
const AttijariPin = ({ type, selected }: { type:AgencyType; selected?:boolean }) => {
  const cfg = TYPE_CONFIG[type];
  return (
    <View style={[mk.wrap,{backgroundColor:cfg.color},selected&&mk.sel]}>
      <Text style={[mk.icon,selected&&mk.iconBig]}>{cfg.emoji}</Text>
      <View style={[mk.tail,{borderTopColor:cfg.color}]}/>
    </View>
  );
};
const mk = StyleSheet.create({
  wrap:    {width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',borderWidth:2.5,borderColor:'#fff'},
  sel:     {width:50,height:50,borderRadius:25,borderWidth:3},
  icon:    {fontSize:18},
  iconBig: {fontSize:22},
  tail:    {position:'absolute',bottom:-10,width:0,height:0,
            borderLeftWidth:6,borderRightWidth:6,borderTopWidth:10,
            borderLeftColor:'transparent',borderRightColor:'transparent'},
});

// ═══════════════════════════════════════════════════════
type Nav = NativeStackNavigationProp<any>;
interface Props { navigation: Nav; }

export const MapScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, completeStep, isDark } = useApp();
  const toastRef = useRef<ToastRef>(null);
  const mapRef   = useRef<MapView>(null);
  const cardAnim = useRef(new Animated.Value(0)).current;

  const [userLoc,      setUserLoc]      = useState<{lat:number;lng:number}|null>(null);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Agency|null>(null);
  const [search,       setSearch]       = useState('');
  const [activeTab,    setActiveTab]    = useState<'list'|'map'>('list');
  const [filterType,   setFilterType]   = useState<AgencyType|'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all'|'open'|'closed'>('all');
  const [sortBy,       setSortBy]       = useState<'dist'|'name'>('dist');
  const [showSort,     setShowSort]     = useState(false);
  const [showContact,  setShowContact]  = useState(false);

  // ── useMemo : calcule distances + statut une seule fois par GPS update ──
  // Sans useMemo → recalculé à chaque re-render (scroll, tap, animation...)
  // Avec useMemo → recalculé UNIQUEMENT quand userLoc change
  const agencies: Agency[] = useMemo(() => {
    const bankStatus = checkBankOpen();
    return RAW_AGENCIES.map(a => {
      const cfg = TYPE_CONFIG[a.type];
      const isOpen = cfg.alwaysOpen ? true : bankStatus.isOpen;
      const closeTime = cfg.alwaysOpen ? '24h/24' : bankStatus.closeTime;
      const distKm = userLoc ? haversine(userLoc.lat, userLoc.lng, a.lat, a.lng) : undefined;
      return { ...a, isOpen, closeTime, distKm, distLabel: distKm !== undefined ? fmtDist(distKm) : undefined };
    });
  }, [userLoc]);

  // ── useMemo : filtrage/tri — recalculé uniquement si filtre/recherche change ──
  const filtered = useMemo(() => agencies
    .filter(a => {
      const mt = filterType==='all' || a.type===filterType;
      const ms = filterStatus==='all' || (filterStatus==='open'&&a.isOpen) || (filterStatus==='closed'&&!a.isOpen);
      const q = search.toLowerCase();
      const mq = !q || a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q);
      return mt && ms && mq;
    })
    .sort((a,b) => sortBy==='dist' ? (a.distKm??99999)-(b.distKm??99999) : a.name.localeCompare(b.name)),
  [agencies, filterType, filterStatus, search, sortBy]);

  // ── GPS ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        } else {
          toastRef.current?.show('GPS non autorisé — Tunis par défaut', colors.orange);
          setUserLoc({ lat: 36.8190, lng: 10.1658 });
        }
      } catch {
        setUserLoc({ lat: 36.8190, lng: 10.1658 });
      } finally {
        setLoading(false);
        toastRef.current?.show(`✅ 207 agences Attijari Bank 🇹🇳`, colors.green);
      }
    })();
  }, []);

  const selectAgency = (a: Agency) => {
    setSelected(a);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    Animated.spring(cardAnim,{toValue:1,friction:7,useNativeDriver:true}).start();
    setActiveTab('map');
    setTimeout(()=>{
      mapRef.current?.animateToRegion({ latitude:a.lat, longitude:a.lng, latitudeDelta:0.008, longitudeDelta:0.008 },600);
    },200);
  };

  const closeCard = () => {
    Animated.timing(cardAnim,{toValue:0,duration:200,useNativeDriver:true}).start(()=>setSelected(null));
  };

  const openItinerary = async (a: Agency) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(()=>{});
    const url = Platform.select({
      ios:     `maps://?daddr=${a.lat},${a.lng}&q=${encodeURIComponent(a.name)}&dirflg=d`,
      android: `google.navigation:q=${a.lat},${a.lng}&mode=d`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`,
    })!;
    const can = await Linking.canOpenURL(url).catch(()=>false);
    Linking.openURL(can ? url : `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`);
    completeStep(5);
    toastRef.current?.show(`🧭 Itinéraire vers ${a.name}`, colors.green);
  };

  const callAgency = (phone: string) => {
    if (!phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    Linking.openURL(`tel:${phone.replace(/\s/g,'')}`);
  };

  const darkStyle = isDark ? [
    {elementType:'geometry',stylers:[{color:'#1a1712'}]},
    {elementType:'labels.text.fill',stylers:[{color:'#888'}]},
    {featureType:'road',elementType:'geometry',stylers:[{color:'#2a2720'}]},
    {featureType:'water',elementType:'geometry',stylers:[{color:'#0d1117'}]},
  ] : [];

  const renderItem = ({ item:a }: { item:Agency }) => {
    const cfg = TYPE_CONFIG[a.type];
    const typeColor = (colors as any)[cfg.bgKey] || colors.bgDark2;
    return (
      <TouchableOpacity
        style={[S.agCard,{backgroundColor:colors.bgCard,borderColor:selected?.id===a.id?colors.gold:colors.border}]}
        onPress={()=>selectAgency(a)} activeOpacity={0.8}
      >
        <View style={[S.agIcon,{backgroundColor:typeColor}]}>
          <Text style={{fontSize:22}}>{cfg.emoji}</Text>
        </View>
        <View style={{flex:1}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <View style={{flexDirection:'row',gap:5,alignItems:'center',flexWrap:'wrap'}}>
              <View style={[S.typeBadge,{backgroundColor:typeColor}]}>
                <Text style={[S.typeTxt,{color:cfg.color}]}>{cfg.label}</Text>
              </View>
              <View style={[S.statusBadge,{backgroundColor:a.isOpen?colors.greenBg:colors.redBg}]}>
                <Text style={[S.statusTxt,{color:a.isOpen?colors.green:colors.red}]}>
                  {a.isOpen?'🟢 Ouvert':'🔴 Fermé'}
                </Text>
              </View>
            </View>
            {a.distLabel&&<Text style={[S.distTxt,{color:colors.gold}]}>{a.distLabel}</Text>}
          </View>
          <Text style={[S.agName,{color:colors.textPri}]} numberOfLines={1}>{a.name}</Text>
          <Text style={[S.agAddr,{color:colors.textMuted}]} numberOfLines={1}>{a.address}</Text>
          {a.closeTime?(
            <Text style={[S.agHours,{color:a.isOpen?colors.orange:colors.textMuted}]}>
              {cfg.alwaysOpen?'🕐 24h/24':a.isOpen?`Ferme à ${a.closeTime}`:'Fermé · ouvre lundi'}
            </Text>
          ):null}
          {a.phone?<Text style={[S.agPhone,{color:colors.blue}]} numberOfLines={1}>{a.phone}</Text>:null}
        </View>
        <View style={S.agActions}>
          <TouchableOpacity style={[S.agBtn,{backgroundColor:colors.gold}]} onPress={()=>openItinerary(a)}>
            <Text style={{fontSize:16}}>🧭</Text>
          </TouchableOpacity>
          {a.phone?(
            <TouchableOpacity style={[S.agBtn,{backgroundColor:colors.greenLight}]} onPress={()=>callAgency(a.phone)}>
              <Text style={{fontSize:16}}>📞</Text>
            </TouchableOpacity>
          ):null}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Modal Centre de Relation Client ─────────────────
  const ContactModal = () => (
    <Modal visible={showContact} transparent animationType="slide" onRequestClose={()=>setShowContact(false)}>
      <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={()=>setShowContact(false)}>
        <TouchableOpacity activeOpacity={1} style={[S.modalCard,{backgroundColor:colors.bgCard}]}>
          {/* Header */}
          <View style={[S.modalHeader,{borderBottomColor:colors.border}]}>
            <Text style={{fontSize:24}}>📞</Text>
            <View style={{flex:1}}>
              <Text style={[S.modalTitle,{color:colors.textPri}]}>Centre de Relation Client</Text>
              <Text style={[S.modalSub,{color:colors.textMuted}]}>Attijari Bank</Text>
            </View>
            <TouchableOpacity onPress={()=>setShowContact(false)}>
              <Text style={{color:colors.textMuted,fontSize:22}}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Numéro principal */}
          <TouchableOpacity
            style={[S.callBigBtn,{backgroundColor:colors.gold}]}
            onPress={()=>Linking.openURL('tel:71111300')}
          >
            <Text style={{fontSize:28}}>📞</Text>
            <View>
              <Text style={[S.callBigNum,{color:colors.bg}]}>71 111 300</Text>
              <Text style={[S.callBigSub,{color:colors.bg+'CC'}]}>Appel non surtaxé</Text>
            </View>
          </TouchableOpacity>

          {/* Depuis l'étranger */}
          <TouchableOpacity
            style={[S.callSmallBtn,{backgroundColor:colors.bgDark2,borderColor:colors.border}]}
            onPress={()=>Linking.openURL('tel:+21671111300')}
          >
            <Text style={{fontSize:16}}>🌍</Text>
            <Text style={[S.callSmallTxt,{color:colors.textPri}]}>+216 71 111 300 (depuis l'étranger)</Text>
          </TouchableOpacity>

          {/* Email */}
          <TouchableOpacity
            style={[S.callSmallBtn,{backgroundColor:colors.bgDark2,borderColor:colors.border}]}
            onPress={()=>Linking.openURL('mailto:relation.client@attijaribank.com.tn')}
          >
            <Text style={{fontSize:16}}>✉️</Text>
            <Text style={[S.callSmallTxt,{color:colors.blue}]}>relation.client@attijaribank.com.tn</Text>
          </TouchableOpacity>

          {/* Horaires */}
          <View style={[S.horaireBox,{backgroundColor:colors.bgDark2,borderColor:colors.border}]}>
            <Text style={[S.horaireTitle,{color:colors.textPri}]}>🕐 Horaires</Text>
            <Text style={[S.horaireLine,{color:colors.textMuted}]}>Lun–Ven : 8h–18h</Text>
            <Text style={[S.horaireLine,{color:colors.textMuted}]}>Samedi : 8h–13h</Text>
            <Text style={[S.horaireLine,{color:colors.textMuted}]}>Ramadan : Lun–Ven 8h–15h</Text>
          </View>

          {/* Services */}
          <View style={{gap:6,marginTop:8}}>
            {[
              'Suivre vos dossiers en cours',
              'Informations sur nos agences et horaires',
              'Fixer un RDV avec un chargé de clientèle',
              'Réclamations et suggestions',
            ].map((s,i)=>(
              <View key={i} style={{flexDirection:'row',gap:8,alignItems:'center'}}>
                <Text style={{color:colors.gold}}>✓</Text>
                <Text style={[{fontSize:12,color:colors.textMuted,flex:1}]}>{s}</Text>
              </View>
            ))}
          </View>

          {/* Médiateur */}
          <View style={[S.mediateurBox,{backgroundColor:colors.bgDark2,borderColor:colors.border}]}>
            <Text style={[S.horaireTitle,{color:colors.textPri}]}>⚖️ Médiateur</Text>
            <Text style={[S.horaireLine,{color:colors.textMuted}]}>M. Zoubeir Ben Jemaa</Text>
            <TouchableOpacity onPress={()=>Linking.openURL('tel:+21698270046')}>
              <Text style={[S.horaireLine,{color:colors.blue}]}>+216 98 270 046</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>Linking.openURL('mailto:zoubeirbenjemaa@gmail.com')}>
              <Text style={[S.horaireLine,{color:colors.blue}]}>zoubeirbenjemaa@gmail.com</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={[S.safe,{backgroundColor:colors.bg}]}>
      {/* Header */}
      <View style={[S.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={[S.back,{backgroundColor:colors.bgCard}]}>
          <Text style={{color:colors.textSec,fontSize:18}}>‹</Text>
        </TouchableOpacity>
        <AttijariLogo size={30}/>
        <View style={{flex:1}}>
          <Text style={[S.hTitle,{color:colors.textPri}]}>Attijari Bank</Text>
          <Text style={[S.hSub,{color:colors.textMuted}]}>
            {loading?'Localisation...':`${filtered.length} / 207 agences`}
          </Text>
        </View>
        {/* Tabs */}
        <View style={[S.tabRow,{backgroundColor:colors.bgCard}]}>
          <TouchableOpacity style={[S.tabBtn,activeTab==='list'&&{backgroundColor:colors.gold}]} onPress={()=>setActiveTab('list')}>
            <Text style={[S.tabTxt,{color:activeTab==='list'?colors.bg:colors.textMuted}]}>☰</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.tabBtn,activeTab==='map'&&{backgroundColor:colors.gold}]} onPress={()=>setActiveTab('map')}>
            <Text style={[S.tabTxt,{color:activeTab==='map'?colors.bg:colors.textMuted}]}>🗺</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recherche */}
      <View style={[S.searchBar,{backgroundColor:colors.bgCard,borderBottomColor:colors.border}]}>
        <TextInput
          style={[S.searchInp,{backgroundColor:colors.bgDark2,color:colors.textPri,borderColor:colors.border}]}
          placeholder="🔍 Rechercher agence, ville, adresse..."
          placeholderTextColor={colors.textMuted}
          value={search} onChangeText={setSearch}
        />
      </View>

      {/* Filtres */}
      <View style={[S.filterBar,{backgroundColor:colors.bgCard,borderBottomColor:colors.border}]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
          {([
            {k:'all',    l:'Tous'},
            {k:'branch', l:'🏦 Agences'},
            {k:'lsb',    l:'🏧 Libre-Service'},
            {k:'ca',     l:'🏢 Centres'},
            {k:'dam',    l:'💸 DAR Macharii'},
            {k:'box',    l:'✈️ Aéroport'},
          ] as const).map(f=>(
            <TouchableOpacity key={f.k}
              style={[S.fChip,{
                backgroundColor:filterType===f.k?colors.gold:colors.bgDark2,
                borderColor:filterType===f.k?colors.gold:colors.border
              }]}
              onPress={()=>setFilterType(f.k)}>
              <Text style={[S.fChipTxt,{color:filterType===f.k?colors.bg:colors.textMuted}]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
          <View style={[S.sep,{backgroundColor:colors.border}]}/>
          {([
            {k:'all',l:'Tous statuts',c:'gold'},
            {k:'open',l:'🟢 Ouvert',c:'green'},
            {k:'closed',l:'🔴 Fermé',c:'red'},
          ] as const).map(f=>(
            <TouchableOpacity key={f.k}
              style={[S.fChip,{
                backgroundColor:filterStatus===f.k?(colors as any)[f.c]+'22':colors.bgDark2,
                borderColor:filterStatus===f.k?(colors as any)[f.c]:colors.border,
              }]}
              onPress={()=>setFilterStatus(f.k)}>
              <Text style={[S.fChipTxt,{color:filterStatus===f.k?(colors as any)[f.c]:colors.textMuted}]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
          <View style={[S.sep,{backgroundColor:colors.border}]}/>
          <TouchableOpacity
            style={[S.fChip,{backgroundColor:colors.bgDark2,borderColor:showSort?colors.gold:colors.border}]}
            onPress={()=>setShowSort(s=>!s)}>
            <Text style={[S.fChipTxt,{color:colors.textSec}]}>Trier: {sortBy==='dist'?'Distance':'Nom'} ▾</Text>
          </TouchableOpacity>
        </ScrollView>
        {showSort&&(
          <View style={[S.sortDrop,{backgroundColor:colors.bgCard,borderColor:colors.border}]}>
            <TouchableOpacity style={[S.sortItem,sortBy==='dist'&&{backgroundColor:colors.gold+'22'}]}
              onPress={()=>{setSortBy('dist');setShowSort(false);}}>
              <Text style={[S.sortTxt,{color:sortBy==='dist'?colors.gold:colors.textPri}]}>📍 Distance (plus proche)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.sortItem,sortBy==='name'&&{backgroundColor:colors.gold+'22'}]}
              onPress={()=>{setSortBy('name');setShowSort(false);}}>
              <Text style={[S.sortTxt,{color:sortBy==='name'?colors.gold:colors.textPri}]}>🔤 Nom (A→Z)</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Contenu */}
      <View style={{flex:1}}>
        {loading&&(
          <View style={[S.loadWrap,{backgroundColor:colors.bg}]}>
            <ActivityIndicator size="large" color={colors.gold}/>
            <Text style={[S.loadTxt,{color:colors.textPri}]}>Localisation GPS...</Text>
            <Text style={[S.loadSub,{color:colors.textMuted}]}>207 agences Attijari Bank 🇹🇳</Text>
          </View>
        )}

        {!loading&&activeTab==='list'&&(
          filtered.length===0?(
            <View style={S.empty}>
              <Text style={{fontSize:40}}>🔍</Text>
              <Text style={[S.emptyTxt,{color:colors.textMuted}]}>Aucune agence trouvée</Text>
              <TouchableOpacity onPress={()=>{setSearch('');setFilterType('all');setFilterStatus('all');}}>
                <Text style={{color:colors.gold,fontSize:12,marginTop:8}}>Réinitialiser les filtres</Text>
              </TouchableOpacity>
            </View>
          ):(
            <FlatList
              data={filtered}
              keyExtractor={a=>a.id}
              renderItem={renderItem}
              contentContainerStyle={S.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Text style={[S.secLbl,{color:colors.textMuted}]}>
                  {filtered.length} résultat{filtered.length>1?'s':''} · {sortBy==='dist'?'par distance':'par nom'}
                </Text>
              }
            />
          )
        )}

        {!loading&&activeTab==='map'&&(
          Platform.OS==='web'?(
            <View style={[S.loadWrap,{backgroundColor:colors.bg}]}>
              <Text style={{fontSize:40}}>📱</Text>
              <Text style={[S.loadTxt,{color:colors.textPri}]}>Carte disponible sur mobile</Text>
              <TouchableOpacity style={[S.switchBtn,{backgroundColor:colors.gold}]} onPress={()=>setActiveTab('list')}>
                <Text style={{color:colors.bg,fontWeight:'700',fontSize:13}}>☰ Voir la liste</Text>
              </TouchableOpacity>
            </View>
          ):(
            <View style={{flex:1}}>
              <MapView
                ref={mapRef} style={S.map}
                provider={Platform.OS==='android'?PROVIDER_GOOGLE:PROVIDER_DEFAULT}
                initialRegion={{
                  latitude:userLoc?.lat??36.8190, longitude:userLoc?.lng??10.1658,
                  latitudeDelta:0.1, longitudeDelta:0.1,
                }}
                showsUserLocation showsMyLocationButton={false} showsCompass
                customMapStyle={darkStyle}
                onPress={()=>selected&&closeCard()}
              >
                {filtered.map(a=>(
                  <Marker key={a.id} coordinate={{latitude:a.lat,longitude:a.lng}}
                    onPress={()=>selectAgency(a)} anchor={{x:0.5,y:1}} tracksViewChanges={false}>
                    <AttijariPin type={a.type} selected={selected?.id===a.id}/>
                  </Marker>
                ))}
              </MapView>
              <TouchableOpacity
                style={[S.myLocBtn,{backgroundColor:colors.bgCard,borderColor:colors.border}]}
                onPress={()=>userLoc&&mapRef.current?.animateToRegion({latitude:userLoc.lat,longitude:userLoc.lng,latitudeDelta:0.06,longitudeDelta:0.06},600)}
              >
                <Text style={{fontSize:20}}>📍</Text>
              </TouchableOpacity>
              {selected&&(
                <Animated.View style={[
                  S.selCard,{backgroundColor:colors.bgCard,borderTopColor:colors.gold},
                  {transform:[{translateY:cardAnim.interpolate({inputRange:[0,1],outputRange:[200,0]})}]},
                ]}>
                  {(() => {
                    const cfg = TYPE_CONFIG[selected.type];
                    const typeColor = (colors as any)[cfg.bgKey] || colors.bgDark2;
                    return (
                      <>
                        <View style={[S.selStatusBadge,{backgroundColor:selected.isOpen?colors.greenBg:colors.redBg,alignSelf:'flex-end'}]}>
                          <Text style={[S.statusTxt,{color:selected.isOpen?colors.green:colors.red}]}>
                            {selected.isOpen?'🟢 Ouvert':'🔴 Fermé'}
                          </Text>
                        </View>
                        <View style={{flexDirection:'row',gap:12,alignItems:'flex-start',marginTop:8}}>
                          <View style={[S.selIcon,{backgroundColor:typeColor}]}>
                            <Text style={{fontSize:24}}>{cfg.emoji}</Text>
                          </View>
                          <View style={{flex:1}}>
                            <Text style={[S.selName,{color:colors.textPri}]} numberOfLines={2}>{selected.name}</Text>
                            <Text style={[S.selAddr,{color:colors.textMuted}]} numberOfLines={1}>{selected.address}</Text>
                            {selected.distLabel&&<Text style={[S.selDist,{color:colors.gold}]}>📍 {selected.distLabel}</Text>}
                            {selected.closeTime&&(
                              <Text style={[S.selHours,{color:selected.isOpen?colors.orange:colors.textMuted}]}>
                                🕐 {cfg.alwaysOpen?'24h/24':selected.isOpen?`Ferme à ${selected.closeTime}`:'Fermé'}
                              </Text>
                            )}
                            {selected.phone&&<Text style={[S.selPhone,{color:colors.blue}]}>{selected.phone}</Text>}
                            {selected.email&&<Text style={[S.selPhone,{color:colors.textMuted}]} numberOfLines={1}>{selected.email}</Text>}
                          </View>
                          <TouchableOpacity onPress={closeCard} style={S.closeBtn}>
                            <Text style={{color:colors.textMuted,fontSize:22}}>×</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={S.selActions}>
                          <TouchableOpacity style={[S.selBtn,{backgroundColor:colors.gold}]} onPress={()=>openItinerary(selected)}>
                            <Text style={{fontSize:18}}>🧭</Text>
                            <Text style={[S.selBtnTxt,{color:colors.bg}]}>Itinéraire</Text>
                          </TouchableOpacity>
                          {selected.phone?(
                            <TouchableOpacity style={[S.selBtn,{backgroundColor:colors.greenLight}]} onPress={()=>callAgency(selected.phone)}>
                              <Text style={{fontSize:18}}>📞</Text>
                              <Text style={[S.selBtnTxt,{color:colors.green}]}>Appeler</Text>
                            </TouchableOpacity>
                          ):null}
                          <TouchableOpacity style={[S.selBtn,{backgroundColor:colors.bgDark2,flex:0.6}]}
                            onPress={()=>Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`)}>
                            <Text style={{fontSize:18}}>🌍</Text>
                            <Text style={[S.selBtnTxt,{color:colors.textSec}]}>Maps</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    );
                  })()}
                </Animated.View>
              )}
            </View>
          )
        )}
      </View>

      <ContactModal/>
      <Toast ref={toastRef}/>
    </SafeAreaView>
  );
};

const S = StyleSheet.create({
  safe:           {flex:1},
  header:         {flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:10,borderBottomWidth:0.5},
  back:           {width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center'},
  hTitle:         {fontSize:13,fontWeight:'700'},
  hSub:           {fontSize:9},
  crcBtn:         {width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
  tabRow:         {flexDirection:'row',borderRadius:8,padding:2,gap:2},
  tabBtn:         {width:32,height:28,borderRadius:6,alignItems:'center',justifyContent:'center'},
  tabTxt:         {fontSize:14},
  searchBar:      {paddingHorizontal:12,paddingVertical:8,borderBottomWidth:0.5},
  searchInp:      {paddingHorizontal:12,paddingVertical:10,borderRadius:10,borderWidth:0.5,fontSize:13},
  filterBar:      {paddingVertical:8,borderBottomWidth:0.5,position:'relative'},
  filterScroll:   {paddingHorizontal:12,gap:6,alignItems:'center'},
  fChip:          {paddingHorizontal:12,paddingVertical:6,borderRadius:20,borderWidth:0.5,flexShrink:0},
  fChipTxt:       {fontSize:11,fontWeight:'600'},
  sep:            {width:1,height:20,marginHorizontal:4},
  sortDrop:       {position:'absolute',top:46,right:12,borderRadius:10,borderWidth:0.5,zIndex:100,minWidth:200,overflow:'hidden'},
  sortItem:       {padding:12},
  sortTxt:        {fontSize:13,fontWeight:'500'},
  loadWrap:       {flex:1,alignItems:'center',justifyContent:'center',gap:12},
  loadTxt:        {fontSize:14,fontWeight:'600'},
  loadSub:        {fontSize:11},
  switchBtn:      {paddingVertical:12,paddingHorizontal:24,borderRadius:12,marginTop:8},
  listContent:    {padding:12,gap:8,paddingBottom:30},
  secLbl:         {fontSize:11,marginBottom:4},
  empty:          {flex:1,alignItems:'center',justifyContent:'center',gap:8,paddingTop:60},
  emptyTxt:       {fontSize:14},
  agCard:         {flexDirection:'row',gap:10,padding:12,borderRadius:16,borderWidth:0.5,alignItems:'flex-start'},
  agIcon:         {width:46,height:46,borderRadius:12,alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2},
  typeBadge:      {paddingHorizontal:7,paddingVertical:2,borderRadius:6},
  typeTxt:        {fontSize:9,fontWeight:'700'},
  statusBadge:    {paddingHorizontal:7,paddingVertical:2,borderRadius:6},
  statusTxt:      {fontSize:9,fontWeight:'700'},
  distTxt:        {fontSize:11,fontWeight:'700'},
  agName:         {fontSize:13,fontWeight:'700',marginTop:4},
  agAddr:         {fontSize:10,marginTop:1},
  agHours:        {fontSize:10,marginTop:2},
  agPhone:        {fontSize:10,marginTop:2},
  agActions:      {gap:6,justifyContent:'center',paddingTop:2},
  agBtn:          {width:36,height:36,borderRadius:10,alignItems:'center',justifyContent:'center'},
  map:            {flex:1},
  myLocBtn:       {position:'absolute',top:12,right:12,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',borderWidth:0.5},
  selCard:        {position:'absolute',bottom:0,left:0,right:0,padding:16,borderTopLeftRadius:20,borderTopRightRadius:20,borderTopWidth:2},
  selStatusBadge: {paddingHorizontal:10,paddingVertical:3,borderRadius:8},
  selIcon:        {width:50,height:50,borderRadius:14,alignItems:'center',justifyContent:'center',flexShrink:0},
  selName:        {fontSize:14,fontWeight:'700'},
  selAddr:        {fontSize:11,marginTop:2},
  selDist:        {fontSize:12,fontWeight:'600',marginTop:2},
  selHours:       {fontSize:11,marginTop:2},
  selPhone:       {fontSize:11,marginTop:2},
  closeBtn:       {padding:4},
  selActions:     {flexDirection:'row',gap:8,marginTop:12},
  selBtn:         {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:12,borderRadius:12},
  selBtnTxt:      {fontSize:12,fontWeight:'700'},
  // Modal
  modalOverlay:   {flex:1,backgroundColor:'#00000088',justifyContent:'flex-end'},
  modalCard:      {borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,maxHeight:'85%'},
  modalHeader:    {flexDirection:'row',alignItems:'center',gap:10,paddingBottom:16,marginBottom:16,borderBottomWidth:0.5},
  modalTitle:     {fontSize:15,fontWeight:'700'},
  modalSub:       {fontSize:11},
  callBigBtn:     {flexDirection:'row',alignItems:'center',gap:16,padding:18,borderRadius:16,marginBottom:10},
  callBigNum:     {fontSize:22,fontWeight:'800'},
  callBigSub:     {fontSize:11},
  callSmallBtn:   {flexDirection:'row',alignItems:'center',gap:10,padding:14,borderRadius:12,borderWidth:0.5,marginBottom:8},
  callSmallTxt:   {fontSize:13,fontWeight:'500'},
  horaireBox:     {padding:12,borderRadius:12,borderWidth:0.5,marginTop:8,gap:4},
  horaireTitle:   {fontSize:13,fontWeight:'700',marginBottom:4},
  horaireLine:    {fontSize:12},
  mediateurBox:   {padding:12,borderRadius:12,borderWidth:0.5,marginTop:8,gap:4},
});