package com.figma.code.connect

import org.gradle.api.DefaultTask
import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Classpath
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction
import org.gradle.workers.WorkerExecutor
import javax.inject.Inject

/**
 * Runs the PSI-based Code Connect parser in a forked JVM via Gradle's worker API, so the
 * embedded Kotlin compiler used for parsing never reaches the consumer's buildscript classpath.
 */
abstract class ParseCodeConnectTask
    @Inject
    constructor(
        private val workerExecutor: WorkerExecutor,
    ) : DefaultTask() {
        @get:InputFile
        abstract val inputFile: RegularFileProperty

        @get:OutputDirectory
        abstract val outputDirectory: DirectoryProperty

        @get:Classpath
        abstract val parserClasspath: ConfigurableFileCollection

        @get:org.gradle.api.tasks.Input
        abstract val projectNameProperty: Property<String>

        @TaskAction
        fun parse() {
            val ownLocation =
                ParseCodeConnectWorkAction::class.java.protectionDomain.codeSource.location.toURI()
            val workQueue =
                workerExecutor.processIsolation { spec ->
                    spec.classpath.from(parserClasspath)
                    spec.classpath.from(java.io.File(ownLocation))
                }

            workQueue.submit(ParseCodeConnectWorkAction::class.java) { params ->
                params.inputFile.set(inputFile)
                params.outputDirectory.set(outputDirectory)
                params.projectName.set(projectNameProperty)
            }
        }
    }
