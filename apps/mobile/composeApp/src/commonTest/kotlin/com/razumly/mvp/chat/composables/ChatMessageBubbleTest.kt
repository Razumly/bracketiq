package com.razumly.mvp.chat.composables

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChatMessageBubbleTest {
    @Test
    fun isEmojiOnlyMessage_withSingleEmojiAndNoAttachments_returnsTrue() {
        assertTrue(isEmojiOnlyMessage(body = "😀", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withMultipleEmojisAndNoAttachments_returnsTrue() {
        assertTrue(isEmojiOnlyMessage(body = "🔥🔥", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withFlagEmojiAndNoAttachments_returnsTrue() {
        assertTrue(isEmojiOnlyMessage(body = "🇺🇸", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withKeycapEmojiAndNoAttachments_returnsTrue() {
        assertTrue(isEmojiOnlyMessage(body = "1️⃣", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withZwjSkinToneSequenceReturnsTrue() {
        assertTrue(isEmojiOnlyMessage(body = "👨🏽‍💻", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withEmojiAndText_returnsFalse() {
        assertFalse(isEmojiOnlyMessage(body = "😀 ok", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withEmojiAndPunctuation_returnsFalse() {
        assertFalse(isEmojiOnlyMessage(body = "😀!", attachmentUrls = emptyList()))
    }

    @Test
    fun isEmojiOnlyMessage_withAttachmentUrls_returnsFalse() {
        assertFalse(isEmojiOnlyMessage(body = "😀", attachmentUrls = listOf("https://example.com/image.png")))
    }
}
