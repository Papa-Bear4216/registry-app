package com.registry.coach.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
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
            setOnCheckedChangeListener { _, _ ->
                // Both directions (enable and disable — spec section 7: disabling
                // MUST immediately halt tree reads, which only Settings can do
                // reliably from outside the service itself) route to the same
                // deep link — Android's own toggle there is the source of truth.
                AccessibilitySettingsHelper.openAccessibilitySettingsForThisService(this@CoachSettingsActivity)
            }
        }
        layout.addView(coachToggle)

        setContentView(layout)
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
        val isRunning = AccessibilitySettingsHelper.isAccessibilityServiceEnabled(this)
        statusText.text = getString(
            if (isRunning) R.string.coach_enabled else R.string.coach_disabled
        )
        coachToggle.isChecked = isRunning
    }
}