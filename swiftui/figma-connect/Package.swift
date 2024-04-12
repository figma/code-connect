// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import CompilerPluginSupport
import PackageDescription

let package = Package(
    name: "figma-connect",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "CodeConnectParser", targets: ["CodeConnectParser"]),
        .executable(name: "figma-swift", targets: ["CodeConnectCLI"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-syntax", from: "509.1.1"),
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.0.0"),
        .package(url: "https://github.com/nicklockwood/SwiftFormat", from: "0.49.0"),
        .package(path: "../../")
    ],
    targets: [
        .executableTarget(
            name: "CodeConnectCLI",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .target(name: "CodeConnectParser")
            ],
            path: "cli/"
        ),
        .target(
            name: "CodeConnectParser",
            dependencies: [
                .product(name: "SwiftSyntax", package: "swift-syntax"),
                .product(name: "SwiftParser", package: "swift-syntax"),
                .product(name: "SwiftFormat", package: "SwiftFormat"),
                .product(name: "SwiftSyntaxBuilder", package: "swift-syntax"),
                .product(name: "Figma", package: "figmadoc")
            ],
            path: "lib/"
        ),
        .testTarget(
            name: "CodeConnectParserTest",
            dependencies: [
                .product(name: "SwiftSyntax", package: "swift-syntax"),
                .target(name: "CodeConnectParser"),
                .product(name: "Figma", package: "figmadoc")
            ],
            path: "Tests/CodeConnectParserTest",
            resources: [
                .copy("Button.figma.test"),
            ]
        )
    ]
)
