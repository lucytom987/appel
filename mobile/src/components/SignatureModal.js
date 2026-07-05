import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen from 'react-native-signature-canvas';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SecureStore from 'expo-secure-store';
import ms from '../utils/scale';

/**
 * Full-screen signature modal for work order signing.
 *
 * Props:
 *  - visible: boolean
 *  - signerName: string (serviser name, auto-filled)
 *  - customerName: string (stranka name from elevator data)
 *  - onConfirm: ({ servicerSignature, customerSignature, customerAbsent }) => void
 *  - onCancel: () => void
 *  - loading: boolean
 */
export default function SignatureModal({
  visible,
  signerName = '',
  signerId = '',
  customerName = '',
  onConfirm,
  onCancel,
  loading = false,
}) {
  const insets = useSafeAreaInsets();
  const servicerSigRef = useRef(null);
  const customerSigRef = useRef(null);

  const [step, setStep] = useState('servicer'); // 'servicer' | 'customer' | 'absent'
  const [servicerSignature, setServicerSignature] = useState(null);
  const [customerSignature, setCustomerSignature] = useState(null);
  const [orientationReady, setOrientationReady] = useState(false);
  const [signatureInitLoading, setSignatureInitLoading] = useState(false);
  const [hasDrawnServicer, setHasDrawnServicer] = useState(false);
  const [hasDrawnCustomer, setHasDrawnCustomer] = useState(false);
  const [editingServicerSignature, setEditingServicerSignature] = useState(false);

  const getSignatureStorageKey = () => {
    const raw = String(signerId || signerName || '').trim().toLowerCase();
    return `servicer_signature_${raw || 'default'}`;
  };

  const resetState = () => {
    setStep('servicer');
    setServicerSignature(null);
    setCustomerSignature(null);
    setHasDrawnServicer(false);
    setHasDrawnCustomer(false);
    setEditingServicerSignature(false);
  };

  const handleCancel = () => {
    resetState();
    onCancel?.();
  };

  const handleServicerDone = () => {
    servicerSigRef.current?.readSignature();
  };

  const handleServicerSignature = (signature) => {
    if (signature) {
      setServicerSignature(signature);
      SecureStore.setItemAsync(getSignatureStorageKey(), signature).catch(() => {});
      setHasDrawnServicer(false);
      setEditingServicerSignature(false);
      setStep('customer');
    }
  };

  const handleCustomerDone = () => {
    customerSigRef.current?.readSignature();
  };

  const handleCustomerSignature = (signature) => {
    if (signature) {
      setCustomerSignature(signature);
      setHasDrawnCustomer(false);
      onConfirm?.({
        servicerSignature,
        customerSignature: signature,
        customerAbsent: false,
      });
      resetState();
    }
  };

  const handleCustomerAbsent = () => {
    onConfirm?.({
      servicerSignature,
      customerSignature: null,
      customerAbsent: true,
    });
    resetState();
  };

  const handleClearServicer = () => {
    servicerSigRef.current?.clearSignature();
    setHasDrawnServicer(false);
  };

  const handleClearCustomer = () => {
    customerSigRef.current?.clearSignature();
    setHasDrawnCustomer(false);
  };

  // Lock to landscape when modal opens and wait a moment before mounting canvas.
  // This avoids intermittent 90deg touch/canvas mismatch on some Android devices.
  useEffect(() => {
    let mounted = true;

    const applyOrientation = async () => {
      try {
        if (visible) {
          setOrientationReady(false);
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          setTimeout(() => {
            if (mounted) setOrientationReady(true);
          }, 180);
        } else {
          setOrientationReady(false);
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (e) {
        if (mounted) setOrientationReady(true);
      }
    };

    applyOrientation();

    return () => {
      mounted = false;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible]);

  useEffect(() => {
    let mounted = true;

    const loadCachedServicerSignature = async () => {
      if (!visible) return;
      setSignatureInitLoading(true);
      try {
        const stored = await SecureStore.getItemAsync(getSignatureStorageKey());
        if (!mounted) return;
        if (stored) {
          setServicerSignature(stored);
          setStep('servicer');
          setHasDrawnServicer(false);
          setHasDrawnCustomer(false);
          setEditingServicerSignature(false);
        } else {
          setServicerSignature(null);
          setStep('servicer');
          setHasDrawnServicer(false);
          setHasDrawnCustomer(false);
          setEditingServicerSignature(true);
        }
      } catch (e) {
        if (mounted) {
          setServicerSignature(null);
          setStep('servicer');
          setHasDrawnServicer(false);
          setHasDrawnCustomer(false);
          setEditingServicerSignature(true);
        }
      } finally {
        if (mounted) setSignatureInitLoading(false);
      }
    };

    loadCachedServicerSignature();

    return () => {
      mounted = false;
    };
  }, [visible, signerId, signerName]);

  const webStyle = `.m-signature-pad {
    box-shadow: none;
    border: none;
    margin: 0;
    width: 100%;
    height: 100%;
  }
  .m-signature-pad--body {
    border: none;
    margin: 0;
  }
  .m-signature-pad--footer { display: none; }
  body, html {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
  }`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <StatusBar hidden />

        {/* Signature area */}
        {loading || signatureInitLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>{loading ? 'Potpisujem i šaljem radni nalog...' : 'Pripremam potpis...'}</Text>
          </View>
        ) : !orientationReady ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Pripremam površinu za potpis...</Text>
          </View>
        ) : (
          <>
            <View style={[styles.signatureBox, { marginRight: ms(6) + (insets.right || 0) }]}>
              <TouchableOpacity style={styles.inlineCloseBtn} onPress={handleCancel}>
                <Ionicons name="close" size={20} color="#0f172a" />
              </TouchableOpacity>

              {step === 'servicer' && editingServicerSignature && !hasDrawnServicer ? (
                <View pointerEvents="none" style={styles.signatureWatermarkWrap}>
                  <Text style={styles.signatureWatermarkText}>SERVISER</Text>
                </View>
              ) : null}
              {step === 'customer' && !hasDrawnCustomer ? (
                <View pointerEvents="none" style={styles.signatureWatermarkWrap}>
                  <Text style={styles.signatureWatermarkText}>STRANKA</Text>
                </View>
              ) : null}

              {step === 'servicer' && !editingServicerSignature && servicerSignature ? (
                <View style={styles.signaturePreviewWrap}>
                  <Image source={{ uri: servicerSignature }} resizeMode="contain" style={styles.signaturePreviewImage} />
                </View>
              ) : null}

              {step === 'servicer' && editingServicerSignature && (
                <SignatureScreen
                  key={`servicer-${visible ? 'open' : 'closed'}-${orientationReady ? 'ready' : 'wait'}`}
                  ref={servicerSigRef}
                  onOK={handleServicerSignature}
                  onBegin={() => setHasDrawnServicer(true)}
                  onClear={() => setHasDrawnServicer(false)}
                  onEmpty={() => {}}
                  webStyle={webStyle}
                  backgroundColor="#fff"
                  penColor="#0f172a"
                  minWidth={1.5}
                  maxWidth={3}
                  dotSize={2}
                  rotated={false}
                  webviewProps={{
                    cacheEnabled: false,
                    androidLayerType: 'hardware',
                    overScrollMode: 'never',
                    bounces: false,
                  }}
                  trimWhitespace
                  imageType="image/png"
                />
              )}
              {step === 'customer' && (
                <SignatureScreen
                  key={`customer-${visible ? 'open' : 'closed'}-${orientationReady ? 'ready' : 'wait'}`}
                  ref={customerSigRef}
                  onOK={handleCustomerSignature}
                  onBegin={() => setHasDrawnCustomer(true)}
                  onClear={() => setHasDrawnCustomer(false)}
                  onEmpty={() => {}}
                  webStyle={webStyle}
                  backgroundColor="#fff"
                  penColor="#0f172a"
                  minWidth={1.5}
                  maxWidth={3}
                  dotSize={2}
                  rotated={false}
                  webviewProps={{
                    cacheEnabled: false,
                    androidLayerType: 'hardware',
                    overScrollMode: 'never',
                    bounces: false,
                  }}
                  trimWhitespace
                  imageType="image/png"
                />
              )}
            </View>

            {/* Actions */}
            <View style={[styles.actions, { paddingRight: ms(8) + (insets.right || 0) }]}> 
              {step === 'servicer' && !editingServicerSignature && servicerSignature ? (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setEditingServicerSignature(true);
                    setHasDrawnServicer(false);
                  }}
                >
                  <Ionicons name="create-outline" size={18} color="#64748b" />
                  <Text style={styles.clearBtnText}>Editiraj</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={step === 'servicer' ? handleClearServicer : handleClearCustomer}
                >
                  <Ionicons name="refresh-outline" size={18} color="#64748b" />
                  <Text style={styles.clearBtnText}>Obriši</Text>
                </TouchableOpacity>
              )}

              {step === 'customer' && (
                <TouchableOpacity style={styles.absentBtn} onPress={handleCustomerAbsent}>
                  <Ionicons name="person-remove-outline" size={18} color="#f59e0b" />
                  <Text style={styles.absentBtnText}>Stranka nije prisutna</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={() => {
                  if (step === 'servicer') {
                    if (!editingServicerSignature && servicerSignature) {
                      setStep('customer');
                      return;
                    }
                    handleServicerDone();
                    return;
                  }
                  handleCustomerDone();
                }}
              >
                <Ionicons name={step === 'servicer' ? 'arrow-forward' : 'checkmark-done'} size={20} color="#fff" />
                <Text style={styles.confirmBtnText}>
                  {step === 'servicer' ? 'Dalje' : 'Potpiši i pošalji'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(16),
  },
  loadingText: {
    fontSize: ms(15),
    color: '#94a3b8',
    fontWeight: '600',
  },
  signatureBox: {
    flex: 1,
    marginHorizontal: ms(6),
    marginTop: ms(4),
    marginBottom: ms(6),
    borderRadius: ms(10),
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  inlineCloseBtn: {
    position: 'absolute',
    top: ms(8),
    left: ms(8),
    width: ms(32),
    height: ms(32),
    borderRadius: ms(16),
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  signaturePreviewWrap: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signaturePreviewImage: {
    width: '96%',
    height: '92%',
  },
  signatureWatermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  signatureWatermarkText: {
    fontSize: ms(42),
    fontWeight: '900',
    letterSpacing: 2,
    color: 'rgba(15,23,42,0.13)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ms(8),
    paddingBottom: ms(8),
    gap: ms(10),
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    borderRadius: ms(10),
    backgroundColor: '#1e293b',
  },
  clearBtnText: {
    fontSize: ms(13),
    color: '#94a3b8',
    fontWeight: '600',
  },
  absentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    borderRadius: ms(10),
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  absentBtnText: {
    fontSize: ms(13),
    color: '#f59e0b',
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    paddingVertical: ms(14),
    borderRadius: ms(12),
    backgroundColor: '#2563eb',
  },
  confirmBtnText: {
    fontSize: ms(15),
    color: '#fff',
    fontWeight: '700',
  },
});
