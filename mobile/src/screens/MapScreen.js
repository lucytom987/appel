import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { elevatorDB, serviceDB } from '../database/db';

export default function MapScreen({ navigation }) {
  const [elevators, setElevators] = useState([]);
  const [servicedThisMonth, setServicedThisMonth] = useState(new Set());
  const [userLocation, setUserLocation] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [loadingElevators, setLoadingElevators] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedElevator, setSelectedElevator] = useState(null); // Prvi tap prikaz kartice
  const mapRef = useRef(null);
  const didCenterInitial = useRef(false);

  const parseDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const normalizeElevatorId = (raw) => {
    if (typeof raw === 'object' && raw !== null) return raw._id || raw.id;
    return raw;
  };

  const getServicedIdsForCurrentMonth = () => {
    try {
      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();
      const services = serviceDB.getAll?.() || [];
      const set = new Set();

      services.forEach((s) => {
        const d = parseDate(s.datum || s.serviceDate);
        if (!d) return;
        if (d.getMonth() !== month || d.getFullYear() !== year) return;
        const eid = normalizeElevatorId(s.elevatorId);
        if (eid) set.add(eid);
      });

      return set;
    } catch (err) {
      console.log('⚠️ Servisi za kartu nisu dostupni:', err?.message);
      return new Set();
    }
  };

  const getMarkerColors = (status) => {
    if (status === 'serviced') return { bubble: '#16a34a', arrow: '#16a34a' };
    if (status === 'inactive') return { bubble: '#9ca3af', arrow: '#9ca3af' };
    return { bubble: '#ef4444', arrow: '#ef4444' }; // not serviced
  };

  const sameCoord = (a, b) => {
    if (!a || !b) return false;
    return (
      Math.abs(a.latitude - b.latitude) < 1e-6 &&
      Math.abs(a.longitude - b.longitude) < 1e-6
    );
  };

  // Inicijalno: traži permisije + paralelno pokreni dohvat lokacije i elevatore
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setPermissionGranted(false);
            setLoadingLocation(false);
            setLoadingElevators(false);
            setErrorMsg('GPS pristup onemogućen');
          }
          return;
        }
        if (cancelled) return;
        setPermissionGranted(true);

        // Brzi last-known za instant centar
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (!cancelled && last) {
            setUserLocation({ latitude: last.coords.latitude, longitude: last.coords.longitude });
            setLoadingLocation(false); // imamo nešto
          }
        } catch {}

        // Preciznija trenutna (ne blokira prikaz karte)
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then(loc => {
            if (!cancelled && loc) {
              setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
              setLoadingLocation(false);
            }
          })
          .catch(err => {
            console.log('⚠️ Lokacija nije dostupna:', err.message);
            if (!cancelled) setLoadingLocation(false);
          });

        // Elevatori paralelno
        setTimeout(() => {
          try {
            const servicedSet = getServicedIdsForCurrentMonth();
            const allElevators = elevatorDB.getAll();
            const elevatorsWithGPS = allElevators.filter(e => {
              if (!e.koordinate) return false;
              if (Array.isArray(e.koordinate)) {
                return e.koordinate[0] !== 0 && e.koordinate[1] !== 0;
              } else if (typeof e.koordinate === 'object') {
                return e.koordinate.latitude !== 0 && e.koordinate.longitude !== 0;
              }
              return false;
            }).map(e => {
              let coords;
              if (Array.isArray(e.koordinate)) {
                coords = { latitude: e.koordinate[0], longitude: e.koordinate[1] };
              } else {
                coords = e.koordinate;
              }
              return { ...e, koordinate: coords };
            });
            if (!cancelled) {
              setServicedThisMonth(servicedSet);
              setElevators(elevatorsWithGPS);
            }
          } catch (e) {
            console.log('⚠️ Greška elevatori:', e.message);
          } finally {
            if (!cancelled) setLoadingElevators(false);
          }
        }, 0); // yield UI
      } catch (error) {
        console.error('Greška init karta:', error);
        if (!cancelled) {
          setErrorMsg('Greška pri inicijalizaciji karte');
          setLoadingLocation(false);
          setLoadingElevators(false);
        }
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Retry handler (permission + reload) used by the 'Pokušaj ponovno' button
  const loadData = async () => {
    // Reset states
    setErrorMsg(null);
    setLoadingLocation(true);
    setLoadingElevators(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionGranted(false);
        setLoadingLocation(false);
        setLoadingElevators(false);
        setErrorMsg('GPS pristup onemogućen');
        return;
      }
      setPermissionGranted(true);

      // Last known first
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setUserLocation({ latitude: last.coords.latitude, longitude: last.coords.longitude });
        }
      } catch {}

      // Current precise (non-blocking)
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(loc => {
          if (loc) {
            setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
          setLoadingLocation(false);
        })
        .catch(() => setLoadingLocation(false));

      // Elevators
      try {
        const servicedSet = getServicedIdsForCurrentMonth();
        const allElevators = elevatorDB.getAll();
        const elevatorsWithGPS = allElevators.filter(e => {
          if (!e.koordinate) return false;
          if (Array.isArray(e.koordinate)) {
            return e.koordinate[0] !== 0 && e.koordinate[1] !== 0;
          } else if (typeof e.koordinate === 'object') {
            return e.koordinate.latitude !== 0 && e.koordinate.longitude !== 0;
          }
          return false;
        }).map(e => {
          let coords;
          if (Array.isArray(e.koordinate)) {
            coords = { latitude: e.koordinate[0], longitude: e.koordinate[1] };
          } else {
            coords = e.koordinate;
          }
          return { ...e, koordinate: coords };
        });
        setServicedThisMonth(servicedSet);
        setElevators(elevatorsWithGPS);
      } catch (e) {
        setErrorMsg('Greška pri dohvaćanju dizala');
      } finally {
        setLoadingElevators(false);
      }
    } catch (err) {
      setErrorMsg('Neočekivana greška pri ponovnom učitavanju');
      setLoadingLocation(false);
      setLoadingElevators(false);
    }
  };

  const handleMarkerPress = (elevator) => {
    const coord = elevator?.koordinate;
    const groupAtLocation = elevators.filter((e) => sameCoord(e.koordinate, coord));

    // Ako je već odabrana lokacija (bilo koji iz grupe), otvori detalje za prvi (bilo koji) iz grupe
    if (selectedElevator && sameCoord(selectedElevator.koordinate, coord)) {
      const target = groupAtLocation[0] || elevator;
      navigation.navigate('ElevatorDetails', { elevator: target });
      return;
    }

    // Inače postavi selekciju (prvi iz grupe, ili kliknuti)
    setSelectedElevator(groupAtLocation[0] || elevator);
  };

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.0025,
      }, 1000);
    }
  };

  // Auto-centar pri prvom dobivanju lokacije
  useEffect(() => {
    if (userLocation && mapRef.current && !didCenterInitial.current) {
      didCenterInitial.current = true;
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.0025,
      }, 800);
    }
  }, [userLocation]);

  const fitAllMarkers = () => {
    if (elevators.length === 0 || !mapRef.current) return;

    const coordinates = elevators.map(e => ({
      latitude: e.koordinate.latitude,
      longitude: e.koordinate.longitude,
    }));

    if (userLocation) {
      coordinates.push(userLocation);
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
      animated: true,
    });
  };

  // Nema više full-screen loading; kartu prikazujemo čim je permisija poznata

  if (!permissionGranted) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Karta dizala</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>GPS pristup potreban</Text>
          <Text style={styles.emptyText}>
            Omogući pristup lokaciji u postavkama za prikaz karte.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Pokušaj ponovno</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const initialRegion = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : elevators.length > 0
    ? {
        latitude: elevators[0].koordinate.latitude,
        longitude: elevators[0].koordinate.longitude,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }
    : {
        latitude: 45.815,
        longitude: 15.9819, // Zagreb default
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Karta dizala</Text>
          <Text style={styles.headerSubtitle}>{elevators.length} dizala</Text>
        </View>
        <TouchableOpacity onPress={fitAllMarkers}>
          <Ionicons name="expand-outline" size={24} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        googleMapsApiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY}
        showsUserLocation={true}
        showsMyLocationButton={false}
      >
        {/* Elevator markers */}
        {elevators.map((elevator) => {
          const elevatorId = elevator.id || elevator._id;
          const markerStatus = elevator.status === 'neaktivan'
            ? 'inactive'
            : (servicedThisMonth.has(elevatorId) ? 'serviced' : 'notServiced');
          const markerColors = getMarkerColors(markerStatus);

          return (
            <Marker
              key={elevatorId}
              coordinate={{
                latitude: elevator.koordinate.latitude,
                longitude: elevator.koordinate.longitude,
              }}
              title={elevator.nazivStranke}
              description={`${elevator.ulica}, ${elevator.mjesto}`}
              onPress={() => handleMarkerPress(elevator)}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerBubble, { backgroundColor: markerColors.bubble }]}> 
                  <Ionicons name="business" size={20} color="#fff" />
                </View>
                <View style={[styles.markerArrow, { borderTopColor: markerColors.arrow }]} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Overlay indikatori */}
      {(loadingLocation || loadingElevators) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          {loadingLocation && (
            <View style={styles.overlayItem}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.overlayText}>Lokacija...</Text>
            </View>
          )}
          {loadingElevators && (
            <View style={styles.overlayItem}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.overlayText}>Dizala...</Text>
            </View>
          )}
        </View>
      )}

      {/* Floating buttons */}
      <View style={styles.fabContainer}>
        {userLocation && (
          <TouchableOpacity style={styles.fab} onPress={centerOnUser}>
            <Ionicons name="locate" size={24} color="#2563eb" />
          </TouchableOpacity>
        )}
      </View>

      {/* Info bar */}
      {elevators.length === 0 && (
        <View style={styles.infoBar}>
          <Ionicons name="information-circle" size={20} color="#f59e0b" />
          <Text style={styles.infoText}>
            Nema dizala s GPS koordinatama
          </Text>
        </View>
      )}

      {/* Brzi prikaz ulazne šifre i adrese */}
      {selectedElevator && (
        <View style={styles.quickCard}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setSelectedElevator(null)}
          >
            <Ionicons name="close-circle" size={24} color="#9ca3af" />
          </TouchableOpacity>

          <View style={styles.quickInfoSection}>
            <Ionicons name="location" size={28} color="#2563eb" />
            <Text style={styles.quickAddressBig}>
              {(selectedElevator.ulica || '') + (selectedElevator.mjesto ? ', ' + selectedElevator.mjesto : '')}
            </Text>
          </View>

          <View style={styles.quickDivider} />

          <View style={styles.quickInfoSection}>
            <Ionicons name="key" size={28} color="#10b981" />
            <View style={styles.quickCodeBox}>
              <Text style={styles.quickCodeLabel}>Ulazna šifra</Text>
              <Text style={styles.quickCodeValue}>
                {selectedElevator.kontaktOsoba?.ulaznaKoda || '—'}
              </Text>
            </View>
          </View>

          <Text style={styles.quickHintBig}>Tapni ponovo za sve detalje</Text>
        </View>
      )}
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
    zIndex: 10,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  markerContainer: {
    alignItems: 'center',
  },
  markerBubble: {
    backgroundColor: '#2563eb',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#2563eb',
    marginTop: -2,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  infoBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 90,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 4,
  },
  overlayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overlayText: {
    fontSize: 12,
    color: '#1f2937',
    fontWeight: '500',
  },
  quickCard: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    gap: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  quickInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickAddressBig: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    lineHeight: 24,
  },
  quickDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
  },
  quickCodeBox: {
    flex: 1,
  },
  quickCodeLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  quickCodeValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: 2,
  },
  quickHintBig: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

