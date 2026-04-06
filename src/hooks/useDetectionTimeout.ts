/**
 * useDetectionTimeout Hook
 * Manages 5-second timeout for card detection with reminder
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DetectionThresholds } from '../constants/theme';

interface UseDetectionTimeoutOptions {
  /** Whether detection is active (card visible) */
  isDetecting: boolean;
  
  /** Timeout duration in ms (default: 5000) */
  timeoutMs?: number;
  
  /** Callback when timeout triggers */
  onTimeout?: () => void;
  
  /** Whether timeout system is enabled */
  enabled?: boolean;
}

interface UseDetectionTimeoutReturn {
  /** Whether timeout reminder should be shown */
  showReminder: boolean;
  
  /** Number of times timeout has triggered (for escalation) */
  timeoutCount: number;
  
  /** Reset the timeout counter */
  resetTimeouts: () => void;
  
  /** Manually dismiss the reminder */
  dismissReminder: () => void;
}

/**
 * Hook for managing detection timeout and reminders
 */
export function useDetectionTimeout(
  options: UseDetectionTimeoutOptions
): UseDetectionTimeoutReturn {
  const {
    isDetecting,
    timeoutMs = DetectionThresholds.detectionTimeoutMs,
    onTimeout,
    enabled = true,
  } = options;

  const [showReminder, setShowReminder] = useState(false);
  const [timeoutCount, setTimeoutCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDetectionRef = useRef<number>(Date.now());

  // Clear any existing timeout
  const clearExistingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Handle detection state changes
  useEffect(() => {
    if (!enabled) {
      clearExistingTimeout();
      setShowReminder(false);
      return;
    }

    if (isDetecting) {
      // Card detected - hide reminder and reset timer
      clearExistingTimeout();
      setShowReminder(false);
      lastDetectionRef.current = Date.now();
    } else {
      // No card detected - start/continue timeout
      clearExistingTimeout();
      
      timeoutRef.current = setTimeout(() => {
        setShowReminder(true);
        setTimeoutCount(prev => prev + 1);
        onTimeout?.();
        
        // Set up recurring timeout for repeated reminders
        timeoutRef.current = setTimeout(function repeatTimeout() {
          setTimeoutCount(prev => prev + 1);
          onTimeout?.();
          timeoutRef.current = setTimeout(repeatTimeout, timeoutMs);
        }, timeoutMs);
      }, timeoutMs);
    }

    return () => {
      clearExistingTimeout();
    };
  }, [isDetecting, enabled, timeoutMs, onTimeout, clearExistingTimeout]);

  // Reset timeouts (e.g., when starting new scan)
  const resetTimeouts = useCallback(() => {
    clearExistingTimeout();
    setShowReminder(false);
    setTimeoutCount(0);
    lastDetectionRef.current = Date.now();
  }, [clearExistingTimeout]);

  // Manually dismiss reminder
  const dismissReminder = useCallback(() => {
    setShowReminder(false);
  }, []);

  return {
    showReminder,
    timeoutCount,
    resetTimeouts,
    dismissReminder,
  };
}

export default useDetectionTimeout;
