package com.razumly.mvp.core.util

import io.appwrite.models.Document
import kotlin.math.absoluteValue
import kotlin.math.sign

fun Int.ceilDiv(other: Int): Int {
    return this.floorDiv(other) + this.rem(other).sign.absoluteValue
}

fun <T, R> Document<T>.convert(converter: (T) -> R): Document<R> {
    return Document(id, collectionId, databaseId, createdAt, updatedAt, permissions, converter(data))
}