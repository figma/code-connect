package com.figma.code.connect

import com.figma.code.connect.models.PropertyMappingType
import com.figma.code.connect.models.TemplateData
import org.jetbrains.kotlin.com.intellij.openapi.util.TextRange
import org.jetbrains.kotlin.psi.KtExpression
import org.jetbrains.kotlin.psi.KtReferenceExpression
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid
import org.jetbrains.kotlin.psi.KtValueArgumentName

class JSTemplateCreator {
    // Converts code and associated template data into the low level JavaScript template
    // that executes to present the code example on Figma.
    fun createTemplate(
        code: KtExpression,
        templateData: TemplateData,
    ): String {
        val propertyDefinitions =
            templateData.props?.map { (key, value) ->
                """
            const $key = ${value.jsPropertyDefinition}
            """
            }?.joinToString("\n") ?: ""

        return """
            const figma = require('figma')
            ${JSTemplateHelpers.renderComposeChildrenFunctionDefinition}
            $propertyDefinitions
            export default figma.kotlin`${replaceVariableReferences(code, templateData)}`
            """.trimIndent()
    }

    // Replaces property mapped variables to a template string that can be used in the low level JavaScript template
    // This is done by first identifying which variable usages are mapped to properties and recording their text ranges,
    // and then replacing those text ranges with the relevant template code..
    private fun replaceVariableReferences(
        bodyExpression: KtExpression,
        templateData: TemplateData,
    ): String {
        // create a mapping of placeholder names to their values that should be replaced in text
        val replacements = mutableMapOf<TextRange, String>()
        val instanceReplacements = mutableListOf<String>()

        // Find text ranges for elements that need to be replaced
        bodyExpression.accept(
            object : KtTreeVisitorVoid() {
                override fun visitReferenceExpression(expression: KtReferenceExpression) {
                    // If the reference expression is an argument label, skip it
                    if (expression.parent is KtValueArgumentName) {
                        return
                    }
                    val text = expression.text
                    val rangeRelativeToBodyExpression =
                        expression.textRange.shiftLeft(bodyExpression.textOffset)

                    templateData.props?.get(text)?.let {
                        when (it.kind) {
                            PropertyMappingType.String -> {
                                // String need to have additional quotes surrounding them
                                replacements[rangeRelativeToBodyExpression] = "\"\${$text.replace(/\\n/g, \"\\\\n\")}\""
                            }
                            // Nested `Children` need to have leading spacing appended to each
                            // element. In order to do this, we need to find the last newline
                            // before the expression and append the same amount of whitespace
                            // using a helper function.
                            PropertyMappingType.Children, PropertyMappingType.Instance -> {
                                // Update the text range to include the preceding whitespace

                                replacements[rangeRelativeToBodyExpression] = "__REPLACE_INSTANCE__${instanceReplacements.count()}__"
                                instanceReplacements.add(text)
                            }
                            else -> {
                                replacements[rangeRelativeToBodyExpression] = "\${$text}"
                            }
                        }
                    }
                    super.visitReferenceExpression(expression)
                }
            },
        )

        var code = bodyExpression.text
        // Replace text ranges with placeholders starting with the last text ranges
        replacements.keys.sortedByDescending { it.startOffset }.forEach { range ->
            val placeholder = replacements[range] ?: return code
            code = code.substring(0, range.startOffset) +
                placeholder + code.substring(range.endOffset)
        }
        code = code.removePrefix("{").removeSuffix("}").trimIndent()
        // In order to replace instance properties, we need to know the amount of preceding
        // whitespace before the expression. To do this, we do a second pass to find the
        // __REPLACE__INSTANCE__ placeholders and replace them with the correct amount of
        // whitespace.

        instanceReplacements.forEachIndexed { index, text ->
            val instance = templateData.props?.get(text)
            // Find the relevant string to replace
            val lookupString = "__REPLACE_INSTANCE__${index}__"
            val lookupIndex = code.indexOf(lookupString)
            // Find the leading whitespace after the last newline before the expression
            val lastNewlineIndexBeforeReplacement = code.lastIndexOf("\n", lookupIndex)
            val prefixIndex = if (lastNewlineIndexBeforeReplacement > -1) lastNewlineIndexBeforeReplacement + 1 else lookupIndex

            // If the prefix leading up to the preceding new line is only whitespace, we need to
            // prepend it to every line in the instance property.
            // Otherwise, do not add any extra whitespace (I.e it's likely a function parameter)
            val startReplacementIndex = if (code.substring(prefixIndex, lookupIndex).isBlank()) prefixIndex else lookupIndex
            val prefix = code.substring(startReplacementIndex, lookupIndex)

            code =
                code.replaceRange(
                    startReplacementIndex,
                    lookupIndex + lookupString.count(),
                    JSTemplateHelpers.renderComposeChildrenFunctionCall(variableName = text, prefix = prefix),
                )
        }
        return code
    }
}
