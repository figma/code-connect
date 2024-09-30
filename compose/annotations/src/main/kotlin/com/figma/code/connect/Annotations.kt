package com.figma.code.connect

import kotlin.annotation.AnnotationTarget.CLASS
import kotlin.annotation.AnnotationTarget.PROPERTY

/**
 * An annotation that defines a Code Connect document. The URL should point to the top level component
 * or component set in Figma that this file should link to, which includes the node id. (I.e the URL
 * will be in the form of https://www.figma.com/design/<File ID>/<FileName>?node-id=<Node id>). This
 * URL can be found by right clicking on a component in Figma and selecting "Copy link to Selection".
 *
 * Inside of this class, the first @Composable function will be used to link its code to the Figma component.
 */
@Target(CLASS)
annotation class FigmaConnect(val url: String)

/**
 * An optional annotation that defines which variants a Code Connect document should apply to.
 * If there are multiple classes that are annotated with @FigmaConnect and have the same url,
 * the component that matches the most @FigmaVariant and @FigmaBooleanVariant annotations will be shown.
 */
@Repeatable
@Target(CLASS)
annotation class FigmaVariant(val key: String, val value: String)

/**
 * An optional annotation that defines which boolean properties a Code Connect document should apply to.
 * If there are multiple classes that are annotated with @FigmaConnect and have the same url,
 * the component that matches the most @FigmaVariant and @FigmaBooleanVariant annotations will be shown.
 */
@Repeatable
@Target(CLASS)
annotation class FigmaBooleanVariant(val key: String, val value: Boolean)

/**
 * An annotation that defines a property that should be linked to a Figma property. The type
 * parameter should be one of the supported types, and the value parameter should be the name of
 * the property in Figma. When a variable annotated with @FigmaProperty is used inside of the
 * @Composable definition, the value will be replaced with the value from Figma based on how the
 * variable is defined. The ways that properties can be mapped are defined under `FigmaType`
 */
@Target(PROPERTY)
annotation class FigmaProperty(val type: FigmaType, val value: String)

/**
 * Annotates a property with the names of the children layers in Figma. This is used to map nested
 * instances in a component that have their own Code Connect annotations.
 *
 * For example,
 *
 * ```
 * @FigmaChildren("Header", "Row")
 * val children: @Composable () -> Unit = {}
 *
 * @Composable
 * fun ColumnDocument() {
 *     Column {
 *        children
 *     }
 * }
 * ```
 *
 * In this example, the `Column` component has children layers named "Header" and "Row" in Figma.
 * These have their own associated @FigmaConnect annotation, so in Figma, these layers will be
 * rendered inline in the `Column` component.
 *
 * Note that the nested instances must be connected separately.
 */
@Target(PROPERTY)
annotation class FigmaChildren(vararg val layerNames: String)

enum class FigmaType {
    /**
     * A text property in Figma. This is used to map to Strings so that any usages of a @FigmaProperty
     * with this type will be replaced with the text value from Figma.
     */
    Text,

    /**
     * A boolean property in Figma. This is used to map Boolean properties in figma. If `Figma.mapping`
     * is provided, the value will be replaced with the mapped value. If not, the value will be replaced
     * with the corresponding primitive boolean value.
     */
    Boolean,

    /**
     * An instance swap property in Figma. This is used to map to another Code Connect annotated
     * component. If the swapped instance has its own Code Connect example, it will be rendered
     * inline in the example.
     */
    Instance,

    /**
     * A mapping between Variant properties in Figma. The property that is annotated with
     * @FigmaProperty should use the `Figma.mapping` function to define the mapping between the
     * variants in Figma to the corresponding code.
     */
    Enum,
}

object Figma {
    /**
     * This function is used to define the mapping of a value in Figma to a value in code.
     * This is used for Boolean and Enum mappings where you do not want to map a value directly from Figma
     * to code, but instead want to define a mapping between the two. For example, if you have
     * a Variant property in Figma named "Style" with values "Default" and "Secondary", you might
     * use this to define a mapping to your styles in code. as follows:
     *
     * @FigmaProperty(FigmaType.Enum, "Style")
     * val style: ButtonStyle = Figma.mapping(
     *    "Default" to ButtonStyle.Primary,
     *    "Secondary" to ButtonStyle.Secondary,
     *  )
     *
     *  @Composable
     *  fun Example() {
     *      Button(style = style)
     *  }
     *
     *  In Figma, when you are viewing an instance with variant `Style` = `Default`, the Code Connect
     *  example will show `Button(style = ButtonStyle.Primary)`. When the variant is `Secondary`,
     *  it will show `Button(style = ButtonStyle.Secondary)`.
     *
     *  This can also be used to map boolean properties in Figma, in this case, the key would be
     *  a boolean.
     *
     */
    fun <K, V> mapping(vararg pairs: Pair<K, V>): V {
        return pairs.first().second
    }
}
