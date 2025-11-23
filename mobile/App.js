import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation/Navigation';
import { initDatabase, cleanupOrphans } from './src/database/db';

export default function App() {
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

  return (
    <AuthProvider>
      <Navigation />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
