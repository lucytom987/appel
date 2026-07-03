const APP_VARIANT = process.env.APP_VARIANT || 'production';
const isStaging = APP_VARIANT === 'staging';

module.exports = ({ config }) => ({
  ...config,
  expo: {
    name: isStaging ? "APPEL TEST" : "APPEL",
    slug: "mobile",
    version: "2.0.8",
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      buildNumber: "11",
      bundleIdentifier: isStaging ? "com.appel.elevators.staging" : "hr.appel.elevators",
    },
    android: {
      versionCode: 12,
      package: isStaging ? "com.appel.elevators.staging" : "hr.appel.elevators",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || "",
        },
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-font",
      [
        "expo-screen-orientation",
        { "initialOrientation": "PORTRAIT" }
      ],
    ],
    extra: {
      eas: {
        projectId: "0d60b61b-9b5e-4b73-96b1-c9199484a26b",
      },
      appVariant: APP_VARIANT,
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || "",
    },
  },
});