# Code Connect (SwiftUI)

For more information about Code Connect as well as guides for other platforms and frameworks, please [go here](../README.md).

This documentation guide will help you connect your SwiftUI components with Figma components using Code Connect. We'll cover basic setup to display your first connected component, followed by prop mapping and variant mapping.

## Installation

## Command-Line Tool

You can check out and build the Code Connect CLI (`figma-swift`) from source.

```sh
$ git clone https://github.com/figma/code-connect
# From the root of the repo
$ swift build -c release
```

You can then find where the binary was built by running `swift build -c release --show-bin-path`. Once you've located the `figma-swift` binary, you can drag or move this into `/usr/local/bin/` in order to access it anywhere.

## Import the Figma package

In addition to installing the CLI you'll need to add the Code Connect Swift package to your project for accessing helper functions and types associated with Code Connect.

```swift
let package = Package(
    name: "MyProject",
    platforms: [...],
    products: [...],
    dependencies: [
        .package(url: "https://github.com/figma/code-connect", from: "1.0.0"),
    ],
    targets: [...]
)
```

## Basic setup

To connect your first component, start by going to Dev Mode in Figma and right-click on the component you want to connect, then choose to `Copy link to selection`. Make sure you are copying the link to a main component and not an instance of the component. The main component will typically be located in a centralized design system library file. Using this link, run `figma-swift connect create`.

```sh
figma-swift connect create https://... --access-token <auth token>
```

This will create a Code Connect file with some basic scaffolding for the component you want to connect. By default this file will be called `<component-name>.figma.swift` based on the name of the component in Figma. However, you may rename this file as you see fit. The scaffolding that is generated is based on the interface of the component in Figma. Depending on how closely this matches your code component you'll need to make some edits to this file before you publish it.

Some CLI commands, like `create`, require a valid [authentication token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) with write permission for the Code Connect scope. You can either pass this via the `--access-token` flag, or set the `FIGMA_ACCESS_TOKEN` environment variable.

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
figma-swift connect publish --access-token <auth token>
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

To publish your connected components to Figma simply run `figma-swift connect publish`. This will find all Code Connect files in your repository, parse them, and upload the necessary metadata to Figma for display in Dev Mode. Code Connect only uploads the explicit code snippets and metadata related to Code Connect. It does not upload any other parts of your source code.

```sh
figma-swift connect publish --access-token <token>
```

To unpublish your connected components from Figma, you can run the `unpublish` command. This will find all the Code Connect files in your repository and remove the metadata from Figma.

```sh
figma-swift connect unpublish --access-token <token>
```

`figma connect` as well as `figma connect publish` can accept a variety of flags to customize the behavior of these commands.

- `-t --access-token <access_token>` Specify the Figma auth token to use. Can also be specified using the `FIGMA_ACCESS_TOKEN` environment variable.
- `-c --config <path>` Path to config file (by default looks for "figma.config.json" in the current directory).
- `-d --dir <folder>` Directory to parse (uses current directory by default)
- `--skip-validation` By default, `publish` will validate your Code Connect file with the Figma component to ensure that their properties match. This flag can be used to skip this validation.
- `--verbose` Enable verbose logging for debugging


## Configuration

You can specify project configurations in the configuration file. This configuration is mainly used to ensure Code Connect can correctly locate your imports as well as display the correct imports within Dev Mode, as well as to include or exclude specific glob paths for the parsing.

```jsonp
{
    "include": [...],
    "exclude": [...],

    importMapping: {
      "packages/design-system/*": "DesignSystem"
    },
  }
}
```

## Prop mapping

With the basic setup as described above you should have your code components connected with Figma components, and code snippets should be visible within Dev Mode. However, the code snippets in Dev Mode don't yet reflect the entirety of the design. For example we see the same code snippet for a button whether has `type` set to `primary` or `secondary`.

To ensure the connected code accurately reflects the design we need to make use of prop mapping. Prop mapping enables you to link specific props in the design to props in code. In most cases design & code props do not match 1:1 so it's necesarry for us to configure this manually to ensure the correct code is shown in Dev Mode.

Here is a simple example for a button with a `label`, `disabled`, and `type` property.

```swift
import Figma

struct Button_connection : FigmaConnect {
  let component = Button.self
  let figmaNodeUrl: String = "https://..."

  @FigmaProp("Text Content")
  var label: String = "Submit"

  @FigmaProp("disabled")
  var disabled: Bool = false

   @FigmaProp(
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

`@FigmaProp` can be used to map strings, booleans, enums, as well as nested components (instances). This property wrapping will convert the Figma type to the specified type in code automatically in most cases.

```swift
@FigmaProp("A string") var label: String

@FigmaProp("A boolean") var hasLabel: Bool

@FigmaProp("An instance") var icon: Icon

@FigmaProp(
   "An enum",
   mapping: [
      "Primary": .primary,
      "Secondary": .secondary
   ]) var variant: ButtonVariant
```

For more advanced mapping where properties in Figma and code do not match 1:1 Code Connect also allows you to specify your own mapping. For example mapping a boolean from Figma to whether to display an icon or a spacer accessory.

```swift
@FigmaProp(
   "has icon",
   mapping: [
      "True": Icon(),
      "False": Spacer()
   ]) var accessory: some View
```

Or setting a boolean to true when a specific enum option is specified in Figma.

```swift
@FigmaProp("Type", mapping: [ "Disabled": true ]) var isDisabled: Bool
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
