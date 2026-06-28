package com.razumly.mvp.core.util

import java.util.UUID

actual fun newId(): String = UUID.randomUUID().toString()

