package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FieldDaoBehaviorTest {

    @Test
    fun given_canonicalFacilityId_when_fieldDaoRoundTrips_then_returnsSameFacilityId() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            database.getFieldDao.upsertField(
                Field(
                    id = "field-1",
                    fieldNumber = 2,
                    name = "Court 2",
                    organizationId = "org-1",
                    facilityId = "facility-1",
                ),
            )

            val cached = database.getFieldDao.getFieldsByIds(listOf("field-1")).single()
            assertEquals("facility-1", cached.facilityId)
        } finally {
            database.close()
        }
    }
}
