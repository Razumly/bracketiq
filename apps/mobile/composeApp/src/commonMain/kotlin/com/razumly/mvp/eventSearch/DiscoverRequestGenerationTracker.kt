package com.razumly.mvp.eventSearch

/**
 * Gives a visible Discover list query a generation. A force refresh advances the
 * generation so a late result from an earlier filter, location, or radius cannot
 * mutate the current list or page offset.
 */
internal class DiscoverRequestGenerationTracker {
    private var activeGeneration = 0L

    fun invalidate(): Long {
        activeGeneration += 1
        return activeGeneration
    }

    fun currentGeneration(): Long = activeGeneration

    fun isCurrent(generation: Long): Boolean = generation == activeGeneration
}
