# Add rules here to keep classes required by react-native-vision-camera
-keep class com.mrousavy.camera.** { *; }
-keep class com.facebook.** { *; }

# Keep card detector classes
-keep class com.pfeprojet.carddetector.** { *; }

# OpenCV
-keep class org.opencv.** { *; }

# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}
