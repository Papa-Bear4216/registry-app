plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.registry.coach"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.registry.coach"
        minSdk = 28  // AICore floor
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        // genai-prompt/genai-common ship metadata built with a newer Kotlin
        // than this module's 1.9.24 compiler; the ABI itself is stable Java/Kotlin
        // interop, so skip the metadata version gate rather than bumping Kotlin.
        freeCompilerArgs += "-Xskip-metadata-version-check"
    }

    lint {
        // Wire up the custom lint module for zero-logging enforcement
        checkDependencies = true
    }
}

dependencies {
    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth.ktx)
    implementation(libs.firebase.firestore.ktx)
    implementation(libs.firebase.common.ktx)

    // On-device AI (Gemini Nano via AICore)
    implementation(libs.genai.prompt)

    // AndroidX
    implementation(libs.core.ktx)
    implementation(libs.appcompat)
    implementation(libs.activity.ktx)
    implementation(libs.lifecycle.runtime.ktx)

    // UI
    implementation(libs.material)

    // Serialization (denylist JSON parsing, counter serialization)
    implementation(libs.kotlinx.serialization.json)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)

    // DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Custom lint checks (zero-logging enforcement)
    lintChecks(project(":lint"))

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
}
