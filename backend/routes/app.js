const express = require('express');

const router = express.Router();

router.get('/version', (req, res) => {
  const latestVersion = process.env.LATEST_APP_VERSION || '2.0.6';
  const minSupportedVersion = process.env.MIN_SUPPORTED_APP_VERSION || '2.0.6';

  const latestVersionCodeRaw = process.env.LATEST_APP_VERSION_CODE;
  const minSupportedVersionCodeRaw = process.env.MIN_SUPPORTED_APP_VERSION_CODE;

  const latestVersionCode = Number.isFinite(Number(latestVersionCodeRaw))
    ? Number(latestVersionCodeRaw)
    : 10;

  const minSupportedVersionCode = Number.isFinite(Number(minSupportedVersionCodeRaw))
    ? Number(minSupportedVersionCodeRaw)
    : latestVersionCode;

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
    checkedAt: new Date().toISOString(),
  });
});

module.exports = router;
