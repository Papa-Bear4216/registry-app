package com.registry.coach.di

import com.registry.coach.data.FirestoreRankingCache
import com.registry.coach.data.LocalRankingCache
import com.registry.coach.evaluator.GapEvaluator
import com.registry.coach.evaluator.GeminiNanoGapEvaluator
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {

    @Binds
    @Singleton
    abstract fun bindLocalRankingCache(impl: FirestoreRankingCache): LocalRankingCache

    @Binds
    @Singleton
    abstract fun bindGapEvaluator(impl: GeminiNanoGapEvaluator): GapEvaluator
}
