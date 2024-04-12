import Foundation

enum ValidationNetworkError: LocalizedError {
    case failedToCreateRequest
    case unknownNetworkError
    case networkRequestFailed(errorCode: Int, description: String?)
    case failedToParseResponse(nodes: [String])

    var errorDescription: String? {
        switch self {
        case .failedToCreateRequest:
            return "Failed to create a request to validate nodes."
        case .unknownNetworkError:
            return "An error occurred while making a request to validate nodes."
        case .networkRequestFailed(let errorCode, let description):
            return "Failed to retrieve the file from Figma -- Received a \(errorCode) status code \(description ?? "")"
        case .failedToParseResponse(let nodes):
            return "Failed to parse the response of the validation request for nodes: \(nodes.joined(separator: ","))"
        }
    }
}

enum FigmaValidationError: LocalizedError {
    case couldNotFindAFigmaNodeUrl
    case invalidFigmaNodeUrl(url: String)
    case noFileKeyInUrl(url: String)
    case noNodesInUrl(url: String)
    case nodeNotFoundInFile(component: String, node: String)
    case nodeIsNotComponentOrComponentSet(component: String, node: String)
    case nodeIsNotTopLevelComponentOrComponentSet(component: String, node: String)
    case propertyAnnotatedDoesNotExist(propertyName: String, url: String)
    case variantDoesNotExistOnComponent(variantName: String, url: String)
    case invalidVariantValue(variantName: String, variantValue: String, url: String)
    case unknown

    var errorDescription: String? {
        switch self {
        case .couldNotFindAFigmaNodeUrl:
            return "Couldn't find a figma node url to validate."
        case .invalidFigmaNodeUrl(let url):
            return "\(url) was an improperly formatted link to a selected node."
        case .noFileKeyInUrl(let url):
            return "Failed to get file from url: \(url)"
        case .noNodesInUrl(url: let url):
            return "Failed to get figma node from url: \(url)"
        case .nodeNotFoundInFile(let component, let node):
            return "Validation failed for \(component): Node \(node) not found in the file"
        case .nodeIsNotComponentOrComponentSet(let component, let node):
            return "Validation failed for \(component): Node \(node) is not a component or component set"
        case .nodeIsNotTopLevelComponentOrComponentSet(let component, let node):
            return "Validation failed for \(component): Node \(node) is not a top level component or component set (Is it a variant?)."
        case .propertyAnnotatedDoesNotExist(let propertyName, let url):
            return "The property \(propertyName) was not found on the node in \(url)"
        case .variantDoesNotExistOnComponent(let variantName, let url):
            return "The variant \(variantName) was not found on the node in \(url)"
        case .invalidVariantValue(let variantName, let variantValue, let url):
            return "The variant \(variantName) has no corresponding value: \(variantValue) in \(url)"
        case .unknown:
            return "An unknown failure occurred"
        }
    }
}

struct ValidationResponse: Decodable {
    struct Component: Decodable {
        let componentSetId: String?
    }

    struct Document: Decodable {
        enum CodingKeys: String, CodingKey {
            case nodeType = "type", componentProperties = "componentPropertyDefinitions"
        }

        let nodeType: String?
        let componentProperties: [String: ComponentProperty]?
    }

    struct NodeInfo: Decodable {
        let components: [String: ValidationResponse.Component]?
        let document: ValidationResponse.Document?
    }

    let nodes: [String: NodeInfo]
}

public struct Validation {
    // On Figma, we treat string variants as boolean properties as a holdover from before boolean properties exist.
    static let allowableBooleanValues = Set(["True", "False", "Yes", "No"])
    // Convert figma prop names into their string representation.
    static func normalizeFigmaPropName(
        propName: String,
        propertyDefinition: ComponentProperty
    ) -> String {
        if propertyDefinition.type == .variant {
            return propName
        }

        // Non-variant property names are of the form "name#id"
        // We have to take the last one in case the name contains #'s
        guard let lastIndex = propName.lastIndex(of: "#") else {
            return propName
        }
        return String(propName.prefix(upTo: lastIndex))
    }

    static func componentPropertyMatching(
        _ propertyName: String,
        in componentProperties: [String: ComponentProperty]
    ) -> String? {
        return componentProperties.keys.first(where: { figmaPropName in
            guard let componentProperty = componentProperties[figmaPropName] else {
                return false
            }
            let name = normalizeFigmaPropName(propName: figmaPropName, propertyDefinition: componentProperty)
            return name == propertyName
        })
    }

    static func validateProps(
        for file: CodeConnectRequestBody,
        document: ValidationResponse.Document
    ) throws {
        // Check to make sure every prop name exists
        for (_, filePropMap) in file.templateData.props {
            guard let componentProperties = document.componentProperties,
                  componentPropertyMatching(filePropMap.args.figmaPropName, in: componentProperties) != nil
            else {
                throw FigmaValidationError.propertyAnnotatedDoesNotExist(
                    propertyName: filePropMap.args.figmaPropName,
                    url: file.figmaNode
                )
            }
        }
    }

    static func validateVariantRestrictions(
        for file: CodeConnectRequestBody,
        document: ValidationResponse.Document
    ) throws {
        for (fileVariantName, variantValue) in file.variant {
            guard let componentProperties = document.componentProperties,
                  let variantName = componentPropertyMatching(fileVariantName, in: componentProperties),
                  let variantProperty = componentProperties[variantName]
            else {
                throw FigmaValidationError.variantDoesNotExistOnComponent(
                    variantName: fileVariantName,
                    url: file.figmaNode
                )
            }
            guard variantProperty.variantOptions?.contains(where: { variantProperty in
                switch variantValue {
                case .bool(let bool):
                    return allowableBooleanValues.contains(variantProperty) || variantProperty == String(bool)
                case .string(let string):
                    return variantProperty == string
                }
            }) ?? false else {
                throw FigmaValidationError.invalidVariantValue(
                    variantName: fileVariantName,
                    variantValue: variantValue.toString(),
                    url: file.figmaNode
                )
            }
        }
    }

    public static func validateCodeConnectFiles(
        _ files: [CodeConnectRequestBody],
        token: String
    ) async throws -> Bool {
        guard let firstValidUrlDoc = files.first(where: { URL(string: $0.figmaNode) != nil }),
              let nodeUrl = URL(string: firstValidUrlDoc.figmaNode)
        else {
            if let anyUrl = files.first?.figmaNode {
                throw FigmaValidationError.invalidFigmaNodeUrl(url: anyUrl)
            } else {
                throw FigmaValidationError.couldNotFindAFigmaNodeUrl
            }
        }

        //  One node could have multiple FCC files due to variants.
        var fileKeyToNodes: [String: [String: [CodeConnectRequestBody]]] = [:]

        // URL Level validation: Verify the file key and node id exists
        try files.forEach { file in
            guard let fileKey = try? parseFileKey(from: file.figmaNode) else {
                throw FigmaValidationError.noFileKeyInUrl(url: file.figmaNode)
            }
            guard let nodeId = try? parseNodeId(from: file.figmaNode) else {
                throw FigmaValidationError.noNodesInUrl(url: file.figmaNode)
            }
            fileKeyToNodes[fileKey, default: [:]][nodeId, default: []].append(file)
        }

        for fileKey in fileKeyToNodes.keys {
            guard let nodeToFiles = fileKeyToNodes[fileKey] else { continue }
            let nodeIds = Array(nodeToFiles.keys)
            guard let request = try FigmaAPIRoute.nodes(fileKey: fileKey, nodeIds: nodeIds).createFigmaAPIRequest(token: token, nodeUrl: nodeUrl, body: nil) else {
                throw ValidationNetworkError.failedToCreateRequest
            }

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw ValidationNetworkError.unknownNetworkError
            }

            guard httpResponse.statusCode == 200 else {
                let description = String(data: data, encoding: .utf8)
                throw ValidationNetworkError.networkRequestFailed(errorCode: httpResponse.statusCode, description: description)
            }
            guard let response = try? JSONDecoder().decode(ValidationResponse.self, from: data) else {
                throw ValidationNetworkError.failedToParseResponse(nodes: nodeIds)
            }

            for (nodeId, files) in nodeToFiles {
                for fileToValidate in files {
                    guard let nodeInfo = response.nodes[nodeId] else {
                        throw FigmaValidationError.nodeNotFoundInFile(
                            component: fileToValidate.component,
                            node: nodeId
                        )
                    }
                    try validateFile(fileToValidate, nodeInfo: nodeInfo, nodeId: nodeId)
                }
            }
        }

        return true
    }

    static func validateFile(
        _ file: CodeConnectRequestBody,
        nodeInfo: ValidationResponse.NodeInfo,
        nodeId: String
    ) throws {
        // Validate that the nodeInfo contains a document
        guard let document = nodeInfo.document else {
            throw FigmaValidationError.nodeNotFoundInFile(component: file.component, node: nodeId)
        }

        // Validate that the document type is component or component set
        guard let nodeType = document.nodeType, nodeType == "COMPONENT" || nodeType == "COMPONENT_SET" else {
            throw FigmaValidationError.nodeIsNotComponentOrComponentSet(component: file.component, node: nodeId)
        }

        // If the component contains a componentSetId that means it's a part of a component set.
        if let components = nodeInfo.components,
           let component = components[nodeId],
           component.componentSetId != nil {
            throw FigmaValidationError.nodeIsNotTopLevelComponentOrComponentSet(component: file.component, node: nodeId)
        }

        try validateProps(for: file, document: document)
        try validateVariantRestrictions(for: file, document: document)
    }

    static func parseNodeId(from figmaNodeUrl: String) throws -> String {
        let nodeComponents = URLComponents(string: figmaNodeUrl)
        guard let nodeIdComponent = nodeComponents?.queryItems?.first(where: { $0.name == "node-id" }),
              let nodeId = nodeIdComponent.value
        else {
            throw FigmaValidationError.invalidFigmaNodeUrl(url: figmaNodeUrl)
        }
        return nodeId.replacingOccurrences(of: "-", with: ":")
    }

    static func parseFileKey(from figmaNodeUrl: String) throws -> String {
        guard let url = URL(string: figmaNodeUrl),
              let fileOrDesignComponent = url.pathComponents.firstIndex(of: "file") ?? url.pathComponents.firstIndex(of: "design"),
              let fileId = url.pathComponents[safe: fileOrDesignComponent + 1]
        else { throw FigmaValidationError.invalidFigmaNodeUrl(url: figmaNodeUrl) }
        return String(fileId)
    }
}
