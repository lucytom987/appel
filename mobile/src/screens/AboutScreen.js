import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function AboutScreen({ navigation }) {
  const currentVersion = '1.2.1';
  const currentBuild = '5';
  const [versionTapCount, setVersionTapCount] = React.useState(0);

  const handleVersionPress = () => {
    const next = versionTapCount + 1;
    if (next >= 5) {
      setVersionTapCount(0);
      Linking.openURL('https://www.pornhub.com').catch(() => {});
    } else {
      setVersionTapCount(next);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>O aplikaciji</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* App Info */}
        <View style={styles.appInfoCard}>
          <View style={styles.appIconContainer}>
            <Ionicons name="cube" size={48} color="#2563eb" />
          </View>
          <Text style={styles.appName}>APPEL</Text>
          <Text style={styles.appTagline}>Aplikacija za upravljanje dizalima</Text>
          <TouchableOpacity onPress={handleVersionPress} activeOpacity={0.8} style={styles.versionBadge}>
            <Text style={styles.versionText}>
              v{currentVersion} • Build {currentBuild}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O aplikaciji</Text>
          <Text style={styles.description}>
            APPEL je mobilna aplikacija za upravljanje dizalima, servisima i hitnim popravcima.
            Offline-first pristup omogućuje rad bez mreže, a sinkronizacija se izvršava čim je
            veza dostupna. Fokus je na brzom logiranju intervencija, preglednim listama i
            pouzdanom prikazu lokacija na karti.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Glavne značajke</Text>
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="cloud-offline" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Offline-first: svi unosi rade bez mreže, sinkronizacija kad je internet dostupan.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="construct" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Popravci: statusi (prijavljen/u tijeku/završen), potpis naloga, opis popravka, prijavio i kontakt.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="briefcase" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Servisi: checklist, povijest, filtriranje po mjesecima/godinama, kompaktan prikaz perioda.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="map" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Karta: grupirani markeri na istoj lokaciji, drugi tap otvara dizalo, prikaz lokacije i adrese.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="location" size={20} color="#2563eb" />
              <Text style={styles.featureText}>GPS i geocoding: dodjela koordinata iz adrese i map picker.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="people" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Korisnici i prava: prijava, offline demo token, lokalna baza korisnika, sigurni tokeni.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="refresh" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Sinkronizacija: auto-sync kad je online, queue za zahtjeve kad je server nedostupan.</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="phone-portrait" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Android optimizacije: SafeArea/KeyboardAvoiding, kompaktniji layouti, brže učitavanje liste i karte.</Text>
            </View>
          </View>
        </View>

        {/* Build History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trenutni status</Text>
          <Text style={styles.description}>
            Verzija v{currentVersion} (build {currentBuild}) — 12.12.2025.
            Fokus: dodatni serviseri na servisima (backend + UI), grupiranje servisiranih i neservisiranih po adresi uz stabilne ključeve,
            otvaranje detalja dizala iz liste neserv. i fix render greške, Android back na Home izlazi iz app.
          </Text>
        </View>

        {/* Version history */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Povijest verzija</Text>
          <View style={styles.versionList}>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.2.1 (build 5) • 12.12.2025</Text>
              <Text style={styles.versionNotes}>
                Dodatni serviseri (backend/model/rute + UI odabir kolega), grupiranje servisiranih i neservisiranih po adresi s stabilnim ID-jevima,
                tap na neservisirana otvara detalje dizala, fix render error u listi servisa, Android back na Home izlazak.
              </Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.2.0 (build 4) • 11.12.2025</Text>
              <Text style={styles.versionNotes}>
                Chat: badge nepročitanih i označavanje pročitanih, brisanje sobe briše i poruke, svi vide broj članova, uklonjen neispravan online indikator korisnika.
              </Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.1.0 (build 3) • 9.12.2025</Text>
              <Text style={styles.versionNotes}>
                Filtriranje obrisanih/duplikata u statistikama popravaka, blaži zoom pri lociranju na karti,
                back na popravke/home, nova lista dizala (adresa prva, header čip), pretraga po kontakt osobi.
              </Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.6 (build 7) • 22.11.2025</Text>
              <Text style={styles.versionNotes}>
                SafeArea/KeyboardAvoiding na glavnim ekranima, UX poboljšanja.
              </Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.5 (build 6) • 22.11.2025</Text>
              <Text style={styles.versionNotes}>
                Brza kartica na karti, optimizacija učitavanja karte i centriranja.
              </Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.4 (build 5) • 22.11.2025</Text>
              <Text style={styles.versionNotes}>
                Geocoding i map picker za dizala, GPS UI poboljšanja.
              </Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.3 (build 4) • 21.11.2025</Text>
              <Text style={styles.versionNotes}>Google Maps integracija i vizualizacija dizala.</Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.2 (build 3) • 21.11.2025</Text>
              <Text style={styles.versionNotes}>Checklist overhaul za servise.</Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.1 (build 2) • 20.11.2025</Text>
              <Text style={styles.versionNotes}>Password toggle fix, opcionalni broj ugovora.</Text>
            </View>
            <View style={styles.versionItem}>
              <Text style={styles.versionLabel}>v1.0.0 (build 1) • 20.11.2025</Text>
              <Text style={styles.versionNotes}>Inicijalni production build.</Text>
            </View>
          </View>
        </View>

        {/* Tech Stack */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tehnologije</Text>
          <View style={styles.techList}>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Framework:</Text>
              <Text style={styles.techValue}>React Native + Expo</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Baza podataka:</Text>
              <Text style={styles.techValue}>SQLite (offline-first cache)</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Karte:</Text>
              <Text style={styles.techValue}>Google Maps SDK + geocoding</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Platforma:</Text>
              <Text style={styles.techValue}>Android 7.0+</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Backend:</Text>
              <Text style={styles.techValue}>Node.js (Render) + REST API</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Sync/Queue:</Text>
              <Text style={styles.techValue}>Expo SecureStore tokeni, sync queue za offline zahtjeve</Text>
            </View>
          </View>
        </View>

        {/* Credits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Autor projekta</Text>
          <View style={styles.creditsCard}>
            <View style={styles.creditsHeader}>
              <Ionicons name="person-circle" size={48} color="#2563eb" />
              <View style={styles.creditsInfo}>
                <Text style={styles.creditsName}>Tomislav Vidaček</Text>
                <Text style={styles.creditsRole}>Made in Croatia</Text>
              </View>
            </View>
            <View style={styles.contactSection}>
              <Text style={styles.contactTitle}>Kontakt informacije:</Text>
              <View style={styles.contactItem}>
                <Ionicons name="mail" size={18} color="#2563eb" />
                <Text style={styles.contactText}>vidacek.tomek@gmail.com</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2025 APPEL • Elevator Management
          </Text>
          <Text style={styles.footerSubtext}>
            Prosinac 2025 • Android
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  appInfoCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  appTagline: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  versionBadge: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  versionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
  },
  versionList: {
    gap: 12,
  },
  versionItem: {
    gap: 4,
  },
  versionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  versionNotes: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#4b5563',
    flex: 1,
  },
  creditsCard: {
    backgroundColor: '#f9fafb',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  creditsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  creditsInfo: {
    flex: 1,
  },
  creditsName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  creditsRole: {
    fontSize: 13,
    color: '#6b7280',
  },
  creditsDescription: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 16,
  },
  contactSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  contactTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contactText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  techList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  techItem: {
    width: '48%',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  techLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 4,
  },
  techValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 11,
    color: '#9ca3af',
  },
});
