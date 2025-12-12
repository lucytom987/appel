import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation/Navigation';
import { initDatabase, cleanupOrphans } from './src/database/db';

const STARTUP_TIPS = [
  'Druže, disciplina danas – ponos sutra.',
  'Radimo čvrsto, mislimo široko.',
  'Zajedno smo jači od svake prepreke.',
  'Bratstvo i jedinstvo – svaki dan, na djelu.',
  'Ne odustajemo: plan je plan.',
  'Udarnički tempo, mirna glava.',
  'Drugovi, rezultat je najbolji govor.',
  'Tko radi pošteno, spava mirno.',
  'Naprijed hrabro – bez puno priče.',
  'Kolektiv nosi, pojedinac blista.',
  'Čvrsta ruka, toplo srce.',
  'Red, rad i drugarstvo.',
  'Današnji trud je sutrašnja pobjeda.',
  'Nema “ne mogu” – ima “kako ćemo”.',
  'Dogovor drži kuću, rad gradi budućnost.',
  'Mi ne kukamo – mi rješavamo.',
  'Drž’ se plana, druže majstore.',
  'Svaki dan malo više – i ide.',
  'Čestit rad nema zamjenu.',
  'Zajedno u smjenu, zajedno u uspjeh.',
  'Tko zna – uči druge. Tko ne zna – pita.',
  'Odgovornost nije teret, nego čast.',
  'Nema prečaca do kvalitete.',
  'Drugarski stisak ruke – i idemo dalje.',
  'Glava hladna, srce vatreno, ruke vrijedne.',
];

export default function App() {
  const [tip, setTip] = useState(null);
  const [showTip, setShowTip] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Inicijaliziraj bazu i očisti siročad servisa/popravaka bez dizala
    try {
      initDatabase();
      const result = cleanupOrphans();
      console.log(`🧹 Orphan cleanup done: services=${result.removedServices}, repairs=${result.removedRepairs}`);
    } catch (e) {
      console.log('⚠️ Orphan cleanup error:', e.message);
    }
  }, []);

  useEffect(() => {
    if (!STARTUP_TIPS.length) return;
    const randomIndex = Math.floor(Math.random() * STARTUP_TIPS.length);
    setTip(STARTUP_TIPS[randomIndex]);
    setShowTip(true);
    const timer = setTimeout(() => setShowTip(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismissTip = () => setShowTip(false);

  return (
    <AuthProvider>
      <Navigation />
      {showTip && tip ? (
        <TouchableOpacity
          onPress={handleDismissTip}
          activeOpacity={0.9}
          style={[styles.tipContainer, { bottom: (insets?.bottom || 0) + 16 }]}
        >
          <View style={styles.tipBubble}>
            <Text style={styles.tipText}>{tip}</Text>
            <Text style={styles.tipHint}>Dodirni za zatvaranje</Text>
          </View>
        </TouchableOpacity>
      ) : null}
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  tipContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 99,
  },
  tipBubble: {
    backgroundColor: '#7f1d1d',
    borderWidth: 1,
    borderColor: '#991b1b',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  tipText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  tipHint: {
    marginTop: 8,
    color: '#fde8e8',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
