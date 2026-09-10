# TMAP Navi UI SDK references optional OpenCSV at compile time.
-dontwarn com.opencsv.**

# Kakao Vector Map (kakao_maps_flutter → com.kakao.maps.open:android).
# Native EngineHandler.nativeInit uses JNI GetFieldID for
# RenderViewOptions.listener : MapViewHolder. R8 must not strip or rename
# those types — otherwise map open aborts with:
#   ClassNotFoundException: com.kakao.vectormap.internal.MapViewHolder
#   NoSuchFieldError on RenderViewOptions.listener → SIGABRT (main).
-keep class com.kakao.vectormap.** { *; }
-keepclassmembers class com.kakao.vectormap.** { *; }
-dontwarn com.kakao.vectormap.**

# TMAP Vector Map (tmap-sdk-3.7) + shared VSM JNI (Maven vsm-tmap-sdk:2.0.14).
# Official VSM consumer rules keep vsm/navirenderer; Vector core has no consumer
# rules — keep TMapView/overlay entry types used across the JNI boundary.
-keep class com.skt.tmap.vsm.** { *; }
-keep class com.skt.tmap.navirenderer.** { *; }
-keep class com.skt.tmap.TMapView { *; }
-keep class com.skt.tmap.TMapView$* { *; }
-keep class com.skt.tmap.TMapPoint { *; }
-keep class com.skt.tmap.overlay.** { *; }
-dontwarn com.skt.tmap.**
