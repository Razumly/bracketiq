package com.razumly.mvp.util

import java.util.concurrent.TimeUnit

actual object PythonExecutor {
    actual fun executePythonScript(scriptModule: String, args: Map<String, String>): String {
        // Create the bash command to source venv and execute python script
        val bashCommand = """
            ${
            "source /home/camka/MVPWebApp/mvp-build-bracket/.venv/bin/activate"
        } && ${
            "cd /home/camka/MVPWebApp/mvp-build-bracket"
        } && python -m $scriptModule ${
            args.map { (key, value) -> "--$key $value" }.joinToString(" ")
        }
        """.trimIndent()

        val command = mutableListOf(
            "wsl",
            "bash",
            "-c",
            bashCommand
        )

        val process = ProcessBuilder(command)
            .redirectOutput(ProcessBuilder.Redirect.PIPE)
            .redirectError(ProcessBuilder.Redirect.PIPE)
            .start()

        val output = process.inputStream.bufferedReader().readText()
        val error = process.errorStream.bufferedReader().readText()

        val exitCode = process.waitFor(5, TimeUnit.SECONDS)

        if (!exitCode) {
            throw RuntimeException("Python script execution timed out")
        }

        if (error.isNotEmpty()) {
            throw RuntimeException("Python script error: $error")
        }

        if (process.exitValue() != 0) {
            throw RuntimeException("Python script failed with exit code: ${process.exitValue()}")
        }

        return output
    }
}