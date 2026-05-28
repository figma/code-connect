package com.figma.code.connect

import com.figma.code.connect.models.CodeConnectParserCreateInput
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction
import java.io.File

/**
 * Generates a starter Code Connect file from a Figma component description. Runs in-process —
 * the create path uses KotlinPoet and does not touch the embedded Kotlin compiler.
 */
abstract class CreateCodeConnectTask : DefaultTask() {
    @get:InputFile
    abstract val inputFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @get:Input
    abstract val projectNameProperty: Property<String>

    @TaskAction
    fun create() {
        val json =
            Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
                allowTrailingComma = true
            }

        val inputJsonFile = inputFile.get().asFile
        val codeConnectParserCreateInput =
            json.decodeFromString<CodeConnectParserCreateInput>(inputJsonFile.readText())

        val output = CodeConnectCreator.create(codeConnectParserCreateInput)
        val outputStr = json.encodeToString(output)

        val outputDir = outputDirectory.get().asFile
        File(outputDir, "${projectNameProperty.get()}-output.json").writeText(outputStr)
    }
}
