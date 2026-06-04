plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.example.pdfpro"
    compileSdk = 36

    val releaseStoreFilePath = providers.gradleProperty("PDF_PRO_STORE_FILE").orNull
    val releaseStorePassword = providers.gradleProperty("PDF_PRO_STORE_PASSWORD").orNull
    val releaseKeyAlias = providers.gradleProperty("PDF_PRO_KEY_ALIAS").orNull
    val releaseKeyPassword = providers.gradleProperty("PDF_PRO_KEY_PASSWORD").orNull
    val hasReleaseSigning = listOf(
        releaseStoreFilePath,
        releaseStorePassword,
        releaseKeyAlias,
        releaseKeyPassword
    ).all { it != null }

    defaultConfig {
        applicationId = "com.example.pdfpro"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "2.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = file(releaseStoreFilePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
