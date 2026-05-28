package com.figma.code.connect

import org.gradle.api.Plugin
import org.gradle.api.Project
import java.io.File

/**
 * This plugin is intended to be used in conjunction with the `figma` command line tool which
 * invokes gradle tasks by passing in input parameters and writes the output to a file.
 *
 * It can be run standalone as a Gradle task as well, but the `figma` command line tool is still
 * required in order to upload the Code Connect files to Figma.
 *
 * The parsing task delegates to a [ParseCodeConnectWorkAction] running in an isolated worker JVM
 * (see [ParseCodeConnectTask]) so the embedded Kotlin compiler used for parsing never reaches the
 * consumer's buildscript classpath.
 */
class FigmaCodeConnectPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        val parserClasspath =
            project.configurations.create("figmaCodeConnectParser") {
                it.isCanBeConsumed = false
                it.isCanBeResolved = true
                it.isVisible = false
                it.description =
                    "Classpath for the Code Connect parser worker. Resolved into a forked JVM via " +
                    "Gradle's worker API so kotlin-compiler-embeddable never appears on the " +
                    "consumer's buildscript classpath."
            }
        project.dependencies.add(parserClasspath.name, "org.jetbrains.kotlin:kotlin-compiler-embeddable:2.2.21")
        project.dependencies.add(parserClasspath.name, "org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

        val filePathProvider = project.providers.gradleProperty("filePath")
        val outputDirProvider = project.providers.gradleProperty("outputDir")

        // Resolve `filePath`/`outputDir` against the root project so that, in a multi-project
        // build where the plugin is applied to several subprojects, every per-subproject task
        // sees the same input JSON the CLI wrote at the build root rather than looking for it
        // under its own `subproject/` directory.
        //
        // The path-resolution helper captures only `rootDir` (a `java.io.File`). Capturing
        // `project.rootProject` itself or calling `rootProject.file(...)` inside a Provider
        // lambda would force Gradle's configuration cache to serialize a `Project` reference,
        // which it cannot do — and the resulting error is opaque ("cannot serialize object of
        // type 'DefaultProject'") rather than the clean opt-out we want.
        val rootDir: File = project.rootProject.projectDir
        val resolveAgainstRoot: (String) -> File = { path ->
            val f = File(path)
            if (f.isAbsolute) f else File(rootDir, path)
        }

        /**
         * Parses a set of Kotlin source files for `@FigmaConnect`-annotated documents.
         * Takes `-PfilePath=<json>` (input contract documented on [models.CodeConnectParserParseInput])
         * and `-PoutputDir=<dir>` (output file is `${project.name}-output.json`).
         */
        project.tasks.register("parseCodeConnect", ParseCodeConnectTask::class.java) { task ->
            task.inputFile.fileProvider(filePathProvider.map(resolveAgainstRoot))
            task.outputDirectory.fileProvider(outputDirProvider.map(resolveAgainstRoot))
            task.projectNameProperty.set(project.name)
            task.parserClasspath.from(parserClasspath)
            // The source files referenced inside the input JSON are not declared inputs, so
            // Gradle cannot detect when they change. Disable up-to-date until we feed those
            // paths into the input snapshot.
            task.outputs.upToDateWhen { false }
        }

        /**
         * Creates a starter Code Connect file from a Figma component description.
         * Takes `-PfilePath=<json>` (input contract documented on [models.CodeConnectParserCreateInput])
         * and `-PoutputDir=<dir>`.
         */
        project.tasks.register("createCodeConnect", CreateCodeConnectTask::class.java) { task ->
            task.inputFile.fileProvider(filePathProvider.map(resolveAgainstRoot))
            task.outputDirectory.fileProvider(outputDirProvider.map(resolveAgainstRoot))
            task.projectNameProperty.set(project.name)
            task.outputs.upToDateWhen { false }
        }
    }
}
