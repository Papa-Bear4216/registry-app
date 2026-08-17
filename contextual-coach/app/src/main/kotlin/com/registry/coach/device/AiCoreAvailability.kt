package com.registry.coach.device

import android.content.Context

/**
 * Checks whether on-device Gemini Nano (via Android AICore) is available.
 *
 * Spec section 8: if unavailable, the entire Phase 3 feature is hidden.
 * No fallback model is built — out of scope.
 */
object AiCoreAvailability {

    /**
     * Returns true if Gemini Nano is available on this device via AICore.
     *
     * This probes the GenerativeModel API at startup. A failure or
     * unavailability result means Phase 3 is completely suppressed.
     */
    suspend fun isAvailable(context: Context): Boolean {
        return try {
            // TODO: Replace with actual AICore availability probe.
            // The exact API depends on the Play Services AI SDK version:
            //
            //   val model = GenerativeModel(
            //       GenerativeModelConfig.builder()
            //           .setModelName("gemini-nano")
            //           .build()
            //   )
            //   model.isAvailable()
            //
            // For now, return false — feature is suppressed until AICore
            // SDK integration is wired up with a real device.
            false
        } catch (e: Exception) {
            false
        }
    }
}
