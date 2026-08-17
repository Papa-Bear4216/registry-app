package com.registry.coach.ui

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.registry.coach.R
import com.registry.coach.data.TaskCategory
import com.registry.coach.evaluator.GapResult
import com.registry.coach.monitor.AnonymousCounters
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Overlay service for rendering the contextual coach bubble.
 *
 * Uses WindowManager with TYPE_APPLICATION_OVERLAY (SYSTEM_ALERT_WINDOW permission).
 *
 * Spec section 7 requirements:
 * - Visually distinct from system dialogs (anti-tapjacking)
 * - filterTouchesWhenObscured = true on interactive elements
 * - Cannot resemble a login overlay or system permission dialog
 * - Collapsed state leads with usage-awareness fact (section 1)
 * - Expanded state shows AI ranking detail
 *
 * Spec section 6: overlay permission revoked mid-session ->
 * catch BadTokenException, stop rendering, update toggle state.
 */
@AndroidEntryPoint
class BubbleOverlayService : Service(), BubbleRenderer {

    companion object {
        private const val EXTRA_SUGGESTED_APP_NAME = "extra_suggested_app_name"
        private const val EXTRA_TASK_CATEGORY = "extra_task_category"
        private const val EXTRA_USAGE_FACT_TEXT = "extra_usage_fact_text"

        /** Build the [Intent] AccessibilityMonitor uses to request a collapsed bubble. */
        fun showCollapsedIntent(context: android.content.Context, gap: GapResult.RealGap): Intent {
            return Intent(context, BubbleOverlayService::class.java).apply {
                putExtra(EXTRA_SUGGESTED_APP_NAME, gap.suggestedAppName)
                putExtra(EXTRA_TASK_CATEGORY, gap.taskCategory.name)
                putExtra(EXTRA_USAGE_FACT_TEXT, gap.usageFactText)
            }
        }

        internal fun gapFromIntent(intent: Intent?): GapResult.RealGap? {
            intent ?: return null
            val appName = intent.getStringExtra(EXTRA_SUGGESTED_APP_NAME) ?: return null
            val categoryName = intent.getStringExtra(EXTRA_TASK_CATEGORY) ?: return null
            val category = try {
                TaskCategory.valueOf(categoryName)
            } catch (e: IllegalArgumentException) {
                return null
            }
            val factText = intent.getStringExtra(EXTRA_USAGE_FACT_TEXT) ?: return null
            return GapResult.RealGap(appName, category, factText)
        }
    }

    @Inject lateinit var counters: AnonymousCounters

    private var windowManager: WindowManager? = null
    private var bubbleView: View? = null
    private var currentGap: GapResult.RealGap? = null
    private var isExpanded = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val gap = gapFromIntent(intent)
        if (gap != null) {
            showCollapsed(gap)
        }
        return START_NOT_STICKY
    }

    override fun showCollapsed(gap: GapResult.RealGap) {
        currentGap = gap
        isExpanded = false

        try {
            removeBubbleView()

            val view = createCollapsedView(gap)
            val params = createLayoutParams()

            windowManager?.addView(view, params)
            bubbleView = view
        } catch (e: WindowManager.BadTokenException) {
            // Spec section 6: overlay permission revoked mid-session
            bubbleView = null
        }
    }

    override fun expandBubble() {
        val gap = currentGap ?: return
        isExpanded = true
        counters.incrementExpanded()

        try {
            removeBubbleView()

            val view = createExpandedView(gap)
            val params = createLayoutParams()
            params.height = WindowManager.LayoutParams.WRAP_CONTENT

            windowManager?.addView(view, params)
            bubbleView = view
        } catch (e: WindowManager.BadTokenException) {
            bubbleView = null
        }
    }

    override fun dismiss() {
        removeBubbleView()
        currentGap = null
        isExpanded = false
    }

    override fun isShowing(): Boolean = bubbleView != null

    override fun onDestroy() {
        removeBubbleView()
        super.onDestroy()
    }

    private fun removeBubbleView() {
        bubbleView?.let {
            try {
                windowManager?.removeView(it)
            } catch (_: Exception) { }
        }
        bubbleView = null
    }

    /**
     * Collapsed bubble — small floating pill showing usage-awareness fact.
     * Usage fact LEADS (spec section 1, 7) — not the AI verdict.
     */
    private fun createCollapsedView(gap: GapResult.RealGap): View {
        val padding = (12 * resources.displayMetrics.density).toInt()
        val cornerRadius = 24 * resources.displayMetrics.density

        return TextView(this).apply {
            text = gap.usageFactText
            setTextColor(Color.WHITE)
            textSize = 14f
            setPadding(padding * 2, padding, padding * 2, padding)
            // Anti-tapjacking (spec section 7)
            filterTouchesWhenObscured = true

            // Visually distinct styling — branded, NOT resembling system dialog
            setBackgroundColor(Color.parseColor("#2D1B69")) // Dark purple — distinct from system
            alpha = 0.95f

            setOnClickListener { expandBubble() }
        }
    }

    /**
     * Expanded bubble — shows the suggested alternative and AI reasoning.
     */
    private fun createExpandedView(gap: GapResult.RealGap): View {
        val padding = (16 * resources.displayMetrics.density).toInt()

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.parseColor("#2D1B69"))
            alpha = 0.97f
            filterTouchesWhenObscured = true
        }

        // Usage fact (leads)
        val factText = TextView(this).apply {
            text = gap.usageFactText
            setTextColor(Color.parseColor("#B8A9E0"))
            textSize = 13f
        }

        // Suggestion
        val suggestionText = TextView(this).apply {
            text = "${gap.suggestedAppName} is your top-ranked ${gap.taskCategory.name} tool"
            setTextColor(Color.WHITE)
            textSize = 16f
            setPadding(0, (8 * resources.displayMetrics.density).toInt(), 0, 0)
        }

        // Dismiss button
        val dismissText = TextView(this).apply {
            text = "Dismiss"
            setTextColor(Color.parseColor("#B8A9E0"))
            textSize = 14f
            setPadding(0, (12 * resources.displayMetrics.density).toInt(), 0, 0)
            setOnClickListener { dismiss() }
            filterTouchesWhenObscured = true
        }

        container.addView(factText)
        container.addView(suggestionText)
        container.addView(dismissText)
        return container
    }

    private fun createLayoutParams(): WindowManager.LayoutParams {
        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = (16 * resources.displayMetrics.density).toInt()
            y = (80 * resources.displayMetrics.density).toInt()
        }
    }
}