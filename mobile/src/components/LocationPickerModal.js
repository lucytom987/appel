import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

export default function LocationPickerModal({ visible, onClose, onSelectLocation, initialLocation }) {
  const [selectedLocation, setSelectedLocation] = useState(initialLocation || null);
  const [region, setRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  useEffect(() => {
    if (visible) {
      initializeLocation();
    }
  }, [visible]);

  const initializeLocation = async () => {
    setLoading(true);
    
    try {
      // Ako postoji inizijalna lokacija, centrirati mapu na nju
      if (initialLocation && initialLocation.latitude && initialLocation.longitude) {
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

  const centerOnSelected = () => {
    if (selectedLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
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
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Odaberi lokaciju</Text>
          <TouchableOpacity 
            onPress={handleConfirm}
            disabled={!selectedLocation}
            style={!selectedLocation && styles.disabledButton}
          >
            <Text style={[styles.confirmText, !selectedLocation && styles.disabledText]}>
              Potvrdi
            </Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Ionicons name="information-circle" size={20} color="#2563eb" />
          <Text style={styles.instructionsText}>
            Tapni na kartu da označi lokaciju
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
            onPress={handleMapPress}
            showsUserLocation={true}
            showsMyLocationButton={false}
          >
            {selectedLocation && (
              <Marker
                coordinate={selectedLocation}
                draggable
                onDragEnd={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.marker}>
                    <Ionicons name="location" size={32} color="#ef4444" />
                  </View>
                  <View style={styles.markerArrow} />
                </View>
              </Marker>
            )}
          </MapView>
        )}

        {/* Selected coordinates display */}
        {selectedLocation && (
          <View style={styles.coordinatesDisplay}>
            <View style={styles.coordinateRow}>
              <Text style={styles.coordinateLabel}>Širina:</Text>
              <Text style={styles.coordinateValue}>
                {selectedLocation.latitude.toFixed(6)}
              </Text>
            </View>
            <View style={styles.coordinateRow}>
              <Text style={styles.coordinateLabel}>Dužina:</Text>
              <Text style={styles.coordinateValue}>
                {selectedLocation.longitude.toFixed(6)}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.centerButton}
              onPress={centerOnSelected}
            >
              <Ionicons name="locate" size={20} color="#2563eb" />
            </TouchableOpacity>
          </View>
        )}
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
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
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
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  disabledButton: {
    opacity: 0.3,
  },
  disabledText: {
    color: '#9ca3af',
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
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
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
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -2,
  },
  coordinatesDisplay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  coordinateRow: {
    flex: 1,
  },
  coordinateLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  coordinateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  centerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
