package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.OrganizationTemplateDocument
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventOrganizationTemplatesCoordinatorTest {
    @Test
    fun clear_resets_templates_error_and_loading() {
        val coordinator = EventOrganizationTemplatesCoordinator()
        coordinator.beginLoad()
        coordinator.applyLoadSuccess(listOf(template("template-1")))

        coordinator.clear()

        assertEquals(emptyList(), coordinator.templates.value)
        assertNull(coordinator.error.value)
        assertFalse(coordinator.loading.value)
    }

    @Test
    fun success_keeps_loaded_templates_and_clears_loading() {
        val coordinator = EventOrganizationTemplatesCoordinator()
        val templates = listOf(template("template-1"), template("template-2"))

        coordinator.beginLoad()
        assertTrue(coordinator.loading.value)
        assertNull(coordinator.error.value)

        coordinator.applyLoadSuccess(templates)
        coordinator.finishLoad()

        assertEquals(templates, coordinator.templates.value)
        assertNull(coordinator.error.value)
        assertFalse(coordinator.loading.value)
    }

    @Test
    fun failure_clears_templates_and_stores_message() {
        val coordinator = EventOrganizationTemplatesCoordinator()
        coordinator.applyLoadSuccess(listOf(template("template-1")))

        coordinator.beginLoad()
        coordinator.applyLoadFailure("Failed to load templates.")
        coordinator.finishLoad()

        assertEquals(emptyList(), coordinator.templates.value)
        assertEquals("Failed to load templates.", coordinator.error.value)
        assertFalse(coordinator.loading.value)
    }

    private fun template(id: String): OrganizationTemplateDocument =
        OrganizationTemplateDocument(
            id = id,
            title = "Template $id",
        )
}
