package com.registry.coach.filter

import android.content.Context
import com.registry.coach.R
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pure function: package name -> allowed/blocked.
 * Spec section 9.2 — zero dependencies, no I/O after initialization.
 *
 * HIGHEST-PRIORITY TEST SURFACE (spec section 10). A false negative here
 * (a sensitive app slipping past the filter and getting tree-read) is the
 * worst possible failure mode under the privacy-first governing rule.
 *
 * The denylist is bundled as a static JSON resource and updated only via
 * app updates — deliberately NOT fetched remotely (spec section 5).
 */
@Singleton
class DenylistFilter @Inject constructor(
    private val blockedPackages: Set<String>,
) {
    /** Returns true if the package should be SKIPPED — never tree-read. */
    fun isBlocked(packageName: String): Boolean =
        packageName in blockedPackages

    /**
     * Returns true if the package is a system/launcher/dialer/camera app.
     * These are always skipped regardless of the denylist (spec section 3).
     */
    fun isSystemApp(packageName: String, systemPackages: Set<String>): Boolean =
        packageName in systemPackages ||
            packageName.startsWith("com.android.") ||
            packageName.startsWith("com.google.android.inputmethod") ||
            packageName == "com.google.android.dialer" ||
            packageName == "com.google.android.camera" ||
            packageName == "com.google.android.launcher" ||
            packageName == "com.google.android.apps.nexuslauncher"

    companion object {
        /** Load the denylist from the bundled resource file. Called once at startup. */
        fun fromResource(context: Context): DenylistFilter =
            DenylistFilter(loadBlockedPackages(context))

        /** Read just the package-name set, for callers that only need the raw data (e.g. DI providers). */
        fun loadBlockedPackages(context: Context): Set<String> {
            val jsonText = context.resources.openRawResource(R.raw.sensitive_apps)
                .bufferedReader().use { it.readText() }
            val parsed = Json.decodeFromString<SensitiveAppsFile>(jsonText)
            return parsed.packages.toSet()
        }
    }
}

@Serializable
internal data class SensitiveAppsFile(
    val version: Int,
    val updated: String,
    val packages: List<String>,
)