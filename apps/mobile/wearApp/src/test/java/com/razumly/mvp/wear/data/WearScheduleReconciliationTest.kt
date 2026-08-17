package com.razumly.mvp.wear.data

import kotlin.test.Test
import kotlin.test.assertEquals

class WearScheduleReconciliationTest {
    @Test
    fun givenPhoneImport_whenAuthoritativeScheduleArrives_thenServerStateWinsAndImportIsRemoved() {
        val store = WearMatchOperationStore(FakeWearMatchOperationStorage())
        val imported = operation(
            id = "phone:match_1:1",
            sourceDevice = "PHONE",
            status = WEAR_MATCH_OPERATION_STATUS_IMPORTED,
            sequence = 1,
        )
        store.upsertOperation(imported)

        val reconciled = reconcileAuthoritativeWearSchedule(
            remoteSchedule = scheduleWith(status = "SERVER"),
            operationStore = store,
            applyOperation = ::applyMarker,
        )

        assertEquals("SERVER", reconciled.matches.single().status)
        assertEquals(emptyList(), store.localOverlayOperations())
    }

    @Test
    fun givenWearPendingOperation_whenAuthoritativeScheduleArrives_thenItRemainsAnOverlay() {
        val store = WearMatchOperationStore(FakeWearMatchOperationStorage())
        val pending = operation(
            id = "wear:match_1:2",
            sourceDevice = "WEAR_OS",
            status = WEAR_MATCH_OPERATION_STATUS_PENDING,
            sequence = 2,
        )
        store.upsertOperation(pending)

        val reconciled = reconcileAuthoritativeWearSchedule(
            remoteSchedule = scheduleWith(status = "SERVER"),
            operationStore = store,
            applyOperation = ::applyMarker,
        )

        assertEquals("SERVER|wear:match_1:2", reconciled.matches.single().status)
        assertEquals(listOf("wear:match_1:2"), store.pendingOperations().map { it.id })
    }

    @Test
    fun givenPhoneImport_whenAuthoritativeMatchResponseArrives_thenOnlyThatImportIsRemoved() {
        val store = WearMatchOperationStore(FakeWearMatchOperationStorage())
        store.upsertOperation(
            operation(
                id = "phone:match_1:1",
                sourceDevice = "PHONE",
                status = WEAR_MATCH_OPERATION_STATUS_IMPORTED,
                sequence = 1,
            ),
        )
        store.upsertOperation(
            operation(
                id = "phone:match_2:2",
                sourceDevice = "PHONE",
                status = WEAR_MATCH_OPERATION_STATUS_IMPORTED,
                sequence = 2,
            ).copy(matchId = "match_2"),
        )

        val reconciled = reconcileAuthoritativeWearMatch(
            remoteMatch = WearMatchDto(id = "match_1", eventId = "event_1", status = "SERVER"),
            operationStore = store,
            applyOperation = ::applyMarker,
        )

        assertEquals("SERVER", reconciled.status)
        assertEquals(listOf("match_2"), store.localOverlayOperations().map { it.matchId })
    }

    private fun applyMarker(match: WearMatchDto, operation: WearPendingMatchOperation): WearMatchDto =
        match.copy(status = "${match.status}|${operation.id}")

    private fun scheduleWith(status: String): WearScheduleResponseDto = WearScheduleResponseDto(
        matches = listOf(WearMatchDto(id = "match_1", eventId = "event_1", status = status)),
    )

    private fun operation(
        id: String,
        sourceDevice: String,
        status: String,
        sequence: Long,
    ): WearPendingMatchOperation = WearPendingMatchOperation(
        id = id,
        eventId = "event_1",
        matchId = "match_1",
        kind = WEAR_MATCH_OPERATION_KIND_PATCH,
        payloadJson = "{}",
        clientDeviceId = sourceDevice.lowercase(),
        clientCreatedAt = "2026-07-13T00:00:00Z",
        clientSequence = sequence,
        sourceDevice = sourceDevice,
        status = status,
    )

    private class FakeWearMatchOperationStorage : WearMatchOperationStorage {
        private var value = WearMatchOperationStoreSnapshot()

        override fun snapshot(): WearMatchOperationStoreSnapshot = value

        override fun replace(snapshot: WearMatchOperationStoreSnapshot) {
            value = snapshot
        }

        override fun clear() {
            value = WearMatchOperationStoreSnapshot()
        }
    }
}
