const debug = process.env.ORDERFLOW_DEBUG === "1"

export default {
  name: "OrderFlow",
  slug: "orderflow",
  version: "0.1.0",
  scheme: debug ? "orderflow-dev" : "orderflow-it",
  userInterfaceStyle: "automatic",
  updates: { enabled: false },
  icon: "./assets/orderflow.png",
  android: {
    package: debug ? "com.orderflowmobile.app.dev" : "com.orderflowmobile.app.it",
    versionCode: 1,
    allowBackup: false,
    adaptiveIcon: { foregroundImage: "./assets/mark.png", backgroundColor: "#403B86" },
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
  },
  ios: {
    bundleIdentifier: debug ? "com.orderflowmobile.app.dev" : "com.orderflowmobile.app.it",
    buildNumber: "1",
    supportsTablet: true,
    ...(debug ? { infoPlist: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } } : {}),
  },
  plugins: [
    ["expo-splash-screen", { image: "./assets/mark.png", imageWidth: 140, backgroundColor: "#403B86" }],
    ["expo-dev-client", { launchMode: "most-recent" }],
    ["expo-secure-store", { configureAndroidBackup: false, faceIDPermission: false }],
    [
      "expo-camera",
      {
        cameraPermission: "Allow OrderFlow to scan item barcodes.",
        recordAudioAndroid: false,
        microphonePermission: false,
      },
    ],
    "expo-sqlite",
    "./tools/android-privacy.mjs",
  ],
}
