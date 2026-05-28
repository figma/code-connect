package com.figma.code.connect

import com.figma.code.connect.models.CodeConnectDocument
import com.figma.code.connect.models.CodeConnectParserMessage
import com.figma.code.connect.models.CodeConnectParserParseInput
import com.figma.code.connect.models.CodeConnectPluginParserOutput
import com.figma.code.connect.models.FigmaBoolean
import com.figma.code.connect.models.FigmaEnum
import com.figma.code.connect.models.FigmaInstance
import com.figma.code.connect.models.FigmaString
import com.figma.code.connect.models.PropertyMapping
import com.figma.code.connect.models.SourceLocation
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.workers.WorkAction
import org.gradle.workers.WorkParameters
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.com.intellij.psi.PsiManager
import org.jetbrains.kotlin.com.intellij.testFramework.LightVirtualFile
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.idea.KotlinFileType
import org.jetbrains.kotlin.psi.KtFile
import java.io.File

interface ParseCodeConnectWorkParameters : WorkParameters {
    val inputFile: RegularFileProperty
    val outputDirectory: DirectoryProperty
    val projectName: Property<String>
}

/**
 * Worker action that runs the PSI-based Code Connect parser in an isolated JVM. The plugin's
 * task body submits this work via `WorkerExecutor.processIsolation`, with `kotlin-compiler-embeddable`
 * on the worker classpath only — never on the consumer's buildscript classpath.
 */
abstract class ParseCodeConnectWorkAction : WorkAction<ParseCodeConnectWorkParameters> {
    private val kotlinCoreEnvironment: KotlinCoreEnvironment by lazy {
        val disposable = Disposer.newDisposable()
        KotlinCoreEnvironment.createForProduction(
            disposable,
            CompilerConfiguration(),
            EnvironmentConfigFiles.JVM_CONFIG_FILES,
        )
    }

    private fun createImportStatement(
        file: KtFile,
        component: String,
    ): String? {
        if (file.packageFqName.asString().isBlank()) {
            return null
        }
        return "import ${file.packageFqName.asString()}.$component"
    }

    @OptIn(ExperimentalSerializationApi::class)
    override fun execute() {
        val json =
            Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
                serializersModule =
                    SerializersModule {
                        polymorphic(PropertyMapping::class) {
                            subclass(FigmaString::class, FigmaString.serializer())
                            subclass(FigmaBoolean::class, FigmaBoolean.serializer())
                            subclass(FigmaInstance::class, FigmaInstance.serializer())
                            subclass(FigmaEnum::class, FigmaEnum.serializer())
                        }
                    }
                prettyPrint = true
            }

        val parseInputFile = parameters.inputFile.get().asFile
        val codeConnectParserParseInput =
            json.decodeFromString<CodeConnectParserParseInput>(parseInputFile.readText())

        val documents = mutableListOf<CodeConnectDocument>()
        val messages = mutableListOf<CodeConnectParserMessage>()
        // Keep track of the import + source Location
        val composableImportsAndSourceLocations = mutableMapOf<String, Pair<String?, SourceLocation>>()

        for (path in codeConnectParserParseInput.paths.filter { it.endsWith(".kt") }) {
            val tempFile = File(path)
            val file =
                LightVirtualFile(
                    "temp_file.kt",
                    KotlinFileType.INSTANCE,
                    tempFile.readText().replace("\r\n", "\n"),
                )
            val ktFile =
                PsiManager.getInstance(kotlinCoreEnvironment.project)
                    .findFile(file) as KtFile

            val parserResult = CodeConnectParser.parseFile(ktFile, codeConnectParserParseInput.config.skipTemplateHelpers)
            documents.addAll(parserResult.docs.map { it.copy(_codeConnectFilePath = path) })
            messages.addAll(parserResult.messages)
            // Get all the line numbers for all @Composable functions to assign a SourceLocation
            composableImportsAndSourceLocations.putAll(
                parserResult.functionLineNumbers.mapValues {
                    Pair(createImportStatement(ktFile, it.key), SourceLocation(file = path, line = it.value))
                },
            )
        }

        documents.forEach { doc ->
            val sourceInformation = composableImportsAndSourceLocations[doc.component]
            if (doc.component == null || sourceInformation == null) {
                return@forEach
            }
            doc.sourceLocation = sourceInformation.second

            if (codeConnectParserParseInput.config.autoAddImports) {
                sourceInformation.first?.let {
                    doc.templateData.imports += it
                }
            }
        }

        val outputStr = json.encodeToString(CodeConnectPluginParserOutput(documents, messages)).trimIndent()

        val outputDir = parameters.outputDirectory.get().asFile
        File(outputDir, "${parameters.projectName.get()}-output.json").writeText(outputStr)
    }
}
