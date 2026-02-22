/**
 * Babel configuration for React Native
 * Includes Reanimated plugin for worklets support
 */

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'react-native-worklets-core/plugin',
    // Reanimated plugin must be listed last
    [
      'react-native-reanimated/plugin',
      {
        globals: ['__detectCard'],
      },
    ],
  ],
};
