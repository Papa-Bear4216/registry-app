package com.registry.collector.data

import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads phone usage data from Android's UsageStatsManager.
 *
 * Queries usage stats for the window since the last successful sync,
 * producing one [AppUsageRecord] per app that had non-zero foreground time.
 */
@Singleton
class UsageStatsReader @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val usageStatsManager: UsageStatsManager
        get() = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

    private val packageManager: PackageManager
        get() = context.packageManager

    /**
     * Reads usage stats from [sinceTimestamp] to [now].
     *
     * @return List of [AppUsageRecord] for apps with non-zero foreground time in the window.
     *         Empty list if UsageStatsManager returns no data (e.g. permission not granted).
     */
    fun readUsageSince(sinceTimestamp: Long, now: Long): List<AppUsageRecord> {
        val stats: List<UsageStats> = usageStatsManager
            .queryUsageStats(UsageStatsManager.INTERVAL_BEST, sinceTimestamp, now)
            ?: return emptyList()

        return stats
            .filter { it.totalTimeInForeground > 0 }
            .mapNotNull { stat ->
                val label = resolveAppLabel(stat.packageName) ?: stat.packageName
                val launchCount = resolveLaunchCount(stat)

                AppUsageRecord(
                    packageName = stat.packageName,
                    appLabel = label,
                    totalTimeInForegroundMs = stat.totalTimeInForeground,
                    launchCount = launchCount,
                    windowStartMs = sinceTimestamp,
                    windowEndMs = now,
                )
            }
    }

    /**
     * Resolves a human-readable app label from the package name.
     * Returns null if the package is not installed (e.g. recently uninstalled).
     */
    private fun resolveAppLabel(packageName: String): String? {
        return try {
            val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getApplicationInfo(
                    packageName,
                    PackageManager.ApplicationInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                packageManager.getApplicationInfo(packageName, 0)
            }
            packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }

    /**
     * Resolves the launch count for a usage stat entry.
     *
     * UsageStats.getAppLaunchCount() is @SystemApi (hidden) — not part of the
     * public Android SDK at any API level, and does not compile against it.
     * There is no reliable public-API launch count on UsageStats; the
     * accurate way to get one is counting ACTIVITY_RESUMED events via
     * UsageEvents, which is a larger reader rewrite out of scope here.
     * Always returns 1 for now: "this app had non-zero foreground time in
     * the window" is still a true, useful signal — it's the count itself
     * that is not meaningful until that rewrite happens.
     */
    private fun resolveLaunchCount(stat: UsageStats): Int = 1
}
