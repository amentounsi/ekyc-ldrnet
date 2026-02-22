/**
 * Card Detection Module Exports
 * Main entry point for the card detection functionality
 */

// Types
export * from './types/cardDetection';

// Hooks
export { useCardDetection } from './hooks/useCardDetection';

// Components
export { CardOverlay, CardGuideFrame } from './components/CardOverlay';
export { CameraScreen } from './screens/CameraScreen';

// Native Module
export { cardDetectorModule } from './native/CardDetectorModule';

// Frame Processor
export { detectCard } from './frameProcessor/detectCard';
