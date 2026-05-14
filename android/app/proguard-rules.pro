# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# react-native-ble-plx — bridges through reflection at the native module layer
-keep class com.bleplx.** { *; }
-dontwarn com.bleplx.**

# @rnmapbox/maps — Mapbox SDK ships consumer-proguard rules in its AAR, these
# are belt-and-suspenders to keep the JS-bridge module classes intact
-keep class com.rnmapbox.rnmbx.** { *; }
-dontwarn com.mapbox.**

# Add any project specific keep options here:
