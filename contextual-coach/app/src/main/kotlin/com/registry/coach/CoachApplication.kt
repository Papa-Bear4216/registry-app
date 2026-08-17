package com.registry.coach

import android.app.Application
import com.google.firebase.FirebaseApp
import com.registry.coach.device.AiCoreAvailability
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltAndroidApp
class CoachApplication : Application() {

    private val _aiCoreAvailable = MutableStateFlow(false)

    /** Observable AICore availability — checked once at startup.
     *  If false, the entire Phase 3 feature surface is suppressed (spec section 8). */
    val aiCoreAvailable: StateFlow<Boolean> = _aiCoreAvailable.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)

        // Check AICore availability at startup. If unavailable, the entire
        // Phase 3 feature (permission prompts, toggles, bubble system) is
        // hidden — not shown as a broken or greyed-out option.
        MainScope().launch {
            _aiCoreAvailable.value = AiCoreAvailability.isAvailable(this@CoachApplication)
        }
    }
}
