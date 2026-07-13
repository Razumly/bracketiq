package com.razumly.mvp.wear

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WearMatchActionGateTest {
    @Test
    fun givenRapidConcurrentTaps_whenActionIsInFlight_thenOnlyOneCanStart() {
        val gate = WearMatchActionGate()
        val executor = Executors.newFixedThreadPool(8)

        try {
            val starts = (1..16).map {
                executor.submit<Boolean> { gate.tryStart() }
            }

            assertEquals(1, starts.count { it.get(5, TimeUnit.SECONDS) })
            assertFalse(gate.tryStart())

            gate.finish()

            assertTrue(gate.tryStart())
        } finally {
            executor.shutdownNow()
        }
    }
}
