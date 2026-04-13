const { withAndroidManifest } = require('@expo/config-plugins');

// Add android:foregroundServiceType="connectedDevice" to the
// RNBackgroundActionsTask service declaration in AndroidManifest.xml.
// Required on Android 14+ for foreground services that use BLE.
module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    // Ensure the service array exists
    if (!app.service) {
      app.service = [];
    }

    const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

    // Find existing service declaration or create one
    let service = app.service.find(
      (s) => s.$?.['android:name'] === serviceName
    );

    if (!service) {
      service = { $: { 'android:name': serviceName } };
      app.service.push(service);
    }

    // Set the foreground service type
    service.$['android:foregroundServiceType'] = 'connectedDevice';

    return config;
  });
};
