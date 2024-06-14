package com.figma.code.connect

import com.figma.code.connect.extensions.findComposableFunctions
import com.figma.code.connect.extensions.getAllAnnotations
import com.figma.code.connect.extensions.getAnnotation
import com.figma.code.connect.extensions.getAnnotationValue
import com.figma.code.connect.extensions.getFigmaProperty
import com.figma.code.connect.extensions.getLineNumber
import com.figma.code.connect.extensions.isNestableExpression
import com.figma.code.connect.models.CodeConnectDocument
import com.figma.code.connect.models.CodeConnectParserMessage
import com.figma.code.connect.models.PropertyMapping
import com.figma.code.connect.models.SourceLocation
import com.figma.code.connect.models.TemplateData
import org.jetbrains.kotlin.com.intellij.openapi.editor.Document
import org.jetbrains.kotlin.com.intellij.psi.PsiDocumentManager
import org.jetbrains.kotlin.psi.KtBlockExpression
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtClass
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtNamedFunction
import org.jetbrains.kotlin.psi.KtProperty
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid

class CodeConnectParserException(message: String, sourceLocation: SourceLocation) : Exception(
    "$message at ${sourceLocation.file}:${sourceLocation.line}",
)

data class CodeConnectParserResult(
    val docs: List<CodeConnectDocument>,
    val messages: List<CodeConnectParserMessage>,
    val functionLineNumbers: Map<String, Int>,
)

/**
 * This class is responsible for parsing Kotlin files with @FigmaConnect annotations and converting
 * them into a format that can be sent up to the code connect server.
 */
object CodeConnectParser {
    private val templateCreator = JSTemplateCreator()

    /**
     * Parses a given Kotlin file and returns a CodeConnectParserOutput.
     * The output contains a list of CodeConnectDocuments and a list of CodeConnectParserMessages.
     * One file may have many @FigmaConnect classes, each of which will be represented as a
     * CodeConnectDocument.
     *
     * @param file The Kotlin file to parse.
     * @return A CodeConnectParserOutput containing the parsed information.
     */
    fun parseFile(file: KtFile): CodeConnectParserResult {
        val codeConnectDocuments = mutableListOf<CodeConnectDocument>()
        val messages = mutableListOf<CodeConnectParserMessage>()
        val functionLineNumbers = mutableMapOf<String, Int>()

        val documentManager = PsiDocumentManager.getInstance(file.project)
        val document = documentManager.getDocument(file)
        // Find classes annotated with @FigmaConnect
        file.accept(
            object : KtTreeVisitorVoid() {
                override fun visitClass(klass: KtClass) {
                    FigmaConnect::class.simpleName?.let { annotationName ->
                        klass.getAnnotation(annotationName)?.let {
                            val result = parseFigmaConnectClass(klass, document)
                            codeConnectDocuments.addAll(result.docs)
                            messages.addAll(result.messages)
                        }
                    }
                    super.visitClass(klass)
                }

                // Find definitions of @Composable functions outside the scope of a Code Connect doc.
                override fun visitNamedFunction(function: KtNamedFunction) {
                    function.getAnnotation("Composable")?.let {
                        function.name?.let { name ->
                            function.getLineNumber(document)?.let {
                                functionLineNumbers[name] = it
                            }
                        }
                    }
                    super.visitNamedFunction(function)
                }
            },
        )

        return CodeConnectParserResult(codeConnectDocuments, messages, functionLineNumbers)
    }

    /**
     * Parses a class annotated with @FigmaConnect and returns a CodeConnectParserOutput.
     *
     * @param klass The class to parse.
     * @param document The document associated with the class.
     * @return A CodeConnectParserOutput containing the parsed information.
     */
    private fun parseFigmaConnectClass(
        klass: KtClass,
        document: Document?,
    ): CodeConnectParserResult {
        val codeConnections = mutableListOf<CodeConnectDocument>()
        FigmaConnect::class.simpleName?.let { annotationName ->
            klass.getAnnotation(annotationName)?.let {
                val properties = parseProperties(klass, document)
                val url =
                    it.getAnnotationValue("url", 0)?.removeSurrounding("\"")
                        ?: throw CodeConnectParserException(
                            "FigmaConnect annotation must have a url parameter",
                            SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                        )

                val composable =
                    klass.findComposableFunctions().firstOrNull()
                        ?: throw CodeConnectParserException(
                            "FigmaConnect annotated class did not have a valid @Composable function definition",
                            SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                        )

                val code =
                    composable.bodyExpression ?: throw CodeConnectParserException(
                        "FigmaConnect annotated class did not have a valid @Composable function definition",
                        SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                    )

                // Use the top level documentation name as the fallback
                var component = composable.name
                (code as KtBlockExpression).let { expression ->
                    // Find the first function call in the code block an assume that is the component
                    (code.children.firstOrNull { child -> child is KtCallExpression } as? KtCallExpression).let { functionCall ->
                        component = functionCall?.calleeExpression?.text ?: component
                    }
                }

                val templateData =
                    TemplateData(
                        props = properties,
                        nestable = code.isNestableExpression(),
                    )

                codeConnections.add(
                    CodeConnectDocument(
                        component = component,
                        figmaNode = url,
                        template = templateCreator.createTemplate(code, templateData),
                        templateData = templateData,
                        variant = parseVariantsForClass(klass, document),
                    ),
                )
            }
        }
        return CodeConnectParserResult(codeConnections, emptyList(), emptyMap())
    }

    /**
     * Parses @FigmaVariant annotations from a class and returns a map of the variants.
     *
     * @param klass The class to parse.
     * @return A map of the variants.
     */
    private fun parseVariantsForClass(
        klass: KtClass,
        document: Document?,
    ): Map<String, Any> {
        val variants = mutableMapOf<String, Any>()

        FigmaVariant::class.simpleName?.let { annotationName ->
            klass.getAllAnnotations(annotationName).forEach {
                val key =
                    it.getAnnotationValue("key", 0)?.removeSurrounding("\"")
                        ?: throw CodeConnectParserException(
                            "FigmaVariant annotation must have a key parameter",
                            SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                        )

                val value =
                    it.getAnnotationValue("value", 1)?.removeSurrounding("\"")
                        ?: throw CodeConnectParserException(
                            "FigmaVariant annotation must have a value parameter",
                            SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                        )
                variants[key] = value
            }
        }

        FigmaBooleanVariant::class.simpleName?.let { annotationName ->
            klass.getAnnotation(annotationName)?.let {
                val key =
                    it.getAnnotationValue("key", 0)?.removeSurrounding("\"")
                        ?: throw CodeConnectParserException(
                            "FigmaBooleanVariant annotation must have a key parameter",
                            SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                        )

                val value =
                    it.getAnnotationValue("value", 1)
                        ?: throw CodeConnectParserException(
                            "FigmaBooleanVariant annotation must have a value parameter",
                            SourceLocation(klass.containingKtFile.name, it.getLineNumber(document)),
                        )
                variants[key] = value.toBoolean()
            }
        }
        return variants
    }

    /**
     * Parses @FigmaProperty property mappings from a class and returns a TemplateData object.
     * The TemplateData object contains a map of properties associated with the class.
     *
     * @param klass The class to parse.
     * @param document The document associated with the class.
     * @return A TemplateData object containing the parsed information.
     */
    private fun parseProperties(
        klass: KtClass,
        document: Document?,
    ): Map<String, PropertyMapping> {
        val propMap = mutableMapOf<String, PropertyMapping>()
        klass.declarations.filterIsInstance<KtProperty>().forEach {
            it.getFigmaProperty(document)?.let { intrinsic ->
                propMap[it.name.toString()] = intrinsic
            }
        }
        return propMap
    }
}
