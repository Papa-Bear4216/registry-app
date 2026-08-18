package com.registry.coach.evaluator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class GeminiNanoGapEvaluatorTest {

    private val evaluator = GeminiNanoGapEvaluator()

    @Test
    fun `parseVerdict parses well-formed JSON`() {
        val raw = """{"isGap": true, "confidence": 0.8, "detectedCategory": "coding"}"""

        val verdict = evaluator.parseVerdict(raw)

        assertEquals(GeminiNanoGapEvaluator.GapVerdict(true, 0.8, "coding"), verdict)
    }

    @Test
    fun `parseVerdict strips surrounding prose around the JSON object`() {
        val raw = "Sure, here's the classification:\n" +
            """{"isGap": false, "confidence": 0.1, "detectedCategory": "other"}""" +
            "\nLet me know if you need anything else."

        val verdict = evaluator.parseVerdict(raw)

        assertEquals(GeminiNanoGapEvaluator.GapVerdict(false, 0.1, "other"), verdict)
    }

    @Test
    fun `parseVerdict returns null for non-JSON response`() {
        assertNull(evaluator.parseVerdict("I cannot classify this content."))
    }

    @Test
    fun `parseVerdict returns null for malformed JSON`() {
        assertNull(evaluator.parseVerdict("""{"isGap": true, "confidence":"""))
    }

    @Test
    fun `parseVerdict returns null when required fields are missing`() {
        assertNull(evaluator.parseVerdict("""{"isGap": true}"""))
    }
}
