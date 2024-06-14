#if os(macOS)
import Foundation

extension String {
    func appendingPathComponent(_ pathComponent: String) -> String {
        if self.isEmpty {
            return pathComponent
        }
        let pathComponent = pathComponent.hasPrefix("/") ? String(pathComponent.dropFirst()) : pathComponent
        if self.hasSuffix("/") {
            return self + pathComponent
        } else {
            return self + "/" + pathComponent
        }
    }
}
// Wrapper over glob that supports ** patterns
class Glob: Collection {
    var paths = [String]()
    var startIndex: Int { paths.startIndex }
    var endIndex: Int { paths.endIndex }

    private var directoryCache = [String: Bool]()

    init(pattern: String) {
        var glob = glob_t()
        let patterns = expandGlobstar(pattern: pattern)

        patterns.forEach { pattern in
            guard let cstrPattern = pattern.cString(using: .utf8) else { return }
            if execute(pattern: cstrPattern, globPtr: &glob) {
                for i in 0..<Int(glob.gl_matchc) {
                    if let path = String(validatingUTF8: glob.gl_pathv[i]!) {
                        paths.append(path)
                    }
                }
            }
            globfree(&glob)
        }
    }

    public subscript(i: Int) -> String {
        return paths[i]
    }

    public func index(after i: Glob.Index) -> Glob.Index {
        return i + 1
    }

    func execute(pattern: [CChar], globPtr: UnsafeMutablePointer<glob_t>) -> Bool {
        return glob(
            pattern,
            GLOB_TILDE | GLOB_BRACE | GLOB_MARK,
            nil,
            globPtr
        ) == 0
    }

    private func expandGlobstar(pattern: String) -> [String] {
        guard pattern.contains("**") else {
            return [pattern]
        }

        var results = [String]()
        var pathComponents = pattern.components(separatedBy: "**")
        let initialPathComponent = pathComponents.removeFirst()
        var remainingPaths = pathComponents.joined(separator: "**")

        var directories: [String] = [initialPathComponent]

        let searchPath = initialPathComponent.isEmpty ? FileManager.default.currentDirectoryPath : initialPathComponent
        do {
            if FileManager.default.fileExists(atPath: searchPath) {
                directories.append(contentsOf: try FileManager.default.subpathsOfDirectory(atPath: searchPath).compactMap({ subpath in
                    let path = initialPathComponent.appendingPathComponent(subpath)
                    guard isDirectory(path: path) else { return nil }
                    return path
                }))
            }
        } catch {
            writeError("Error parsing glob pattern: \(error)")
        }


        // Include the root directory when the globstar is the final component
        if remainingPaths.isEmpty {
            results.append(initialPathComponent)
            remainingPaths = "*"
        }

        directories.forEach { directory in
            let partiallyResolvedPattern: String
            if directory.isEmpty {
                partiallyResolvedPattern = remainingPaths.starts(with: "/") ? String(remainingPaths.dropFirst()) : remainingPaths
            } else {
                partiallyResolvedPattern = directory + remainingPaths
            }

            results.append(contentsOf: expandGlobstar(pattern: partiallyResolvedPattern))
        }
        return results
    }

    private func isDirectory(path: String) -> Bool {
        if let isDirectory = directoryCache[path] {
            return isDirectory
        }

        var isDirectoryBool = ObjCBool(false)
        var isDirectory = FileManager.default.fileExists(atPath: path, isDirectory: &isDirectoryBool)
        isDirectory = isDirectory && isDirectoryBool.boolValue

        directoryCache[path] = isDirectory
        return isDirectory
    }
}
#endif
