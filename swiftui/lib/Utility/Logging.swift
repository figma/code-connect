#if os(macOS)
import Foundation

public func writeError(_ string: String) {
    if let data = (string + "\n").data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}
#endif
