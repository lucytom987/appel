import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

// Cloudinary konfiguracija
const CLOUDINARY_CONFIG = {
  cloudName: 'djclcndpa',
  uploadPreset: 'unsigned',
  uploadUrl: 'https://api.cloudinary.com/v1_1/djclcndpa/image/upload'
};

// Target veličina: ~300KB (0.3MB)
const TARGET_SIZE_KB = 300;
const TARGET_SIZE_BYTES = TARGET_SIZE_KB * 1024;

export const usePhotoUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Kompresira sliku na ciljanu veličinu
   * @param {string} imageUri - URI originalne slike
   * @param {object} meta - width/height ako su dostupni
   * @returns {Promise<{uri: string, size: number}>}
   */
  const compressImage = useCallback(async (imageUri, meta = {}) => {
    try {
      let quality = 1.0;
      let width = typeof meta.width === 'number' ? meta.width : 0;
      let height = typeof meta.height === 'number' ? meta.height : 0;
      const maxDim = 2400;
      let compressed;

      const getFileSize = async (uri) => {
        try {
          const info = await FileSystem.getInfoAsync(uri, { size: true });
          return info?.size || 0;
        } catch (e) {
          return 0;
        }
      };

      const originalSize = await getFileSize(imageUri);

      if (width > 0 && height > 0) {
        const maxSide = Math.max(width, height);
        if (maxSide > maxDim) {
          const scale = maxDim / maxSide;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
      } else {
        width = 1600;
        height = 1200;
      }

      if (originalSize > 0 && originalSize <= TARGET_SIZE_BYTES) {
        return { uri: imageUri, size: originalSize };
      }

      // Iterativna kompresija - smanjuj kvalitetu dok ne dođeš do ciljane veličine
      while (quality >= 0.6) {
        compressed = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width, height } }],
          { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
        );

        const sizeInBytes = compressed?.uri ? await getFileSize(compressed.uri) : 0;

        // Ako je dovoljno mala, stop
        if (sizeInBytes && sizeInBytes <= TARGET_SIZE_BYTES * 1.1) {
          // Dozvoli 10% tolerancije
          return {
            uri: compressed.uri,
            size: sizeInBytes
          };
        }

        // Ako ne možemo očitati veličinu, nemoj dodatno degradirati kvalitetu
        if (!sizeInBytes) {
          return {
            uri: compressed.uri,
            size: 0
          };
        }

        // Inače, smanjuj kvalitetu
        quality -= 0.1;

        // Ako je i dalje previše velika, smanjuj rezoluciju
        if (quality <= 0.7) {
          width = Math.floor(width * 0.85);
          height = Math.floor(height * 0.85);
        }
      }

      const lastSize = compressed?.uri ? await getFileSize(compressed.uri) : 0;
      return {
        uri: compressed?.uri || imageUri,
        size: lastSize || originalSize || TARGET_SIZE_BYTES
      };
    } catch (err) {
      console.error('❌ Greška pri kompresiji slike:', err);
      throw new Error(`Kompresija neuspješna: ${err.message}`);
    }
  }, []);

  /**
   * Osnovna validacija slike prije uploadiranja
   * @param {object} result - Rezultat iz ImagePicker
   * @returns {boolean}
   */
  const validateImage = useCallback((result) => {
    if (!result || !result.assets || result.assets.length === 0) {
      setError('Nije odabrana slika');
      return false;
    }

    const asset = result.assets[0];
    const maxSizeBytes = 2 * 1024 * 1024; // 2MB max

    if (asset.fileSize && asset.fileSize > maxSizeBytes) {
      setError('Slika je prevelika (max 2MB)');
      return false;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (asset.mimeType && !validTypes.includes(asset.mimeType)) {
      setError('Samo JPEG, PNG i WebP su dozvoljeni');
      return false;
    }

    return true;
  }, []);

  /**
   * Uploadira kompresiranu sliku na Cloudinary
   * @param {string} compressedUri - URI kompresiranih slike
   * @param {string} mimeType - MIME tip (npr. 'image/jpeg')
   * @returns {Promise<{url: string, size: number, mime: string, createdAt: string}>}
   */
  const uploadToCloudinary = useCallback(async (compressedUri, mimeType) => {
    try {
      const formData = new FormData();

      // Spremi datoteku
      formData.append('file', {
        uri: compressedUri,
        type: mimeType || 'image/jpeg',
        name: `photo_${Date.now()}.jpg`
      });

      // Dodaj unsigned preset
      formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

      console.log('📤 Upload na Cloudinary...');

      const response = await fetch(CLOUDINARY_CONFIG.uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json'
        }
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        data = null;
      }

      if (!response.ok) {
        const cloudMsg = data?.error?.message || response.statusText || 'Neuspješan upload';
        throw new Error(`HTTP ${response.status}: ${cloudMsg}`);
      }

      if (!data || !data.secure_url) {
        throw new Error('Cloudinary nije vratio URL');
      }

      return {
        url: data.secure_url,
        size: data.bytes || 0,
        mime: data.format ? `image/${data.format}` : mimeType || 'image/jpeg',
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('❌ Greška pri uploadu na Cloudinary:', err);
      throw new Error(`Upload neuspješan: ${err.message}`);
    }
  }, []);

  /**
   * Glavna funkcija za odabiranje i uploadiranje slike
   * @returns {Promise<{url: string, size: number, mime: string, createdAt: string}|null>}
   */
  const pickAndUploadPhoto = useCallback(async () => {
    setError(null);
    setUploading(true);

    try {
      // Provjeri dozvole
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Dozvola za pristup galerijji nije odobrena');
      }

      // Otvori galeriju
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1
      });

      // Provjeri rezultat
      if (!validateImage(result)) {
        return null;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';

      console.log('📥 Slika odabrana:', {
        width: asset.width,
        height: asset.height,
        mimeType
      });

      // Kompresiraj
      const compressed = await compressImage(asset.uri, { width: asset.width, height: asset.height });
      console.log('✅ Kompresija gotova:', {
        originalUri: asset.uri,
        compressedUri: compressed.uri,
        compressedSize: `${(compressed.size / 1024).toFixed(2)}KB`
      });

      // Uploadiraj na Cloudinary
      const uploadResult = await uploadToCloudinary(compressed.uri, mimeType);

      console.log('✅ Upload gotov:', uploadResult.url);
      setUploading(false);

      return uploadResult;
    } catch (err) {
      console.error('❌ Greška u pick/upload:', err);
      setError(err.message);
      setUploading(false);
      return null;
    }
  }, [compressImage, validateImage, uploadToCloudinary]);

  /**
   * Alternativa: Koristi kameru umjesto galerije
   * @returns {Promise<{url: string, size: number, mime: string, createdAt: string}|null>}
   */
  const takePhotoWithCamera = useCallback(async () => {
    setError(null);
    setUploading(true);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Dozvola za pristup kameri nije odobrena');
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 1
      });

      if (!validateImage(result)) {
        return null;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';

      const compressed = await compressImage(asset.uri, { width: asset.width, height: asset.height });
      const uploadResult = await uploadToCloudinary(compressed.uri, mimeType);

      console.log('✅ Foto snimljena i uploadana:', uploadResult.url);
      setUploading(false);

      return uploadResult;
    } catch (err) {
      console.error('❌ Greška u kameri:', err);
      setError(err.message);
      setUploading(false);
      return null;
    }
  }, [compressImage, validateImage, uploadToCloudinary]);

  return {
    pickAndUploadPhoto,
    takePhotoWithCamera,
    uploading,
    error,
    clearError: () => setError(null)
  };
};
