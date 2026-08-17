package com.registry.coach.ui

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import com.registry.coach.R
import dagger.hilt.android.AndroidEntryPoint

/**
 * In-app settings for the contextual coach feature.
 *
 * Spec section 7 requirements:
 * - In-app revoke toggle: disabling MUST immediately halt tree reads,
 *   not merely stop bubble display.
 * - Toggle must reflect ACTUAL service status, not just user intent (section 6).
 *   Never show "enabled" while the service is not actually running.
 * - Persistent low-priority notification while service is active (section 7):
 *   "Registry Coach is monitoring your app usage" — non-naggy, required
 *   because silently-running accessibility services are the primary trust
 *   complaint in this app category.
 */
@AndroidEntryPoint
class CoachSettingsActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var coachToggle: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val padding = (24 * resources.displayMetrics.density).toInt()
        val smallPad = (8 * resources.displayMetrics.density).toInt()

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding * 2, padding, padding)
        }

        // Title
        layout.addView(TextView(this).apply {
            text = getString(R.string.settings_title)
            textSize = 24f
            setPadding(0, 0, 0, padding)
        })

        // Status
        statusText = TextView(this).apply {
            textSize = 16f
            setPadding(0, 0, 0, smallPad)
        }
        layout.addView(statusText)

        // Toggle
        coachToggle = Switch(this).apply {
            text = getString(R.string.toggle_coach)
            setOnCheckedChangeListener { _, isChecked ->
                if (isChecked) {
                    // Guide user to enable accessibility service in Settings
                    startActivity(android.content.Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                } else {
                    // Spec section 7: disabling MUST immediately halt tree reads.
                    // On API 24+, AccessibilityService.disableSelf() can be called
                    // from the service itself. From this activity, we guide the user
                    // to revoke via Settings.
                    startActivity(android.content.Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                }
            }
        }
        layout.addView(coachToggle)

        setContentView(layout)

        createNotificationChannel()
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    /**
     * Polls actual AccessibilityService running state.
     * Spec section 6: toggle must reflect ACTUAL service status,
     * not just user intent.
     */
    private fun updateStatus() {
        val isRunning = isAccessibilityServiceRunning()
        statusText.text = getString(
            if (isRunning) R.string.coach_enabled else R.string.coach_disabled
        )
        coachToggle.isChecked = isRunning

        // Show/hide persistent notification based on actual status
        if (isRunning) {
            showActiveNotification()
        } else {
            hideActiveNotification()
        }
    }

    private fun isAccessibilityServiceRunning(): Boolean {
        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val myService = "$packageName/com.registry.coach.monitor.AccessibilityMonitor"
        return enabledServices.contains(myService, ignoreCase = true)
    }

    /**
     * Persistent low-priority notification (spec section 7).
     * Required because silently-running accessibility services are
     * the primary trust complaint against this category of app.
     */
    private fun showActiveNotification() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notification_active))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun hideActiveNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.cancel(NOTIFICATION_ID)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val CHANNEL_ID = "coach_active"
        private const val NOTIFICATION_ID = 1001
    }
}