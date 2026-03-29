import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen from 'react-native-signature-canvas';
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
  customerName = '',
  onConfirm,
  onCancel,
  loading = false,
}) {
  const servicerSigRef = useRef(null);
  const customerSigRef = useRef(null);

  const [step, setStep] = useState('servicer'); // 'servicer' | 'customer' | 'absent'
  const [servicerSignature, setServicerSignature] = useState(null);
  const [customerSignature, setCustomerSignature] = useState(null);

  const resetState = () => {
    setStep('servicer');
    setServicerSignature(null);
    setCustomerSignature(null);
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
      setStep('customer');
    }
  };

  const handleCustomerDone = () => {
    customerSigRef.current?.readSignature();
  };

  const handleCustomerSignature = (signature) => {
    if (signature) {
      setCustomerSignature(signature);
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
  };

  const handleClearCustomer = () => {
    customerSigRef.current?.clearSignature();
  };

  const handleBack = () => {
    if (step === 'customer') {
      setStep('servicer');
      setCustomerSignature(null);
    }
  };

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
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

        {/* Header */}
        <View style={styles.header}>
          {step === 'customer' ? (
            <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.headerBtn} onPress={handleCancel}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {step === 'servicer' ? 'Potpis servisera' : 'Potpis stranke'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {step === 'servicer'
                ? `Korak 1/2 — ${signerName}`
                : `Korak 2/2 — ${customerName || 'Stranka'}`}
            </Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepLine, step === 'customer' && styles.stepLineActive]} />
          <View style={[styles.stepDot, step === 'customer' && styles.stepDotActive]} />
        </View>

        {/* Signature area */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Potpisujem i šaljem radni nalog...</Text>
          </View>
        ) : (
          <>
            <View style={styles.signatureInfo}>
              <Ionicons name="finger-print-outline" size={20} color="#64748b" />
              <Text style={styles.signatureInfoText}>
                Potpišite se prstom u označenom prostoru
              </Text>
            </View>

            <View style={styles.signatureBox}>
              {step === 'servicer' && (
                <SignatureScreen
                  ref={servicerSigRef}
                  onOK={handleServicerSignature}
                  onEmpty={() => {}}
                  webStyle={webStyle}
                  backgroundColor="#fff"
                  penColor="#0f172a"
                  minWidth={1.5}
                  maxWidth={3}
                  dotSize={2}
                  trimWhitespace
                  imageType="image/png"
                />
              )}
              {step === 'customer' && (
                <SignatureScreen
                  ref={customerSigRef}
                  onOK={handleCustomerSignature}
                  onEmpty={() => {}}
                  webStyle={webStyle}
                  backgroundColor="#fff"
                  penColor="#0f172a"
                  minWidth={1.5}
                  maxWidth={3}
                  dotSize={2}
                  trimWhitespace
                  imageType="image/png"
                />
              )}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={step === 'servicer' ? handleClearServicer : handleClearCustomer}
              >
                <Ionicons name="refresh-outline" size={18} color="#64748b" />
                <Text style={styles.clearBtnText}>Obriši</Text>
              </TouchableOpacity>

              {step === 'customer' && (
                <TouchableOpacity style={styles.absentBtn} onPress={handleCustomerAbsent}>
                  <Ionicons name="person-remove-outline" size={18} color="#f59e0b" />
                  <Text style={styles.absentBtnText}>Stranka nije prisutna</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={step === 'servicer' ? handleServicerDone : handleCustomerDone}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ms(16),
    paddingTop: ms(8),
    paddingBottom: ms(10),
  },
  headerBtn: {
    width: ms(40),
    height: ms(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: ms(18),
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: ms(13),
    color: '#94a3b8',
    marginTop: ms(2),
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: ms(12),
    gap: ms(4),
  },
  stepDot: {
    width: ms(10),
    height: ms(10),
    borderRadius: ms(5),
    backgroundColor: '#334155',
  },
  stepDotActive: {
    backgroundColor: '#2563eb',
  },
  stepLine: {
    width: ms(40),
    height: ms(3),
    backgroundColor: '#334155',
    borderRadius: ms(2),
  },
  stepLineActive: {
    backgroundColor: '#2563eb',
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
  signatureInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    paddingVertical: ms(8),
  },
  signatureInfoText: {
    fontSize: ms(13),
    color: '#64748b',
  },
  signatureBox: {
    flex: 1,
    marginHorizontal: ms(16),
    marginBottom: ms(8),
    borderRadius: ms(16),
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#334155',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ms(16),
    paddingBottom: ms(16),
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
