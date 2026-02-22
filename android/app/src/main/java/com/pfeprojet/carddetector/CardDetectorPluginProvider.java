package com.pfeprojet.carddetector;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.mrousavy.camera.frameprocessor.FrameProcessorPlugin;
import com.mrousavy.camera.frameprocessor.FrameProcessorPluginRegistry;
import com.mrousavy.camera.frameprocessor.VisionCameraProxy;

import java.util.Map;

/**
 * Plugin provider for registering the Card Detector frame processor
 * with VisionCamera
 */
public class CardDetectorPluginProvider {
    
    /**
     * Register the detectCard frame processor plugin
     * This should be called in MainApplication.onCreate()
     */
    public static void register() {
        FrameProcessorPluginRegistry.addFrameProcessorPlugin(
            "detectCard",
            (proxy, options) -> new CardDetectorFrameProcessor(proxy, options)
        );
    }
}
