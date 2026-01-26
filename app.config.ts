import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Budgetly",
  slug: "ghost-savings-app",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",

  // ✅ IMPORTANT: Disable New Architecture to avoid launch-crashes with some native libs (e.g., Plaid)
  newArchEnabled: false,

  icon: "./assets/images/icon.png",
  scheme: "budgetly",

  ios: {
    bundleIdentifier: "com.charlesbattle.budgetly",
    supportsTablet: true,
    // buildNumber intentionally omitted:
    // iOS native project + EAS remote versioning control this
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: "com.charlesbattle.budgetly",
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },

  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },

  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: { backgroundColor: "#000000" },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    eas: {
      projectId: "57b13db5-aed1-40ef-8b2f-a9c38df02da6",
    },
  },
};

export default config;
