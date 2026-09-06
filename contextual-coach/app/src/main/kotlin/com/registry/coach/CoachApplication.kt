package com.registry.coach

import android.app.Application
import com.google.firebase.FirebaseApp
import com.registry.coach.device.AiCoreAvailability
import com.registry.coach.device.AiCoreState
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltAndroidApp
class CoachApplication : Application() {

    private val _aiCoreState = MutableStateFlow(AiCoreState.UNAVAILABLE)

    /** Detailed observable AICore state (AVAILABLE, DOWNLOADABLE, UNAVAILABLE). */
    val aiCoreState: StateFlow<AiCoreState> = _aiCoreState.asStateFlow()

    private val _aiCoreAvailable = MutableStateFlow(false)

    /** Observable AICore availability — checked once at startup.
     *  If false, the entire Phase 3 feature surface is suppressed (spec section 8). */
    val aiCoreAvailable: StateFlow<Boolean> = _aiCoreAvailable.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)

        // Check AICore availability at startup.
        MainScope().launch {
            val status = AiCoreAvailability.checkStatus(this@CoachApplication)
            _aiCoreState.value = status
            _aiCoreAvailable.value = (status == AiCoreState.AVAILABLE)
        }
    }
}
