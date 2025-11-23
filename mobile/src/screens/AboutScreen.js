import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function AboutScreen({ navigation }) {
  const currentVersion = '1.0.6';
  const currentBuild = '7';

  const builds = [
    {
      build: '7',
      version: '1.0.6',
      date: '22. Studeni 2025',
      title: 'Poboljšanja korisničkog sučelja',
      features: [
        'SafeAreaView - sadržaj iznad navigacijskih tipki',
        'KeyboardAvoidingView - automatsko pomicanje kad se tipkovnica otvori',
        'Primijenjeno na sve glavne ekrane i forme',
      ],
    },
    {
      build: '6',
      version: '1.0.5',
      date: '22. Studeni 2025',
      title: 'UX optimizacije',
      features: [
        'Pojednostavljena brza kartica na karti (samo adresa i šifra)',
        'Optimizacija učitavanja karte (10-20s → 2-3s)',
        'Auto-centriranje na korisničku lokaciju',
        'Dva-koraka interakcija s markerima',
      ],
    },
    {
      build: '5',
      version: '1.0.4',
      date: '22. Studeni 2025',
      title: 'GPS koordinate',
      features: [
        'Geocoding - automatska GPS dodjela iz adrese',
        'Interaktivni map picker za odabir lokacije',
        'GPS management UI u formama',
      ],
    },
    {
      build: '4',
      version: '1.0.3',
      date: '21. Studeni 2025',
      title: 'Google Maps integracija',
      features: [
        'MapScreen - prikaz svih dizala na karti',
        'Trenutna lokacija korisnika',
        'Custom marker ikone',
        'Google Maps API konfiguracija',
      ],
    },
    {
      build: '3',
      version: '1.0.2',
      date: '21. Studeni 2025',
      title: 'Servisni checklist',
      features: [
        'Novi checklist s 7 stavki',
        'Podmazivanje, UPS, Govorna veza',
        'Čišćenje šahta, Pogonski stroj, Kočnica, Užeta',
      ],
    },
    {
      build: '2',
      version: '1.0.1',
      date: '20. Studeni 2025',
      title: 'Password field i opcionalni podaci',
      features: [
        'Password visibility toggle',
        'Opcionalni broj ugovora',
        'Bug fix: dupli eye icon',
      ],
    },
    {
      build: '1',
      version: '1.0.0',
      date: '20. Studeni 2025',
      title: 'Inicijalni production build',
      features: [
        'Lokalni Gradle build workflow',
        'Keystore generacija i signing',
        'Build optimizacije',
      ],
    },
  ];

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
          <Text style={styles.appTagline}>Elevator Management App</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>
              v{currentVersion} • Build {currentBuild}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O aplikaciji</Text>
          <Text style={styles.description}>
            APPEL je mobilna aplikacija za upravljanje dizalima, servisima i hitnim 
            popravcima. Aplikacija je razvijena kao offline-first rješenje s mogućnošću 
            sinkronizacije kada je dostupna internet veza.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Glavne značajke</Text>
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="cloud-offline" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Offline-first arhitektura</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="map" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Google Maps integracija</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="location" size={20} color="#2563eb" />
              <Text style={styles.featureText}>GPS koordinate i geocoding</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="lock-closed" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Sigurna autentifikacija</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="stats-chart" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Statistika i izvještaji</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="phone-portrait" size={20} color="#2563eb" />
              <Text style={styles.featureText}>Android optimizirano</Text>
            </View>
          </View>
        </View>

        {/* Build History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Povijest verzija</Text>
          {builds.map((build, index) => (
            <View key={build.build} style={styles.buildCard}>
              <View style={styles.buildHeader}>
                <View style={styles.buildBadge}>
                  <Text style={styles.buildNumber}>Build {build.build}</Text>
                </View>
                <Text style={styles.buildVersion}>v{build.version}</Text>
              </View>
              <Text style={styles.buildDate}>{build.date}</Text>
              <Text style={styles.buildTitle}>{build.title}</Text>
              <View style={styles.buildFeatures}>
                {build.features.map((feature, idx) => (
                  <View key={idx} style={styles.buildFeatureItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.buildFeatureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
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
              <Text style={styles.techValue}>SQLite</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Karte:</Text>
              <Text style={styles.techValue}>Google Maps</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techLabel}>Platforma:</Text>
              <Text style={styles.techValue}>Android 7.0+</Text>
            </View>
          </View>
        </View>

        {/* Credits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vlasnik projekta</Text>
          <View style={styles.creditsCard}>
            <View style={styles.creditsHeader}>
              <Ionicons name="person-circle" size={48} color="#2563eb" />
              <View style={styles.creditsInfo}>
                <Text style={styles.creditsName}>Tomislav Vidaček</Text>
                <Text style={styles.creditsRole}>Vlasnik projekta</Text>
              </View>
            </View>
            <Text style={styles.creditsDescription}>
              Sva prava i zasluge za razvoj APPEL aplikacije pripadaju Tomislavu Vidačeku.
            </Text>
            <View style={styles.contactSection}>
              <Text style={styles.contactTitle}>Kontakt informacije:</Text>
              <View style={styles.contactItem}>
                <Ionicons name="call" size={18} color="#2563eb" />
                <Text style={styles.contactText}>099 756 5305</Text>
              </View>
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
            Studeni 2025 • Android
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
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
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
  buildCard: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  buildHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  buildBadge: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  buildNumber: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  buildVersion: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  buildDate: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 8,
  },
  buildTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  buildFeatures: {
    gap: 4,
  },
  buildFeatureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  buildFeatureText: {
    fontSize: 13,
    color: '#4b5563',
    flex: 1,
    lineHeight: 18,
  },
  techList: {
    gap: 12,
  },
  techItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  techLabel: {
    fontSize: 14,
    color: '#6b7280',
    width: 120,
  },
  techValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
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
