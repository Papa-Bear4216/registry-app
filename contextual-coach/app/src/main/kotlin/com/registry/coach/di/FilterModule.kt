package com.registry.coach.di

import android.content.Context
import com.registry.coach.filter.DenylistFilter
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * DenylistFilter's @Inject constructor takes a bare Set<String>. The denylist
 * itself must load from the bundled sensitive_apps.json resource (spec
 * section 5: never fetched remotely) rather than being provided empty.
 */
@Module
@InstallIn(SingletonComponent::class)
object FilterModule {

    @Provides
    @Singleton
    fun provideBlockedPackages(@ApplicationContext context: Context): Set<String> =
        DenylistFilter.loadBlockedPackages(context)
}
