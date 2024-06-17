package com.figma.code.connect.extensions

import com.figma.code.connect.CodeConnectParserException
import com.figma.code.connect.Figma
import com.figma.code.connect.FigmaChildren
import com.figma.code.connect.FigmaProperty
import com.figma.code.connect.FigmaType
import com.figma.code.connect.models.FigmaBoolean
import com.figma.code.connect.models.FigmaBooleanArgs
import com.figma.code.connect.models.FigmaChildrenProperty
import com.figma.code.connect.models.FigmaEnum
import com.figma.code.connect.models.FigmaEnumArgs
import com.figma.code.connect.models.FigmaInstance
import com.figma.code.connect.models.FigmaInstanceArgs
import com.figma.code.connect.models.FigmaString
import com.figma.code.connect.models.FigmaStringArgs
import com.figma.code.connect.models.PropertyMapping
import com.figma.code.connect.models.SourceLocation
import org.jetbrains.kotlin.com.intellij.openapi.editor.Document
import org.jetbrains.kotlin.psi.KtAnnotated
import org.jetbrains.kotlin.psi.KtAnnotationEntry
import org.jetbrains.kotlin.psi.KtBinaryExpression
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtClass
import org.jetbrains.kotlin.psi.KtConstantExpression
import org.jetbrains.kotlin.psi.KtDotQualifiedExpression
import org.jetbrains.kotlin.psi.KtElement
import org.jetbrains.kotlin.psi.KtExpression
import org.jetbrains.kotlin.psi.KtNamedFunction
import org.jetbrains.kotlin.psi.KtProperty
import org.jetbrains.kotlin.psi.psiUtil.referenceExpression

// Constants for property values
const val MAPPING_FUNCTION_NAME = "mapping"
const val FIGMA_PROPERTY_VALUE_PARAM = "value"
const val FIGMA_PROPERTY_TYPE_PARAM = "type"

enum class ValueMappingType {
    Enum,
    Boolean,
}

/**
 * Returns the first annotation entry that matches the provided name.
 *
 * @param name The name of the annotation to find.
 * @return The first matching annotation entry, or null if no match is found.
 */
fun KtAnnotated.getAnnotation(name: String): KtAnnotationEntry? {
    return annotationEntries.firstOrNull {
        it.typeReference?.text == name
    }
}

/**
 * Returns each annotation entry that matches the provided name.
 *
 * @param name The name of the annotation to find.
 * @return The first matching annotation entry, or null if no match is found.
 */
fun KtAnnotated.getAllAnnotations(name: String): List<KtAnnotationEntry> {
    return annotationEntries.filter {
        it.typeReference?.text == name
    }
}

/**
 * Finds and returns all @Composable functions within the class.
 */
fun KtClass.findComposableFunctions(): List<KtNamedFunction> {
    return this.declarations.filterIsInstance<KtNamedFunction>().filter { function ->
        function.annotationEntries.any { annotationEntry ->
            annotationEntry.typeReference?.text == "Composable"
        }
    }
}

/**
 * Retrieves the value of an annotation argument given a name and position. The name will always
 * take precedence over the position if both are provided.
 *
 * @param name The name of the argument to retrieve.
 * @param position The position of the argument in the annotation entry.
 * @return The value of the argument, or null if the argument does not exist.
 */
fun KtAnnotationEntry.getAnnotationValue(
    name: String,
    position: Int,
): String? {
    return valueArguments.firstOrNull {
        it.getArgumentName()?.asName?.asString() == name
    }?.getArgumentExpression()?.text
        ?: valueArguments.getOrNull(position)?.getArgumentExpression()?.text
}

fun KtAnnotationEntry.getAllAnnotationValues(): List<String> {
    return valueArguments.mapNotNull { it.getArgumentExpression()?.text }
}

/**
 * Retrieves the line number of the element in the document.
 *
 * @param document The document in which to find the line number.
 * @return The line number of the element, or null if the document is null.
 */
fun KtElement.getLineNumber(document: Document?): Int? {
    return document?.getLineNumber(this.textOffset)
}

/**
 * Extracts a boolean value from an expression.
 *
 * @return The boolean value of the constant expression, or null if the expression is not a constant expression.
 */
fun KtExpression.extractBooleanConstant(): Boolean? {
    return when (this) {
        is KtConstantExpression -> this.text?.toBoolean()
        else -> null
    }
}

/**
 * Checks if an expression is a nestable expression. Nestable expressions are a single function
 * declaration without any additional logic.
 *
 * @return True if the expression is a nestable expression, false otherwise.
 */
fun KtExpression.isNestableExpression(): Boolean {
    return children.size == 1 && children.first() is KtCallExpression
}

/**
 * Retrieves a value mapping from a `Figma.mapping` function call and turns it into a map.
 *
 * @param valueMappingType The type of value mapping to retrieve.
 * @return The value mapping, or null if the expression does not contain a valid value mapping.
 */
fun KtDotQualifiedExpression.getValueMapping(valueMappingType: ValueMappingType): Map<Any, Any>? {
    if (receiverExpression.text != Figma::class.simpleName ||
        selectorExpression?.referenceExpression()?.text != MAPPING_FUNCTION_NAME ||
        selectorExpression !is KtCallExpression
    ) {
        return null
    }
    val callExpression = selectorExpression as KtCallExpression
    return callExpression.valueArguments.mapNotNull { arg ->
        val expression = (arg.getArgumentExpression() as? KtBinaryExpression)
        expression?.let {
            val right = expression.right?.text
            val left: Any? =
                when (valueMappingType) {
                    ValueMappingType.Enum -> {
                        expression.left?.text
                    }

                    ValueMappingType.Boolean -> {
                        expression.left?.extractBooleanConstant()
                    }
                }
            if (left != null && right != null) {
                left to right
            } else {
                null
            }
        }
    }.toMap().takeIf { it.isNotEmpty() }
}

/**
 * Retrieves a Figma PropertyMapping given a property that has been annotated with @FigmaProperty.
 *
 * @param document The document in which to find the property.
 * @return The Figma property, or null if the property does not have a FigmaProperty annotation.
 */
fun KtProperty.getFigmaProperty(document: Document?): PropertyMapping? {
    annotationEntries.firstOrNull {
        it.typeReference?.text == FigmaProperty::class.simpleName
    }?.let {
        val value =
            it.getAnnotationValue(FIGMA_PROPERTY_VALUE_PARAM, 1) ?: throw CodeConnectParserException(
                "FigmaProperty annotation must have a value parameter",
                SourceLocation(containingKtFile.name, it.getLineNumber(document)),
            )
        val type =
            it.getAnnotationValue(FIGMA_PROPERTY_TYPE_PARAM, 0) ?: throw CodeConnectParserException(
                "FigmaProperty annotation must specify its type",
                SourceLocation(containingKtFile.name, it.getLineNumber(document)),
            )

        // Retrieve enum type after FigmaType
        val enumType = type.split(".").last()
        val figmaType = FigmaType.valueOf(enumType)
        return when (figmaType) {
            FigmaType.Text -> {
                FigmaString(
                    stringArgs =
                        FigmaStringArgs(
                            figmaPropName = value.removeSurrounding("\""),
                        ),
                )
            }

            FigmaType.Enum -> {
                val valueMapping =
                    (initializer as KtDotQualifiedExpression).getValueMapping(ValueMappingType.Enum)
                        ?: throw CodeConnectParserException(
                            "FigmaProperty annotation must have a mapping parameter for enum types",
                            SourceLocation(containingKtFile.name, it.getLineNumber(document)),
                        )

                FigmaEnum(
                    enumArgs =
                        FigmaEnumArgs(
                            figmaPropName = value.removeSurrounding("\""),
                            valueMapping = valueMapping.mapKeys { entry -> entry.key.toString() },
                        ),
                )
            }

            FigmaType.Boolean -> {
                val valueMapping = (initializer as? KtDotQualifiedExpression)?.getValueMapping(ValueMappingType.Boolean)
                FigmaBoolean(
                    booleanArgs =
                        FigmaBooleanArgs(
                            figmaPropName = value.removeSurrounding("\""),
                            valueMapping =
                                valueMapping?.mapKeys { entry ->
                                    entry.key.toString().toBoolean()
                                } ?: emptyMap(),
                        ),
                )
            }

            FigmaType.Instance -> {
                FigmaInstance(
                    instanceArgs =
                        FigmaInstanceArgs(
                            figmaPropName = value.removeSurrounding("\""),
                        ),
                )
            }
        }
    }

    // Parse @FigmaChildren entries
    annotationEntries.firstOrNull {
        it.typeReference?.text == FigmaChildren::class.simpleName
    }?.let {
        val layerNames =
            it.getAllAnnotationValues().map { layerName ->
                layerName.removeSurrounding("\"")
            }
        return FigmaChildrenProperty(
            childrenArgs =
                FigmaChildrenProperty.FigmaChildrenArgs(
                    layers = layerNames,
                ),
        )
    }
    return null
}
