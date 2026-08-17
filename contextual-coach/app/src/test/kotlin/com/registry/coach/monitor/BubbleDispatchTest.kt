package com.registry.coach.monitor

import android.content.Intent
import com.registry.coach.data.TaskCategory
import com.registry.coach.evaluator.GapResult
import com.registry.coach.ui.BubbleOverlayService
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Round-trip test for the Intent extras BubbleOverlayService uses to
 * receive a gap from AccessibilityMonitor. android.content.Intent is an
 * unmocked framework stub under the plain JVM unit-test classpath (no
 * Robolectric configured in this module — see build.gradle.kts), so the
 * Intent itself is mocked here rather than constructed directly; only
 * gapFromIntent's extraction logic is under test, which is exactly what
 * this fix needs to verify.
 */
class BubbleDispatchTest {

    @Test
    fun `gap round-trips through intent extras`() {
        val gap = GapResult.RealGap(
            suggestedAppName = "Todoist",
            taskCategory = TaskCategory.Productivity,
            usageFactText = "45m in productivity apps today",
        )
        val intent = mockk<Intent>()
        every { intent.getStringExtra("extra_suggested_app_name") } returns gap.suggestedAppName
        every { intent.getStringExtra("extra_task_category") } returns gap.taskCategory.name
        every { intent.getStringExtra("extra_usage_fact_text") } returns gap.usageFactText

        val parsed = BubbleOverlayService.gapFromIntent(intent)

        assertEquals(gap, parsed)
    }

    @Test
    fun `null intent produces no gap`() {
        assertNull(BubbleOverlayService.gapFromIntent(null))
    }

    @Test
    fun `intent missing required extras produces no gap`() {
        val intent = mockk<Intent>()
        every { intent.getStringExtra("extra_suggested_app_name") } returns "Todoist"
        every { intent.getStringExtra("extra_task_category") } returns null
        every { intent.getStringExtra("extra_usage_fact_text") } returns null

        assertNull(BubbleOverlayService.gapFromIntent(intent))
    }

    @Test
    fun `intent with an unrecognized category name produces no gap`() {
        val intent = mockk<Intent>()
        every { intent.getStringExtra("extra_suggested_app_name") } returns "Todoist"
        every { intent.getStringExtra("extra_task_category") } returns "NotARealCategory"
        every { intent.getStringExtra("extra_usage_fact_text") } returns "45m today"

        assertNull(BubbleOverlayService.gapFromIntent(intent))
    }
}
