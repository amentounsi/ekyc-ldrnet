/**
 * App.tsx
 * Main entry point for the React Native Card Detection app
 */

import React, { useState, useCallback } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View } from 'react-native';
import CameraScreen from './src/screens/CameraScreen';
import { WarpTestScreen } from './src/screens/WarpTestScreen';
import type { CardDetectionResult } from './src/types/cardDetection';

type Screen = 'camera' | 'warpTest';

/**
 * Main App component
 */
const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('camera');

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

  const openWarpTest = useCallback(() => {
    setCurrentScreen('warpTest');
  }, []);

  const goBackToCamera = useCallback(() => {
    setCurrentScreen('camera');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      {/* Keep CameraScreen mounted to preserve native warped image */}
      <View style={[styles.screenContainer, currentScreen !== 'camera' && styles.hidden]}>
        <CameraScreen
          cameraPosition="back"
          enableTorch={false}
          onCardDetected={handleCardDetected}
          showDebugInfo={__DEV__}
          onOpenWarpTest={openWarpTest}
          isVisible={currentScreen === 'camera'}
        />
      </View>
      {currentScreen === 'warpTest' && (
        <View style={styles.screenContainer}>
          <WarpTestScreen onBack={goBackToCamera} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  screenContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
});

export default App;
