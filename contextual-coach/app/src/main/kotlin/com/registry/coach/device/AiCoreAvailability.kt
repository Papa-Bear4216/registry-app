package com.registry.coach.device

import android.content.Context
import android.util.Log
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel

/**
 * Checks whether on-device Gemini Nano (via ML Kit GenAI / AICore) is available.
 *
 * Spec section 8: if unavailable, the entire Phase 3 feature is hidden.
 * No fallback model is built — out of scope.
 */
object AiCoreAvailability {

    private const val TAG = "AiCoreAvailability"

    /**
     * Returns true only if Gemini Nano is downloaded and ready to run
     * (FeatureStatus.AVAILABLE). DOWNLOADABLE/UNAVAILABLE both map to false —
     * this module does not implement a download flow, so a model that isn't
     * already on-device is treated the same as one that can't run at all.
     */
    suspend fun isAvailable(context: Context): Boolean {
        return try {
            val model: GenerativeModel = Generation.getClient()
            val status = model.checkStatus()
            Log.i(TAG, "AICore feature status: $status")
            status == FeatureStatus.AVAILABLE
        } catch (e: Exception) {
            Log.w(TAG, "AICore availability check failed: ${e.javaClass.simpleName}")
            false
        }
    }
}
