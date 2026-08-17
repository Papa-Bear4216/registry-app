package com.registry.coach.data

/**
 * Must mirror src/types/enums.ts TaskCategory exactly — same wire values.
 * These are the values stored in Firestore by the Phase 1/2 app.
 */
enum class TaskCategory(val wire: String) {
    Writing("writing"),
    Coding("coding"),
    Communication("communication"),
    Design("design"),
    Productivity("productivity"),
    Media("media"),
    Finance("finance"),
    Utilities("utilities"),
    Other("other");

    companion object {
        fun fromWire(value: String): TaskCategory? =
            entries.firstOrNull { it.wire == value }
    }
}