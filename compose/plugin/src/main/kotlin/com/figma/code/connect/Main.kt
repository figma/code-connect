package com.figma.code.connect

import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.com.intellij.psi.PsiManager
import org.jetbrains.kotlin.com.intellij.testFramework.LightVirtualFile
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.idea.KotlinFileType
import org.jetbrains.kotlin.psi.KtFile
import java.io.File

/**
 * Purely for development purposes. You can run the main method to test the parser.
 */
object Main {
    private val kotlinCoreEnvironment: KotlinCoreEnvironment by lazy {
        val disposable = Disposer.newDisposable()
        KotlinCoreEnvironment.createForProduction(
            disposable,
            CompilerConfiguration(),
            EnvironmentConfigFiles.JVM_CONFIG_FILES,
        )
    }

    /**
     * Parses the Code Connect file provided as the first argument.
     */
    @JvmStatic
    fun main(args: Array<String>) {
        val filePath = args.firstOrNull() ?: error("Please provide a file path")
        val tempFile = File(filePath)
        val parser = CodeConnectParser
        val file =
            LightVirtualFile("temp_file.kt", KotlinFileType.INSTANCE, tempFile.readText())
        val ktFile =
            PsiManager.getInstance(kotlinCoreEnvironment.project).findFile(file) as KtFile

        val docForFile = parser.parseFile((ktFile))

        println(docForFile)
    }
}
