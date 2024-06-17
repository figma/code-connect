package com.figma.code.connect.models

import kotlinx.serialization.Serializable

@Serializable
data class CodeConnectCreatorCreatedFile(
    val filePath: String,
)

@Serializable
data class CodeConnectCreationOutput(
    val createdFiles: List<CodeConnectCreatorCreatedFile>,
    val messages: List<CodeConnectParserMessage>,
)
