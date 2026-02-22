/**
 * index.js
 * Entry point for React Native application
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Register main app component
AppRegistry.registerComponent(appName, () => App);
