const express = require('express');

const router = express.Router();

const BUNDLED_LATEST_VERSION = '2.0.19';
const BUNDLED_MIN_SUPPORTED_VERSION = '2.0.19';
const BUNDLED_LATEST_VERSION_CODE = 23;
const BUNDLED_MIN_SUPPORTED_VERSION_CODE = 23;

const toVersionParts = (value) => String(value || '')
  .split('.')
  .map((part) => Number.parseInt(part, 10) || 0);

const compareVersion = (left, right) => {
  const a = toVersionParts(left);
  const b = toVersionParts(right);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
};

const pickNewestVersion = (envValue, bundledValue) => {
  if (!envValue) return bundledValue;
  return compareVersion(envValue, bundledValue) >= 0 ? envValue : bundledValue;
};

const pickHighestCode = (envValue, bundledValue) => {
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed)) return bundledValue;
  return Math.max(parsed, bundledValue);
};

router.get('/version', (req, res) => {
  const latestVersion = pickNewestVersion(process.env.LATEST_APP_VERSION, BUNDLED_LATEST_VERSION);
  const minSupportedVersion = pickNewestVersion(process.env.MIN_SUPPORTED_APP_VERSION, BUNDLED_MIN_SUPPORTED_VERSION);

  const latestVersionCodeRaw = process.env.LATEST_APP_VERSION_CODE;
  const minSupportedVersionCodeRaw = process.env.MIN_SUPPORTED_APP_VERSION_CODE;

  const latestVersionCode = pickHighestCode(latestVersionCodeRaw, BUNDLED_LATEST_VERSION_CODE);
  const minSupportedVersionCode = pickHighestCode(minSupportedVersionCodeRaw, BUNDLED_MIN_SUPPORTED_VERSION_CODE);

  const packageName = process.env.ANDROID_PACKAGE_NAME || 'hr.appel.elevators';
  const playStoreUrl = process.env.PLAY_STORE_URL
    || `https://play.google.com/store/apps/details?id=${packageName}`;

  res.json({
    latestVersion,
    minSupportedVersion,
    latestVersionCode,
    minSupportedVersionCode,
    playStoreUrl,
    packageName,
    source: 'env',
    checkedAt: new Date().toISOString(),
  });
});

module.exports = router;
