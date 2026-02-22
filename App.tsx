/**
 * App.tsx
 * Main entry point for the React Native Card Detection app
 */

import React from 'react';
import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import CameraScreen from './src/screens/CameraScreen';
import type { CardDetectionResult } from './src/types/cardDetection';

/**
 * Main App component
 */
const App: React.FC = () => {
  /**
   * Handle card detection callback
   */
  const handleCardDetected = (result: CardDetectionResult) => {
    console.log('Card detected:', {
      isValid: result.isValid,
      confidence: result.confidence,
      corners: result.corners,
    });
    
    // TODO: Implement your logic here
    // For example: vibrate, show capture button, etc.
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      <CameraScreen
        cameraPosition="back"
        enableTorch={false}
        onCardDetected={handleCardDetected}
        showDebugInfo={__DEV__} // Show debug info only in development
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default App;
