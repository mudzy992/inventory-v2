const { withGradleProperties } = require('expo/config-plugins');

/** Keep the Android APK arm64-only so EAS builds stay small and fast. */
const withArm64Only = (config) =>
  withGradleProperties(config, (modConfig) => {
    const next = modConfig.modResults.filter((item) => item.key !== 'reactNativeArchitectures');
    next.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a' });
    modConfig.modResults = next;
    return modConfig;
  });

module.exports = withArm64Only;
