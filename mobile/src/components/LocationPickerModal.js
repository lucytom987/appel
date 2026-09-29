import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

export default function LocationPickerModal({ visible, onClose, onSelectLocation, initialLocation }) {
  const insets = useSafeAreaInsets();
  const [selectedLocation, setSelectedLocation] = useState(initialLocation || null);
  const [region, setRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    if (visible) {
      initializeLocation();
    }
  }, [visible]);

  const initializeLocation = async () => {
    setLoading(true);
    const hasInitialLocation = Boolean(initialLocation?.latitude && initialLocation?.longitude);
    setSelectedLocation(hasInitialLocation ? initialLocation : null);
    
    try {
      // Ako postoji inizijalna lokacija, centrirati mapu na nju
      if (hasInitialLocation) {
        setRegion({
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
        setSelectedLocation(initialLocation);
      } else {
        // Inače, pokušaj dobiti trenutnu lokaciju korisnika
        const { status } = await Location.getForegroundPermissionsAsync();
        
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          
          const userLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          
          setRegion({
            ...userLocation,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          });
          setSelectedLocation(userLocation);
        } else {
          // Default lokacija (Hrvatska - Zagreb)
          const defaultLocation = {
            latitude: 45.815,
            longitude: 15.982,
          };
          
          setRegion({
            ...defaultLocation,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          });
        }
      }
    } catch (error) {
      console.error('Greška pri inicijalizaciji lokacije:', error);
      // Fallback na Zagreb
      setRegion({
        latitude: 45.815,
        longitude: 15.982,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = (event) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation(coordinate);
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onSelectLocation(selectedLocation);
      onClose();
    }
  };

  const selectCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS pristup potreban', 'Omogućite pristup lokaciji kako biste odabrali svoju trenutnu poziciju.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const currentLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setSelectedLocation(currentLocation);
      setRegion({
        ...currentLocation,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
      mapRef.current?.animateToRegion({
        ...currentLocation,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 700);
    } catch (error) {
      console.error('Greška pri dohvaćanju trenutne lokacije:', error);
      Alert.alert('Lokacija nije dostupna', 'Nije moguće dohvatiti trenutnu GPS lokaciju. Pokušajte ponovno ili označite lokaciju na karti.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerIconButton}>
            <Ionicons name="close" size={28} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Odaberi lokaciju</Text>
          <View style={styles.headerIconButton} />
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Ionicons name="information-circle" size={20} color="#2563eb" />
          <Text style={styles.instructionsText}>
            Tapni na kartu ili odaberi svoju trenutnu lokaciju
          </Text>
        </View>

        {/* Map */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Učitavam kartu...</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={region}
            googleMapsApiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY}
            onPress={handleMapPress}
            showsUserLocation={true}
            showsMyLocationButton={false}
          >
            {selectedLocation && (
              <Marker
                coordinate={selectedLocation}
                draggable
                pinColor="#ef4444"
                onDragEnd={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
              />
            )}
          </MapView>
        )}

        <View style={[styles.locationActions, { bottom: Math.max(insets.bottom + 12, 24) }]}>
          <TouchableOpacity
            style={styles.locateButton}
            onPress={selectCurrentLocation}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Ionicons name="locate" size={22} color="#2563eb" />
            )}
            <Text style={styles.locateButtonText}>{locating ? 'Lociram...' : 'Moja lokacija'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, !selectedLocation && styles.disabledButton]}
            onPress={handleConfirm}
            disabled={!selectedLocation}
          >
            <Ionicons name="checkmark" size={22} color="#fff" />
            <Text style={styles.saveButtonText}>Spremi lokaciju</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.3,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 15,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  map: {
    flex: 1,
  },
  locationActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locateButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  locateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  saveButton: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
