package com.razumly.mvp.core.util

import platform.Foundation.NSUUID

actual fun newId(): String = NSUUID().UUIDString

