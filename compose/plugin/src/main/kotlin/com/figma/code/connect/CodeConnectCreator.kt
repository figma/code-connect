package com.figma.code.connect

import com.figma.code.connect.models.CodeConnectCreationOutput
import com.figma.code.connect.models.CodeConnectCreatorCreatedFile
import com.figma.code.connect.models.CodeConnectParserCreateInput
import com.figma.code.connect.models.ComponentPropertyDefinitionType.BOOLEAN
import com.figma.code.connect.models.ComponentPropertyDefinitionType.INSTANCE_SWAP
import com.figma.code.connect.models.ComponentPropertyDefinitionType.TEXT
import com.figma.code.connect.models.ComponentPropertyDefinitionType.VARIANT
import com.squareup.kotlinpoet.AnnotationSpec
import com.squareup.kotlinpoet.ClassName
import com.squareup.kotlinpoet.CodeBlock
import com.squareup.kotlinpoet.FileSpec
import com.squareup.kotlinpoet.FunSpec
import com.squareup.kotlinpoet.LambdaTypeName
import com.squareup.kotlinpoet.PropertySpec
import com.squareup.kotlinpoet.TypeSpec
import com.squareup.kotlinpoet.withIndent
import java.io.File

// Cleans up property names & values in figma which are appended with a # followed by the node id.
fun String.normalizeFigmaName(): String {
    return this.replace("#[0-9:]*".toRegex(), "")
}

fun String.convertPropertyNameToCamelCase(): String {
    val name =
        this.replace("#[0-9:]*".toRegex(), "")
            .replace("[^a-zA-Z0-9]".toRegex(), " ")
            .split(" ")
            .joinToString("") { word ->
                word.replaceFirstChar { it.uppercase() }
            }
            .replace("^[0-9]".toRegex()) { "_${it.value}" }
            .replaceFirstChar { it.lowercase() }

    return name
}

object CodeConnectCreator {
    fun create(codeConnectParserCreateInput: CodeConnectParserCreateInput): CodeConnectCreationOutput {
        val file =
            FileSpec.builder(
                "",
                codeConnectParserCreateInput.destinationFile
                    ?: (codeConnectParserCreateInput.component.normalizedName + ".figma"),
            ).indent("    ") // Sets the indent as 4 spaces.

        // Create the top level component class.
        val documentClass =
            TypeSpec.classBuilder(codeConnectParserCreateInput.component.normalizedName + "Doc")
                .addAnnotation(
                    AnnotationSpec.builder(FigmaConnect::class)
                        .addMember("%S", codeConnectParserCreateInput.component.figmaNodeUrl)
                        .build(),
                )

        // Create the component properties.
        codeConnectParserCreateInput.component.componentPropertyDefinitions?.forEach { (rawName, value) ->
            val name = rawName.normalizeFigmaName()
            val propertyName = name.convertPropertyNameToCamelCase()
            val property =
                when (value.type) {
                    TEXT -> {
                        PropertySpec.builder(propertyName, String::class)
                            .addAnnotation(
                                figmaPropertyAnnotationBuilder(
                                    FigmaType.Text,
                                    name,
                                ),
                            )
                            .initializer("%S", value.defaultValue)
                    }

                    BOOLEAN -> {
                        PropertySpec.builder(propertyName, Boolean::class)
                            .addAnnotation(
                                figmaPropertyAnnotationBuilder(
                                    FigmaType.Boolean,
                                    name,
                                ),
                            )
                            .initializer(if (value.defaultValue == true) "true" else "false")
                    }

                    INSTANCE_SWAP -> {
                        val lambdaTypeName =
                            LambdaTypeName.get(
                                returnType = ClassName("kotlin.Unit", "Unit"),
                            ).copy(
                                annotations =
                                    listOf(
                                        AnnotationSpec.builder(
                                            ClassName(
                                                "androidx.compose.runtime",
                                                "Composable",
                                            ),
                                        ).build(),
                                    ),
                            )

                        PropertySpec.builder(propertyName, lambdaTypeName)
                            .addAnnotation(
                                figmaPropertyAnnotationBuilder(
                                    FigmaType.Instance,
                                    name,
                                ),
                            )
                            .initializer("{}")
                    }

                    VARIANT -> {
                        // Add the import for the Figma mapping function.
                        file.addImport("com.figma.code.connect", "Figma")

                        val codeBlock =
                            CodeBlock.builder()
                                .addStatement("Figma.mapping(")
                                .withIndent {
                                    value.variantOptions?.forEach { variantOption ->
                                        addStatement("\"$variantOption\" to \"$variantOption\",")
                                    }
                                }

                        codeBlock.addStatement(")")

                        PropertySpec.builder(propertyName, String::class)
                            .addAnnotation(
                                figmaPropertyAnnotationBuilder(
                                    FigmaType.Enum,
                                    name,
                                ),
                            ).initializer(codeBlock.build())
                    }
                }.build()

            documentClass.addProperty(property)
        }

        // Create the component function.
        documentClass.addFunction(
            FunSpec.builder("ComponentExample")
                .addAnnotation(ClassName("androidx.compose.runtime", "Composable"))
                .addCode("/* Add your component code here. */")
                .build(),
        )
        file.addType(documentClass.build())

        // Write the file to the destination directory.
        file.build().writeTo(File(codeConnectParserCreateInput.destinationDir))

        val fileName =
            codeConnectParserCreateInput.destinationFile
                ?: (codeConnectParserCreateInput.component.normalizedName + ".figma.kt")
        return CodeConnectCreationOutput(
            createdFiles =
                listOf(
                    CodeConnectCreatorCreatedFile(
                        filePath = fileName,
                    ),
                ),
            messages = emptyList(),
        )
    }

    private fun figmaPropertyAnnotationBuilder(
        type: FigmaType,
        value: String,
    ): AnnotationSpec {
        return AnnotationSpec.builder(FigmaProperty::class)
            .addMember("%T.%L, %S", FigmaType::class, type, value)
            .build()
    }
}
