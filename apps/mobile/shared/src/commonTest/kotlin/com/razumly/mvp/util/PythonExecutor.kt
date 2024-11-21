package com.razumly.mvp.util

expect object PythonExecutor {
    fun executePythonScript(scriptModule: String, args: Map<String, String> = emptyMap()): String
}