package com.pfeprojet;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;

import com.pfeprojet.carddetector.CardDetectorPackage;
import com.pfeprojet.carddetector.CardDetectorPluginProvider;
import com.pfeprojet.barcode.BarcodeScannerPackage;

import java.util.List;

/**
 * Main Application class for React Native
 * Configures React Native host and registers native modules
 */
public class MainApplication extends Application implements ReactApplication {

    private final ReactNativeHost mReactNativeHost = new DefaultReactNativeHost(this) {
        
        @Override
        public boolean getUseDeveloperSupport() {
            return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
            @SuppressWarnings("UnnecessaryLocalVariable")
            List<ReactPackage> packages = new PackageList(this).getPackages();
            
            // Add CardDetector package
            packages.add(new CardDetectorPackage());
            
            // Add BarcodeScanner package (Phase C)
            packages.add(new BarcodeScannerPackage());
            
            return packages;
        }

        @Override
        protected String getJSMainModuleName() {
            return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
            return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
            return BuildConfig.IS_HERMES_ENABLED;
        }
    };

    @Override
    public ReactNativeHost getReactNativeHost() {
        return mReactNativeHost;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        
        // Initialize SoLoader
        SoLoader.init(this, /* native exopackage */ false);
        
        // Register VisionCamera frame processor plugin
        CardDetectorPluginProvider.register();
        
        // Initialize new architecture if enabled
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            DefaultNewArchitectureEntryPoint.load();
        }
    }
}
