# Code Connect (SwiftUI)

For more information about Code Connect as well as guides for other platforms and frameworks, please [go here](../README.md).

This documentation guide will help you connect your SwiftUI components with Figma components using Code Connect. We'll cover basic setup to display your first connected component, followed by prop mapping and variant mapping.

## Installation

## Command-Line Tool

Follow the instructions [here](../README.md#cli-installation) to install the Code Connect CLI.

## Import the Figma package

In addition to installing the CLI, you'll need to add the Code Connect Swift package to your project. This package contains helper functions and types associated with Code Connect, as well as the parser for Swift language support. You'll also need to add the `Figma` dependency to your target that you'll be authoring Code Connect files in.

```swift
let package = Package(
    name: "MyProject",
    platforms: [...],
    products: [...],
    dependencies: [
        .package(url: "https://github.com/figma/code-connect", from: "1.0.0"),
    ],
    targets: [
      .target(
         name: "MyTarget",
         dependencies: [
               .product(name: "Figma", package: "code-connect")
         ]
      )
    ]
)
```

## Basic setup

To connect your first component, start by going to Dev Mode in Figma and right-click on the component you want to connect, then choose to `Copy link to selection`. Make sure you are copying the link to a main component and not an instance of the component. The main component will typically be located in a centralized design system library file. Using this link, run `figma connect create` from within your SwiftUI project. If you encounter errors, please check if you need additional [configuration](#configuration) for your project.

```sh
figma connect create "https://..." --token <auth token>
```

This will create a Code Connect file with some basic scaffolding for the component you want to connect. By default this file will be called `<component-name>.figma.swift` based on the name of the component in Figma. However, you may rename this file as you see fit. The scaffolding that is generated is based on the interface of the component in Figma. Depending on how closely this matches your code component you'll need to make some edits to this file before you publish it.

Some CLI commands, like `create`, require a valid [authentication token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) with write permission for the Code Connect scope as well as the read permission for the File content scope. You can either pass this via the `--token` flag, or set the `FIGMA_ACCESS_TOKEN` environment variable.

To keep things simple, we're going to start by replacing the contents of the generated file with the most basic Code Connect configuration possible to make sure everything is set up and working as expected. Replace the contents of the file with the following, replacing the `Button` reference with a reference to whatever component you are trying to connect.

```swift
import Figma

struct Button_connection : FigmaConnect {
  let component = Button.self
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      Button(title: "Text")
   }
}
```

Once you've made the edits you want to the Code Connect file you can simply publish it to Figma to have it show up when the corresponding component or instance is selected in Dev Mode.

```sh
figma connect publish --token <auth token>
```

Now go back to Dev Mode in Figma and select the component that you just connected. You should see a connected code snippet show up with a simple reference to your component.

## Co-locating Code Connect files

By default Code Connect creates a new file which lives alongside the code components you want to connect to Figma components. However, Code Connect files may also be co-located with the code component it is connecting. To do this, simply move the contents of the `<component-name>.figma.swift` file into your component definition file. This is a great way to ensure Code Connectis always updating what appears in Dev Mode at the same times the code component itself is updated.

```swift
import Figma

struct Button : View { ... }

struct Button_connection : FigmaConnect {
  let component = Button.self
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      Button(title: "Text")
   }
}
```

## Integrating with Xcode previews

Code Connect integrates seamlessly with Xcode preview so you don't need to write multiple examples for how to use your component. Simply use the connection struct as a preview itself.

```swift
struct Button : View { ... }

struct Button_connection : FigmaConnect { ... }

#Preview { Button_connection() }
```

## Publishing

To publish your connected components to Figma simply run `figma connect publish`. This will find all Code Connect files in your repository, parse them, and upload the necessary metadata to Figma for display in Dev Mode. Code Connect only uploads the explicit code snippets and metadata related to Code Connect. It does not upload any other parts of your source code.

```sh
figma connect publish --token <token>
```

To unpublish your connected components from Figma, you can run the `unpublish` command. This will find all the Code Connect files in your repository and remove the metadata from Figma.

```sh
figma connect unpublish --token <token>
```

`figma connect` as well as `figma connect publish` can accept a variety of flags to customize the behavior of these commands.

- `-t --token <access_token>` Specify the Figma auth token to use. Can also be specified using the `FIGMA_ACCESS_TOKEN` environment variable.
- `-c --config <path>` Path to config file (by default looks for "figma.config.json" in the current directory).
- `-d --dir <folder>` Directory to parse (uses current directory by default)
- `--skip-validation` By default, `publish` will validate your Code Connect file with the Figma component to ensure that their properties match. This flag can be used to skip this validation.

## Configuration

In addition to the [general configuration](../README.md#general-configuration) for the CLI, there are optional SwiftUI-specific project configuration optional that can be specified in the configuration file. The `figma.config.json` file must be located in your project root, i.e. alongside your `.xcodeproj` or `Package.swift` file.

```jsonp
{
   "codeConnect": {
      "include": [...],
      "exclude": [...],
      "xcodeprojPath": "MyProject.xcodeproj",
      "swiftPackagePath": "../path/to/my/Package.swift"
      importMapping: {
         "packages/design-system/*": "DesignSystem"
      }
   }
}
```

The `xcodeprojPath` configuration option allows you to specify the `.xcodeproj` file associated with your project. Alternatively, if using `Package.swift` file, you can also specify the `swiftPackagePath'. Code Connect requires this file (or `Package.swift`) in order to locate the Code Connect package and build the language support binary. Code Connect defaults to using the first `.xcodeproj` file it finds, which should work for most projects, but if you encounter errors and have more than one `.xcodeproj` file, you can use this option to point Code Connect to the correct one.


The `importMapping` configuration option is used to ensure Code Connect can correctly locate your imports as well as display the correct imports within Dev Mode

## Prop mapping

With the basic setup as described above you should have your code components connected with Figma components, and code snippets should be visible within Dev Mode. However, the code snippets in Dev Mode don't yet reflect the entirety of the design. For example we see the same code snippet for a button whether has `type` set to `primary` or `secondary`.

To ensure the connected code accurately reflects the design we need to make use of prop mapping. Prop mapping enables you to link specific props in the design to props in code. In most cases design & code props do not match 1:1 so it's necessary for us to configure this manually to ensure the correct code is shown in Dev Mode.

Here is a simple example for a button with a `label`, `disabled`, and `type` property.

```swift
import Figma

struct Button_connection : FigmaConnect {
  let component = Button.self
  let figmaNodeUrl: String = "https://..."

  @FigmaString("Text Content")
  var label: String = "Submit"

  @FigmaBoolean("disabled")
  var disabled: Bool = false

   @FigmaEnum(
      "Variant",
      mapping: [
          "Primary": ButtonVariant.primary,
          "Secondary": ButtonVariant.secondary,
          "Destructive": ButtonVariant.danger
      ]
  )
  var type: ButtonType = .primary

   var body: some View {
      Button(type: self.type, disabled: self.disabled, label: {
          Text(self.label)
      })
   }
}
```

`@FigmaString` is used to map strings directly. `@FigmaBoolean` is used to map booleans. Variants in Figma can be mapped using `@FigmaEnum`. For nested instances, `@FigmaInstance` should be used.

```swift
@FigmaString("A string") var label: String

@FigmaBoolean("A boolean") var hasLabel: Bool

@FigmaInstance("An instance") var icon: Icon

@FigmaEnum(
   "An enum",
   mapping: [
      "Primary": .primary,
      "Secondary": .secondary
   ]) var variant: ButtonVariant
```

For more advanced mapping where properties in Figma and code do not match 1:1 Code Connect also allows you to specify your own mapping. For example mapping a boolean from Figma to whether to display an icon or a spacer accessory.

```swift
@FigmaBoolean(
   "has icon",
   mapping: [
      true: Icon(),
      false: Spacer()
   ]) var accessory: some View
```

Or setting a boolean to true when a specific enum option is specified in Figma.

```swift
@FigmaEnum("Type", mapping: [ "Disabled": true ]) var isDisabled: Bool
```

### Hiding Default Values

For certain types of mapped properties, you may want to hide them if their default value is shown. For example, you may want to display a `.disabled(true)` modifier if a component has a `Disabled = True` boolean property, but not show anything otherwise. You can use the `hideDefault` parameter on `@FigmaEnum` or `@FigmaBoolean` to represent this.

```swift
   @FigmaBoolean("Disabled", hideDefault: true)
   var disabled: Bool = false

   var body: some View {
       MyView()
           .disabled(self.disabled)
   }
```

If the component in Figma has `Disabled = True`, the resulting code will show

```swift
MyView()
   .disabled(true)
```

If `Disabled = false` the resulting code will simply be `MyView()`.

## Instance children

While `@FigmaInstance` can be used to map child instances that are instance-swap properties in Figma, it's common for components in Figma to have child instances that aren't bound to an instance-swap prop. We can render the code snippets for these nested instances with the `@FigmaChildren` property wrapper. This helper takes the _name of the instance layer_ as its parameter, rather than a Figma prop name. It's important to note that the nested instance also must be connected separately.

```swift
@FigmaChildren(layers: ["Header", "Row"])
var contents = AnyView? = nil

var body: some View {
    VStack {
        self.contents
    }
}
```

## Variant mapping

Sometimes a component in Figma is represented by more than one component in code. For example you may have a single `Button` in your Figma design system with a `type` property to switch between primary, secondary, and danger variants. However, in code this may be represented by three different components, a `PrimaryButton`, `SecondaryButton` and `DangerButton`.

To model this behaviour with Code Connect we can make use of something called variant mappings. Variant mappings allow you to provide entierly different code samples for different variants of a single Figma components.

```swift
struct PrimaryButton_connection : FigmaConnect {
  let component = PrimaryButton.self
  let variant = ["Type": "Primary"]
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      PrimaryButton(title: "Text")
   }
}

struct SecondaryButton_connection : FigmaConnect {
  let component = SecondaryButton.self
  let variant = ["Type": "Secondary"]
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      SecondaryButton(title: "Text")
   }
}

struct DangerButton_connection : FigmaConnect {
  let component = DangerButton.self
  let variant = ["Type": "Danger"]
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      DangerButton(title: "Text")
   }
}
```

In some complex cases you may also want to map a code component to a combination of variants in Figma.

```swift
// Default case
struct Button_connection : FigmaConnect {
  let component = Button.self
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      Button(title: "Text")
   }
}

struct DangerButton_connection : FigmaConnect {
  let component = DangerButton.self
  let variant = ["Type": "Danger", "Disabled": false]
  let figmaNodeUrl: String = "https://..."

   var body: some View {
      DangerButton(title: "Text")
   }
}
```

## Conditionally applying modifiers

Certain properties in Figma may map to specific modifiers rather than a function parameter. You can use the `figmaApply` helper to represent these cases. For example:

```swift
struct MyComponent_doc: FigmaConnect {
   ...
   @FigmaEnum("Type", mapping: ["Primary": true])
   var isPrimary: Bool = false

   var body: some View {
        MyComponent()
            .figmaApply(isPrimary) {
                $0.tint(.blue)
            } elseApply {
                $0.backgroundColor(.clear)
            }
   }
}
```

In the above example, if the value of `State = Primary` in Figma, the resultant code will be

```swift
MyComponent()
   .tint(.blue)
```

Otherwise, it will be:

```swift
MyComponent()
   .backgroundColor(.clear)
```

The `elseApply` parameter can be omitted in order to not show anything.
