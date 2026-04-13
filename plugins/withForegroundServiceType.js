const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];
    if (!application.service) application.service = [];
    const existing = application.service.find(
      s => s.$?.['android:name'] === 'com.asterinet.react.bgactions.RNBackgroundActionsTask'
    );
    if (existing) {
      existing.$['android:foregroundServiceType'] = 'connectedDevice';
    } else {
      application.service.push({
        $: {
          'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask',
          'android:foregroundServiceType': 'connectedDevice',
        }
      });
    }
    return config;
  });
};
