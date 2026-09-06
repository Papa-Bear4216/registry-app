package com.registry.coach.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.registry.coach.CoachApplication
import com.registry.coach.R
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

import com.registry.coach.device.AiCoreState

/**
 * Mandatory pre-permission disclosure screen (spec section 7, 11.5).
 *
 * This is a Play Store submission REQUIREMENT, not optional UX polish.
 * Must be shown before EITHER permission request is triggered.
 *
 * States in Google's required accessibility-disclosure format:
 * 1. What the service does (screen-time/task-category awareness)
 * 2. What it reads (on-screen content, ephemerally)
 * 3. Explicitly: nothing is stored or transmitted
 *
 * Two separate permission grants — NOT bundled behind one toggle (spec section 7).
 */
@AndroidEntryPoint
class ConsentDisclosureActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check AICore availability
        val app = application as CoachApplication
        MainScope().launch {
            app.aiCoreState.collectLatest { state ->
                when (state) {
                    AiCoreState.AVAILABLE -> showDisclosure()
                    AiCoreState.DOWNLOADABLE -> showDownloadable()
                    AiCoreState.UNAVAILABLE -> showNotSupported()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
    }

    private fun showDownloadable() {
        val padding = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding * 2, padding, padding)
        }

        layout.addView(TextView(this).apply {
            text = getString(R.string.aicore_downloadable_title)
            textSize = 24f
            setPadding(0, 0, 0, padding)
        })
        layout.addView(TextView(this).apply {
            text = getString(R.string.aicore_downloadable_message)
            textSize = 16f
            setPadding(0, 0, 0, padding)
        })
        layout.addView(Button(this).apply {
            text = getString(R.string.open_play_store)
            setOnClickListener {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.aicore"))
                    startActivity(intent)
                } catch (e: Exception) {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.aicore"))
                    startActivity(intent)
                }
            }
        })

        setContentView(layout)
    }

    private fun showNotSupported() {
        val padding = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding * 2, padding, padding)
        }

        layout.addView(TextView(this).apply {
            text = getString(R.string.not_supported_title)
            textSize = 24f
            setPadding(0, 0, 0, padding)
        })
        layout.addView(TextView(this).apply {
            text = getString(R.string.not_supported_message)
            textSize = 16f
        })

        setContentView(layout)
    }

    private lateinit var accessibilityStatus: TextView
    private lateinit var overlayStatus: TextView
    private lateinit var proceedButton: Button

    private fun showDisclosure() {
        val padding = (24 * resources.displayMetrics.density).toInt()
        val smallPad = (8 * resources.displayMetrics.density).toInt()

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding * 2, padding, padding)
        }

        // Title
        layout.addView(TextView(this).apply {
            text = getString(R.string.disclosure_title)
            textSize = 24f
            setPadding(0, 0, 0, padding)
        })

        // What it does
        layout.addView(TextView(this).apply {
            text = getString(R.string.disclosure_what_it_does)
            textSize = 16f
            setPadding(0, 0, 0, smallPad)
        })

        // What it reads
        layout.addView(TextView(this).apply {
            text = getString(R.string.disclosure_what_it_reads)
            textSize = 16f
            setPadding(0, 0, 0, smallPad)
        })

        // Privacy statement
        layout.addView(TextView(this).apply {
            text = getString(R.string.disclosure_privacy)
            textSize = 16f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, padding)
        })

        // Accessibility permission
        accessibilityStatus = TextView(this).apply {
            textSize = 14f
            setPadding(0, smallPad, 0, 0)
        }
        layout.addView(Button(this).apply {
            text = getString(R.string.grant_accessibility)
            setOnClickListener {
                AccessibilitySettingsHelper.openAccessibilitySettingsForThisService(this@ConsentDisclosureActivity)
            }
        })
        layout.addView(accessibilityStatus)

        // Overlay permission
        overlayStatus = TextView(this).apply {
            textSize = 14f
            setPadding(0, smallPad, 0, 0)
        }
        layout.addView(Button(this).apply {
            text = getString(R.string.grant_overlay)
            setOnClickListener {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            }
        })
        layout.addView(overlayStatus)

        // Proceed button
        proceedButton = Button(this).apply {
            text = getString(R.string.proceed_to_settings)
            setPadding(0, padding, 0, 0)
            setOnClickListener {
                startActivity(Intent(this@ConsentDisclosureActivity, CoachSettingsActivity::class.java))
            }
        }
        layout.addView(proceedButton)

        setContentView(layout)
        updatePermissionStatus()
    }

    private fun updatePermissionStatus() {
        if (!::accessibilityStatus.isInitialized) return

        val hasAccessibility = AccessibilitySettingsHelper.isAccessibilityServiceEnabled(this)
        val hasOverlay = Settings.canDrawOverlays(this)

        accessibilityStatus.text = getString(
            if (hasAccessibility) R.string.accessibility_granted
            else R.string.accessibility_denied
        )
        overlayStatus.text = getString(
            if (hasOverlay) R.string.overlay_granted
            else R.string.overlay_denied
        )
        proceedButton.isEnabled = hasAccessibility && hasOverlay
    }

}