// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import CompilerPluginSupport
import PackageDescription

let package = Package(
    name: "Figma",
    platforms: [
        .iOS(.v15),
        .macOS(.v13)
    ],
    products: [
        .library(name: "Figma", targets: ["Figma"]),
        .executable(name: "figma-swift", targets: ["CodeConnectCLI"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-syntax", "510.0.3"..."600.0.0"),
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.0.0"),
        .package(url: "https://github.com/nicklockwood/SwiftFormat", from: "0.49.0"),
    ],
    targets: [
        .target(
            name: "Figma",
            path: "swiftui/sdk"
        ),
        .executableTarget(
            name: "CodeConnectCLI",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .target(name: "CodeConnectParser")
            ],
            path: "swiftui/cli"
        ),
        .target(
            name: "CodeConnectParser",
            dependencies: [
                .product(name: "SwiftSyntax", package: "swift-syntax"),
                .product(name: "SwiftParser", package: "swift-syntax"),
                .product(name: "SwiftFormat", package: "SwiftFormat"),
                .product(name: "SwiftSyntaxBuilder", package: "swift-syntax"),
                .target(name: "Figma")
            ],
            path: "swiftui/lib"
        ),
        .testTarget(
            name: "CodeConnectParserTest",
            dependencies: [
                .product(name: "SwiftSyntax", package: "swift-syntax"),
                .target(name: "CodeConnectParser"),
                .target(name: "Figma")
            ],
            path: "swiftui/Tests/CodeConnectParserTest",
            resources: [
                .copy("Samples.figma.test"),
            ]
        )
    ]
)
