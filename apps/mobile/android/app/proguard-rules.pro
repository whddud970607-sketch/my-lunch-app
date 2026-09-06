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
