plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.deliveryshield.delivery_shield_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        viewBinding = true
        // Required by tmap-ui-sdk (official sample enables dataBinding).
        dataBinding = true
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.deliveryshield.delivery_shield_mobile"
        // Kakao Mobility in-app nav SDK requires API 26+ (Oreo).
        minSdk = maxOf(flutter.minSdkVersion, 26)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("com.kakaomobility.knsdk:knsdk_ui:1.12.7")
    // TMAP Navi UI SDK V1.77 package → artifact 1.0.0.0158 (debug PoC only).
    implementation("com.tmapmobility.tmap:tmap-ui-sdk:1.0.0.0158")
    // Align with official Kotlin sample pin (TMAP POM declares 21.0.1).
    implementation("com.google.android.gms:play-services-location:21.3.0")
}

flutter {
    source = "../.."
}
