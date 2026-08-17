plugins {
    id("java-library")
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    compileOnly("com.android.tools.lint:lint-api:31.5.2")
    compileOnly("com.android.tools.lint:lint-checks:31.5.2")
    compileOnly("org.jetbrains.kotlin:kotlin-stdlib:1.9.24")
}

tasks.jar {
    manifest {
        attributes("Lint-Registry-v2" to "com.registry.coach.lint.LintRegistry")
    }
}