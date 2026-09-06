package com.registry.coach.device

import android.content.Context
import android.util.Log
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel

enum class AiCoreState {
    AVAILABLE,
    DOWNLOADABLE,
    UNAVAILABLE,
}

/**
 * Checks whether on-device Gemini Nano (via ML Kit GenAI / AICore) is available.
 *
 * Spec section 8: if unavailable, the entire Phase 3 feature is hidden.
 * If downloadable, guide user to complete model/AICore download via Play Store.
 */
object AiCoreAvailability {

    private const val TAG = "AiCoreAvailability"

    /**
     * Checks detailed AICore status:
     * - AVAILABLE: Model is ready for on-device inference.
     * - DOWNLOADABLE: Model / AICore component is supported but needs download/update.
     * - UNAVAILABLE: Device cannot run on-device Gemini Nano.
     */
    suspend fun checkStatus(context: Context): AiCoreState {
        return try {
            val model: GenerativeModel = Generation.getClient()
            val status = model.checkStatus()
            Log.i(TAG, "AICore feature status: $status")
            when (status) {
                FeatureStatus.AVAILABLE -> AiCoreState.AVAILABLE
                FeatureStatus.DOWNLOADABLE -> AiCoreState.DOWNLOADABLE
                else -> AiCoreState.UNAVAILABLE
            }
        } catch (e: Exception) {
            Log.w(TAG, "AICore availability check failed: ${e.javaClass.simpleName}")
            AiCoreState.UNAVAILABLE
        }
    }

    /**
     * Returns true only if Gemini Nano is downloaded and ready to run
     * (FeatureStatus.AVAILABLE).
     */
    suspend fun isAvailable(context: Context): Boolean {
        return checkStatus(context) == AiCoreState.AVAILABLE
    }
}
