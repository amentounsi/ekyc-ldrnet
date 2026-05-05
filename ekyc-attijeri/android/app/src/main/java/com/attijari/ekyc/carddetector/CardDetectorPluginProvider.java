package com.attijari.ekyc.carddetector;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin;
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry;
import com.mrousavy.camera.frameprocessors.VisionCameraProxy;

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
