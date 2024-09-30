# Code Connect (Jetpack Compose)

For more information about Code Connect as well as guides for other platforms and frameworks, please [go here](../README.md).

This documentation guide will help you connect your Jetpack Compose components with Figma components using Code Connect. We'll cover basic setup to display your first connected component, followed by property mapping and variant mapping.

## Installation

### Installing the CLI

Refer to [the instructions here](../README.md#CLI-installation) to install the `figma` CLI tool.

### Add the Gradle plugin to your project

Add the Gradle plugin to your module `build.gradle.kts` file.

```
plugins {
   id("com.figma.code.connect") version "1.+"
}
```

## Add the SDK dependency to your module

In order to start authoring Code Connect files, add the following dependencies to the `build.gradle.kts` file in the module that will contain the files. Note that you may need to add `mavenCentral()` to `repositories in your `dependencyResolutionManagement` block.

```
dependencies {
    implementation("com.figma.code.connect:code-connect-lib:1.+")
}
```


## Basic setup

To keep things simple, we're going to start by replacing the contents of the generated file with a basic Code Connect configuration to make sure everything is set up and working. Replace the contents of your file with the following, swapping the `Button` reference with a reference to whatever component you want to connect.

```kotlin
package com.your.app.directory

import androidx.compose.runtime.Composable
import com.figma.code.connect.FigmaConnect

@FigmaConnect(url="https://...")
class ButtonDoc {

   @Composable
   fun ButtonSnippet() {
      Button(title = "Text")
   }
}
```

Once you've made the edits you want to the Code Connect file you can simply publish it to Figma.

```sh
figma connect publish --token <auth token>
```

Now go back to Dev Mode in Figma and select the component that you just connected. You should see a connected code snippet show up with a simple reference to your component.

## Co-locating Code Connect files

By default, this setup will create a new Code Connect file that lives alongside your code component files. However, these two files can also be co-located. To do this, simply move the contents of the `.figma.kt` file into your original component definition file. This is a great way to ensure Code Connect is always updating what appears in Dev Mode at the same time the code component itself is updated.

```kotlin
package com.your.app.directory

import androidx.compose.runtime.Composable
import com.figma.code.connect.FigmaConnect

@Composable
fun Button(... ) { ... }

@FigmaConnect(url="https://...")
class ButtonDoc {

   @Composable
   fun ButtonSnippet() {
      Button(title = "Text")
   }
}
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

## Prop mapping

With the basic setup described above you should have your code components connected with Figma components, and code snippets should be visible within Dev Mode. However, the code snippets in Dev Mode don't yet reflect the entirety of the design. For example, we see the same code snippet for a button whether it has `type` set to `primary` or `secondary`.

To ensure the connected code accurately reflects the design we need to make use of prop mapping. Prop mapping enables you to link specific props in the design to props in code. In most cases, design and code props do not match exactly, so it's necessary to configure this manually to ensure the correct code is shown in Dev Mode.

Here is a simple example for a button with `label`, `disabled`, and `type` properties.

```kotlin
package com.your.app.directory

import androidx.compose.runtime.Composable
import com.figma.code.connect.Figma
import com.figma.code.connect.FigmaConnect
import com.figma.code.connect.FigmaProperty
import com.figma.code.connect.FigmaType
import com.figma.code.connect.FigmaVariant

@FigmaConnect(url="http://figma.com/component1")
class ButtonDoc {

    @FigmaProperty(FigmaType.Text, "Text Content")
    val label = "Click me txt"

    @FigmaProperty(FigmaType.Boolean, "Disabled")
    val disabled = false

    @FigmaProperty(FigmaType.Enum, "Variant")
    val type: ButtonType = Figma.mapping(
        "Primary" to ButtonType.Primary,
        "Secondary" to ButtonType.Secondary
    )

    @Composable
    fun Component2() {
        ButtonComponent(
            type = type,
            label = label,
            disabled = disabled
        )
    }
}

```

`@FigmaProperty` is used to map property types in Figma. The first parameter of the annotation takes a `FigmaType`, which corresponds to different Figma component property types.


`FigmaType.Text` is used to map text properties. `FigmaType.Boolean` is used to map booleans. For nested instances, `FigmaType.Instance` should be used.

Variants in Figma can be mapped using `FigmaType.Enum` with the `Figma.mapping` helper. `Figma.mapping` takes a list of `pair`s where the first element in the pair is the value in Figma, and the second value is what should appear in code.


```kotlin
@FigmaProperty(FigmaType.Text, "Text Content")
val label: String = "Click me txt"

@FigmaProperty(FigmaType.Boolean, "Disabled")
val disabled: Boolean = false

@FigmaProperty(FigmaType.Enum, "Variant")
val type: ButtonType = Figma.mapping(
   "Primary" to ButtonType.Primary,
   "Secondary" to ButtonType.Secondary
)

@FigmaProperty(FigmaType.Instance, "Icon")
val icon : @Composable () -> Unit = { IconComponent() }

```

For more advanced mapping—where properties in Figma and code do not match exactly—Code Connect also allows you to specify your own mapping. For example, you can map a boolean from Figma for displaying either an icon or divider accessory.

```kotlin
@FigmaProperty(FigmaType.Boolean, "Has Icon")
val accessory: @Composable() -> Unit = Figma.mapping(
   true to Icon(),
   false to Divider()
)
```

Or setting a boolean to true when a specific enum option is specified in Figma.

```kotlin
@FigmaProperty(FigmaType.Enum, "Type")
val isDisabled: Bool = Figma.mapping("Disabled" to true)
```


## Instance children

While `@FigmaInstance` can be used to map child instances that are instance-swap properties in Figma, it's common for components in Figma to have child instances that aren't bound to an instance-swap prop. We can render the code snippets for these nested instances with the `@FigmaChildren` property wrapper. This helper takes the _name of the instance layer_ as its parameter, rather than a Figma prop name. It's important to note that the nested instance also must be connected separately.

```kotlin
@FigmaChildren("Header", "Row")
val contents : @Composable () -> Unit = { }

@Composable
fun ListExample() {
    List {
        contents
    }
}
```

## Variant mapping

Sometimes a component in Figma is represented by more than one component in code. For example you may have a single `Button` in your Figma design system with a `type` property to switch between primary, secondary, and danger variants. However, in code this may be represented by three different components, a `PrimaryButton`, `SecondaryButton` and `DangerButton`.

To model this behavior with Code Connect, we can make use of variant mappings. These allow you to provide different code samples for different variants of a single Figma component.

```Kotlin
@FigmaConnect("https://...")
@FigmaVariant("Type", "Primary")
class PrimaryButtonConnection {

   @Composable
   fun PrimaryButtonExample() {
      PrimaryButton(title: "Text")
   }
}

@FigmaConnect("https://...")
@FigmaVariant("Type", "Secondary")
class PrimaryButtonConnection {

   @Composable
   fun SecondaryButtonExample() {
      SecondaryButton(title: "Text")
   }
}

@FigmaConnect("https://...")
@FigmaVariant("Type", "Danger")
class DangerButtonConnection {

   @Composable
   fun DangerButtonExample() {
      DangerButton(title: "Text")
   }
}
```

In some complex cases you may also want to map a code component to a combination of variants in Figma.

```Kotlin
// Default case
@FigmaConnect("https://...")
class ButtonConnection {

   @Composable
   fun ButtonExample() {
      Button(title: "Text")
   }
}

@FigmaConnect("https://...")
@FigmaVariant("Type", "Danger")
@FigmaVariant("Disabled", "False")
class DangerButtonConnection {

   @Composable
   fun DangerButtonExample() {
      DangerButton(title: "Text")
   }
}
```
