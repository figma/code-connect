package com.figma.code.connect.models

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Polymorphic
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// This file describes types that can be used for property mappings.
@Serializable
enum class PropertyMappingType {
    @SerialName("string")
    String,

    @SerialName("enum")
    Enum,

    @SerialName("boolean")
    Boolean,

    @SerialName("instance")
    Instance,

    @SerialName("children")
    Children,
}

@Polymorphic
@Serializable(with = PropertyMapperPolymorphicSerialize::class)
sealed interface PropertyMapping {
    // The kind of property mapping
    val kind: PropertyMappingType

    // Optional arguments for the property mapping
    val args: Map<String, Any>

    // The string describing the property definition in the low level JavaScript template
    val jsPropertyDefinition: String
}

@Serializable
data class FigmaString(
    override val kind: PropertyMappingType = PropertyMappingType.String,
    @SerialName("args")
    val stringArgs: FigmaStringArgs,
) : PropertyMapping {
    override val args: Map<String, Any>
        get() = mapOf("figmaPropName" to stringArgs.figmaPropName)

    override val jsPropertyDefinition: String
        get() = "figma.properties.string('${stringArgs.figmaPropName}')"
}

@Serializable
data class FigmaStringArgs(
    val figmaPropName: String,
)

@Serializable
data class FigmaEnum(
    override val kind: PropertyMappingType = PropertyMappingType.Enum,
    @SerialName("args")
    val enumArgs: FigmaEnumArgs,
) : PropertyMapping {
    override val args: Map<String, Any>
        get() =
            mapOf(
                "figmaPropName" to enumArgs.figmaPropName,
                "valueMapping" to enumArgs.valueMapping,
            )

    override val jsPropertyDefinition: String
        get() {
            val functionParam = valueMappingToFunctionParamJs(enumArgs.valueMapping)

            return """
figma.properties.enum('${enumArgs.figmaPropName}', {
    $functionParam
})
                """.trimMargin().trimIndent()
        }
}

@Serializable
data class FigmaEnumArgs(
    val figmaPropName: String,
    val valueMapping: Map<
        String,
        @Serializable(AnySerializer::class)
        Any,
        >,
)

fun <T> valueMappingToFunctionParamJs(valueMapping: Map<T, Any>): String {
    return valueMapping.entries.joinToString(",\n") { (key, value) ->
        "$key: '${escapeJavaScriptString(value.toString())}'"
    }
}

/**
 * Escapes a string for use in a JavaScript single-quoted string literal.
 * This provides comprehensive escaping for all special characters, control characters,
 * and Unicode line terminators that could cause issues in JavaScript.
 *
 * Security: This prevents XSS attacks by escaping characters that could break out of
 * string literals or inject malicious code.
 */
fun escapeJavaScriptString(str: String): String {
    return str
        // CRITICAL: Backslash must be escaped first to avoid double-escaping
        .replace("\\", "\\\\")
        
        // Quote characters - prevent breaking out of string literals
        .replace("'", "\\'")
        .replace("\"", "\\\"")
        .replace("`", "\\`")
        
        // Standard escape sequences - for proper display/formatting
        .replace("\n", "\\n")   // Newline (LF)
        .replace("\r", "\\r")   // Carriage return (CR)
        .replace("\t", "\\t")   // Tab
        .replace("\b", "\\b")   // Backspace
        .replace("\u000C", "\\f") // Form feed
        
        // Unicode line terminators - can break JavaScript in some contexts
        // These are treated as line terminators by JavaScript but not by JSON
        .replace("\u2028", "\\u2028") // Line separator
        .replace("\u2029", "\\u2029") // Paragraph separator
        
        // Null byte - can cause issues in C-based JavaScript engines
        .replace("\u0000", "\\u0000")
}

@Serializable
data class FigmaBoolean(
    override val kind: PropertyMappingType = PropertyMappingType.Boolean,
    @SerialName("args")
    val booleanArgs: FigmaBooleanArgs,
) : PropertyMapping {
    override val args: Map<String, Any>
        get() =
            mapOf(
                "figmaPropName" to booleanArgs.figmaPropName,
                "valueMapping" to booleanArgs.valueMapping,
            )

    override val jsPropertyDefinition: String
        get() {
            val functionParams =
                if (booleanArgs.valueMapping.isEmpty()) {
                    valueMappingToFunctionParamJs(mapOf(true to true, false to false))
                } else {
                    valueMappingToFunctionParamJs(booleanArgs.valueMapping)
                }
            return """
                figma.properties.boolean('${booleanArgs.figmaPropName}', {
                    $functionParams
                })
                """.trimIndent()
        }
}

@Serializable
data class FigmaBooleanArgs(
    val figmaPropName: String,
    val valueMapping: Map<
        Boolean,
        @Serializable(AnySerializer::class)
        Any,
        >,
)

@Serializable
data class FigmaInstance(
    override val kind: PropertyMappingType = PropertyMappingType.Instance,
    @SerialName("args") val instanceArgs: FigmaInstanceArgs,
) : PropertyMapping {
    override val args: Map<String, Any>
        get() = mapOf("figmaPropName" to instanceArgs.figmaPropName)

    override val jsPropertyDefinition: String
        get() = "figma.properties.instance('${instanceArgs.figmaPropName}')"
}

@Serializable
data class FigmaInstanceArgs(
    val figmaPropName: String,
)

@Serializable
data class FigmaChildrenProperty(
    override val kind: PropertyMappingType = PropertyMappingType.Children,
    @SerialName("args") val childrenArgs: FigmaChildrenArgs,
) : PropertyMapping {
    @Serializable
    data class FigmaChildrenArgs(
        val layers: List<String>,
    )

    override val args: Map<String, Any>
        get() = mapOf("layers" to childrenArgs.layers)

    override val jsPropertyDefinition: String
        get() = "figma.properties.children([${childrenArgs.layers.joinToString(", ") { "'$it'" }}])"
}

@Serializable
data class TemplateData(
    // Map of information describing the props used by the template.
    // This is used by the CLI to validate props before publishing.
    val props: Map<String, PropertyMapping>? = null,
    // Optional array of imports for this component. These are prepended
    // to the example code.
    var imports: List<String> = emptyList(),
    // Whether the example should be rendered inline if it's a nested instance. Otherwise, it'll
    // be rendered as a pill that can be clicked to view the instance instead.
    val nestable: Boolean = false,
)

object PropertyMapperPolymorphicSerialize : JsonContentPolymorphicSerializer<PropertyMapping>(PropertyMapping::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<PropertyMapping> {
        val kind = element.jsonObject["kind"]
        return when (kind?.jsonPrimitive?.content) {
            "String" -> FigmaString.serializer()
            "Enum" -> FigmaEnum.serializer()
            "Boolean" -> FigmaBoolean.serializer()
            "Instance" -> FigmaInstance.serializer()
            "Children" -> FigmaChildrenProperty.serializer()
            else -> throw IllegalArgumentException("Unknown kind: $kind")
        }
    }
}
