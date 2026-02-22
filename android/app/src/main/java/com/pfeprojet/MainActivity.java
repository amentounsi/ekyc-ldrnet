package com.pfeprojet;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

/**
 * Main Activity for React Native application
 */
public class MainActivity extends ReactActivity {

    /**
     * Returns the name of the main component registered from JavaScript.
     * This is used to schedule rendering of the component.
     */
    @Override
    protected String getMainComponentName() {
        return "PFEProjet";
    }

    /**
     * Returns the instance of the {@link ReactActivityDelegate}.
     * Here we use a util class to construct the delegate and tell it to use
     * Fabric for rendering.
     */
    @Override
    protected ReactActivityDelegate createReactActivityDelegate() {
        return new DefaultReactActivityDelegate(
            this,
            getMainComponentName(),
            // Enable Fabric rendering
            DefaultNewArchitectureEntryPoint.getFabricEnabled()
        );
    }
}
