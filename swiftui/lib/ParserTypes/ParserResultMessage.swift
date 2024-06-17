public struct ParserResultMessage: Encodable {
    public enum Level: String, Encodable {
        case debug = "DEBUG"
        case info = "INFO"
        case warn = "WARN"
        case error = "ERROR"
    }

    public var level: Level
    public var type: String?
    public var message: String
}
