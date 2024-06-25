# Code Connect (React)

For more information about Code Connect as well as guides for other platforms and frameworks, please [go here](../README.md).

This documentation will help you connect your React (or React Native) components with Figma components using Code Connect. We'll cover basic setup to display your first connected code snippet, followed by making snippets dynamic by using property mappings. Code Connect for React works as both a standalone implementation and as an integration with existing Storybook files to enable easily maintaining both systems in parallel.

## Installation

Code Connect is used through a command line interface (CLI). The CLI comes bundled with the `@figma/code-connect` package, which you'll need to install through `npm`. This package also includes helper functions and types associated with Code Connect.

```sh
npm install @figma/code-connect
```

## Basic setup

To connect your first component go to Dev Mode in Figma and right-click on the component you want to connect, then choose `Copy link to selection` from the menu. Make sure you are copying the link to a main component and not an instance of the component. The main component will typically be located in a centralized design system library file. Using this link, run `figma connect create` from inside your React project. Note that depending on what terminal software you're using, you might need to wrap the URL in quotes.

```sh
npx figma connect create "https://..." --token <auth token>
```

This will create a Code Connect file with some basic scaffolding for the component you want to connect. By default this file will be called `<component-name>.figma.tsx` based on the name of the component in Figma. However, you may rename this file as you see fit. The scaffolding that is generated is based on the interface of the component in Figma. Depending on how closely this matches your code component you'll need to make some edits to this file before you publish it.

Some CLI commands, like `create`, require a valid [authentication token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) with write permission for the Code Connect scope as well as the read permission for the File content scope. You can either pass this via the `--token` flag, or set the `FIGMA_ACCESS_TOKEN` environment variable. The Figma CLI reads this from a `.env` file in the same folder, if it exists.

To keep things simple, we're going to start by replacing the contents of the generated file with the most basic Code Connect configuration possible to make sure everything is set up and working as expected. Replace the contents of the file with the following, replacing the `Button` reference with a reference to whatever component you are trying to connect. The object called by `figma.connect` is your Code Connect doc.

```tsx
import figma from '@figma/code-connect'
import { Button } from 'src/components'

figma.connect(Button, 'https://...', {
  example: () => {
    return <Button />
  },
})
```

Once you've made the edits you want to the Code Connect file you can simply publish it to Figma to have it show up when the corresponding component or instance is selected in Dev Mode.

```sh
npx figma connect publish --token <auth token>
```

Now go back to Dev Mode in Figma and select the component that you just connected. You should see a connected code snippet show up with a simple reference to your component.

> [!NOTE]
> Code Connect files are not executed. While they're written using real components from your codebase, the Figma CLI essentially treats code snippets as strings. This means you can use, for example, hooks without needing to mock data. However, this also means that logical operators such as ternaries or conditionals will be output verbatim in your example code rather than executed to show the result. You also won't be able to dynamically construct `figma.connect` calls in a for-loop, as an example. If something you're trying to do is not possible because of this restriction in the API, we'd love to hear your feedback.

## Interactive setup

A step-by-step interactive flow is provided which makes it easier to connect a large codebase. Code Connect will attempt to automatically connect your codebase to your Figma design system components based on name, which you can then make any edits to before batch-creating Code Connect files.

To start the interactive setup, enter `figma connect` without any subcommands:

```sh
npx figma connect
```

## Integrating with Storybook

If you already have Storybook set up for your design system then we recommend using the Storybook integration that comes with Code Connect. Storybook and Code Connect complement each other nicely and with this integration they are easy to maintain in parallel. The syntax for integrating with Storybook is slightly different to ensure alignment with the Storybook API.

To define a Code Connect doc using Storybook simply add a `parameters` block to your story configuration object that references the Figma component you want to pull into Code Connect. This syntax is an extension of the [existing Storybook integration](https://help.figma.com/hc/en-us/articles/360045003494-Storybook-and-Figma) offered by Figma, so you'll automatically get all the benefits that come with that such as a Figma preview of the component embedded in your Storybook documentation.

```tsx
export default {
  component: Button,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://...',
      examples: [ButtonExample],
    },
  },
}

// Existing story
export function ButtonExample() {
  return <Button disabled />
}
```

## Publishing

To publish your connected components to Figma simply run `figma connect publish`. This will find all Code Connect files in your repository, parse them, and upload the necessary metadata to Figma for display in Dev Mode. Code Connect only uploads the explicit code snippets and metadata related to Code Connect. It does not upload any other parts of your source code.

```sh
npx figma connect publish --token <token>
```

To unpublish your connected components from Figma, you can run the `unpublish` command. This will find all the Code Connect files in your repository and remove the metadata from Figma.

```sh
npx figma connect unpublish --token <token>
```

`figma connect` as well as `figma connect publish` can accept a variety of flags to customize the behavior of these commands.

- `-t --token <access_token>` Specify the Figma auth token to use. Can also be specified using the `FIGMA_ACCESS_TOKEN` environment variable.
- `-c --config <path>` Path to config file (by default looks for "figma.config.json" in the current directory).
- `-r --dir <folder>` Directory to parse (uses current directory by default)
- `--dry-run` Perform a dry run of publishing, returning errors if any exist but does not publish your connected components.
- `--skip-validation` By default, `publish` will validate your Code Connect file with the Figma component to ensure that their properties match. This flag can be used to skip this validation.
- `--verbose` Enable verbose logging for debugging
- `--node <node-url>` For unpublishing only a single specific component with `unpublish`

## Configuration

To configure the behaviour of the CLI and Code Connect you can create a `figma.config.json` file. This file must be located in the project root, i.e. alongside your `package.json` file. This config file will automatically be picked up by the CLI if it's in the same folder where you run the commands, but you can also specify a path to the config file via the `--config` flag.

In addition to the [general configuration](../README.md#general-configuration) for the CLI, there is React-specific project configuration that can be specified in the configuration file. This configuration is mainly used to ensure Code Connect can correctly locate your imports as well as display the correct imports within Dev Mode.

```jsonp
{
  "codeConnect": {
    "parser": "react",
    "include": [],
    "exclude": ["test/**", "docs/**", "build/**"],
    "importPaths": {
      "src/components/*": "@ui/components"
    },
    "paths": {
      "@ui/components/*": ["src/components/*"]
    }
  }
}
```

### `importPaths`

`importPaths` maps relative imports to non-relative imports. This is useful for when you want users of your design system to import components from a specific package as opposed to using relative imports. The mapping uses the file location on disk. For example, if your Code Connect file looks like this:

```
import { Button } from './'
figma.connect(Button, 'https://...')
```

You can use `importPaths` by specifying where `Button` lives in your repo and map it to something else. You can use partial paths here, as it will
consider the full absolute path of the source file `Button.tsx`.

```
{
  "codeConnect": {
    "importPaths": {
      "src/components/*": "@ui/components"
    }
  }
}
```

Which will end up changing your connected code snippet in Figma to

```
import { Button } from '@ui/components'
```

### `paths`

This is needed if you're using path aliases in your TypeScript project configuration, so Code Connect can know how to resolve your imports. It should match the `paths` object used in your tsconfig.json.

## Custom imports

You can override the generated import statements for a connected component by passing an array of `imports`. This might be useful if the automatic resolution does not work well for your use case.

```
figma.connect(Button, "https://...", {
  imports: ["import { Button } from '@lib'"]
})
```

## Dynamic code snippets

With the basic setup as described above, you should have a connected code snippet visible in Dev Mode when inspecting instances of that component. However, the code snippet doesn't yet reflect the entirety of the design. For example, we see the same code snippet for a button whether it has the `type` variant set to `primary` or `secondary`.

To ensure the connected code snippet accurately reflects the design, we need to make use of property mappings. This enables you to link specific props in the design to props in code. In most cases, design and code props don't match 1:1, so it's necessary for us to configure this to ensure the correct code is shown in Dev Mode.

Here is a simple example for a button with a `label`, `disabled`, and `type` property.

```tsx
import figma from '@figma/code-connect'

figma.connect(Button, 'https://...', {
  props: {
    label: figma.string('Text Content'),
    disabled: figma.boolean('Disabled'),
    type: figma.enum('Type', {
      Primary: 'primary',
      Secondary: 'secondary',
    }),
  },
  example: ({ disabled, label, type }) => {
    return (
      <Button disabled={disabled} type={type}>
        {label}
      </Button>
    )
  },
})
```

And this is how we would achieve the same thing using the Storybook integration. Notice how this works well with existing `args` configuration you may already be using in Storybook.

```tsx
import figma from "@figma/code-connect"

export default {
  component: Button,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://...',
      examples: [ButtonExample],
      props: {
        label: figma.string('Text Content'),
        disabled: figma.boolean('Disabled'),
        type: figma.enum('Type', {
          Primary: ButtonType.Primary,
          Secondary: ButtonType.Secondary
        },
      },
    },
    argTypes: {
      label: { control: 'string' },
      disabled: { control: 'boolean' },
      type: {
        control: {
          type: 'select',
          options: [ButtonType.Primary, ButtonType.Secondary]
        }
      }
    },
    args: {
      label: 'Hello world',
      disabled: false,
      type: ButtonType.Primary
    }
  }
}

export function ButtonExample({ label, disabled, type }) {
  return <Button disabled={disabled} type={type}>{ label }</Button>
}
```

The `figma` import contains helpers for mapping all sorts of properties from design to code. They work for simple mappings where only the naming differs between Figma and code, as well as more complex mappings where the type differs. See the below reference for all the helpers that exist and the ways you can use them to connect Figma and code components using Code Connect.


### figma.connect

`figma.connect()` has two signatures for connecting components.

```
// connect a component in code to a Figma component
figma.connect(Button, "https://...")

// connect a Figma component to e.g a native element
figma.connect("https://...")
```

The second option is useful if you want to just render a HTML tag instead of a React component. The first argument is used to determine where your component lives in code, in order to generate an import statement for the component. This isn't needed if you just want to render e.g a `button` tag.

```
figma.connect("https://...", {
  example: () => <button>click me</button>
})
```

### Strings

Strings are the simplest value to map from Figma to code. Simply call `figma.string` with the Figma prop name you want to reference as a parameter. This is useful for things like button labels, header titles, tooltips, etc.

```tsx
figma.string('Title')
```

### Booleans

Booleans work similar to strings. However Code Connect also provides helpers for mapping booleans in Figma to more complex types in code. For example you may want to map a Figma boolean to the existence of a specific sublayer in code.

```tsx
// simple mapping of boolean from figma to code
figma.boolean('Has Icon')

// map a boolean value to one of two options of any type
figma.boolean('Has Icon', {
  true: <Icon />,
  false: <Spacer />,
})
```

In some cases, you only want to render a certain prop if it matches some value in Figma. You can do this either by passing a partial mapping object, or setting the value to `undefined`.

```tsx
// Don't render the prop if 'Has Icon' in figma is `false`
figma.boolean('Has Icon', {
  true: <Icon />,
  false: undefined,
})
```

### Enums

Variants (or enums) in Figma are commonly used to control the look and feel of components that require more complex options than a simple boolean toggle. Variant properties are always strings in Figma but they can be mapped to any type in code. The first parameter is the name of the Variant in Figma, and the second parameter is a value mapping. The _keys_ in this object should match the different options of that Variant in Figma, and the _value_ is whatever you want to output instead.

```tsx
// maps the 'Options' variant in Figma to enum values in code
figma.enum('Options', {
  'Option 1': Option.first,
  'Option 2': Option.second,
})

// maps the 'Options' variant in Figma to sub-component values in code
figma.enum('Options', {
  'Option 1': <Icon />,
  'Option 2': <IconButton />,
})

// result is true for disabled variants otherwise undefined
figma.enum('Variant', { Disabled: true })
```

Mapping objects for `figma.enum` as well as `figma.boolean` allows nested references, which is useful if you want to conditionally render a nested instance for example. (see the next section for how to use `figma.instance`)

```tsx
// maps the 'Options' variant in Figma to enum values in code
figma.enum('Type', {
  WithIcon: figma.instance('Icon'),
  WithoutIcon: undefined,
})
```

### Instances

Instances is a Figma term for nested component references. For example, in the case of a `Button` containing an `Icon` as a nested component, we would call the `Icon` an instance. In Figma instances can be properties, (that is, inputs to the component), just like we have render props in code. Similarly to how we can map booleans, enums, and strings from Figma to code, we can also map these to instance props.

To ensure instance properties are as useful as possible with Code Connect, it is advised that you also provide Code Connect for the common components which you would expect to be used as values to this property. Dev Mode will automatically hydrate the referenced component's connected code snippet example and how changes it in Dev Mode for instance props.

```tsx
// maps an instance-swap property from Figma
figma.instance('PropName')
```

The return value of `figma.instance` is a JSX component and can be used in your example like a typical JSX component prop would be in your codebase.

```tsx
figma.connect(Button, 'https://...', {
  props: {
    icon: figma.instance('Icon'),
  },
  example: ({ icon }) => {
    return <Button icon={icon}>Instance prop Example</Button>
  },
})
```

You should then have a separate `figma.connect` call that connects the Icon component with the nested Figma component. Make sure to connect the backing component of that instance, not the instance itself.

```tsx
figma.connect(Icon32Add, 'https://...')
```

### Instance children

It's common for components in Figma to have child instances that aren't bound to an instance-swap prop. Similarly to `figma.instance`, we can render the code snippets for these nested instances with `figma.children`. This helper takes the _name of the instance layer within the parent component_ as its parameter, rather than a Figma prop name.

To illustrate this, consider the layer hierarchy in a component vs an instance of that component:

Button (Component)
  Icon (Instance) -- "Icon" is the original name of the layer, this is what you should pass to `figma.children()`

Button (Instance)
  RenamedIcon (Instance) -- here the instance layer was renamed, which won't break the mapping since we're not using this name

Note that the nested instance also must be connected separately.

> Layer names may differ between variants in a component set. To ensure the component (Button) can render a nested instance (Icon) for any of those variants, you must either use the wildcard option `figma.children("*")` or ensure that the layer name representing the instance (Icon) is the same across all variants of your component set (Button).

```tsx
// map one child instance with the layer name "Tab"
figma.children('Tab')

// map multiple child instances by their layer names to a single prop
figma.children(['Tab 1', 'Tab 2'])
```

### Wildcard match

`figma.children()` can be used with a single wildcard '*' character, to partially match names or to render any nested child. Wildcards cannot be used with the array argument. Matches are case sensitive.

```tsx
// map any (all) child instances
figma.children('*')

// map any child instances that starts with "Icon"
figma.children('Icon*')
```

### Nested properties

In cases where you don't want to connect a child component, but instead map its properties on the parent level, you can use `figma.nestedProps()` to achieve this. This helper takes the name of the layer as it's first parameter, and a mapping object as the second parameter. These props can then be referenced in the example function. `nestedProps` will always select a **single** instance, and cannot be used to map multiple children.

```tsx
// map the properties of a nested instance named "Button Shape"
figma.connect(Button, "https://...", {
  props: {
    buttonShape: figma.nestedProps('Button Shape', {
      size: figma.enum({ ... }),
    })
  },
  example: ({ buttonShape }) => <Button size={buttonShape.size} />
}
```

### Text Content

A common pattern for design systems in Figma is to not use props for texts, but rather rely on instances overriding the text content. `figma.textContent()` allows you to select a child text layer and render its content. It takes a single parameter which is the name of the layer in the original component.

```tsx
figma.connect(Button, "https://...", {
  props: {
    label: figma.textContent("Text Layer")
  },
  example: ({ label }) => <Button>{label}</Button>
}
```

### className

For mapping figma properties to a className string, you can use the `figma.className` helper. It takes an array of strings and returns the concatenated string. Any other helper that returns a string (or undefined) can be used in conjunction with this. Undefined values or empty strings will be filtered out from the result

```tsx
figma.connect("https://...", {
  props: {
    className: figma.className([
      'btn-base',
      figma.enum("Size", { Large: 'btn-large' }),
      figma.boolean("Disabled", { true: 'btn-disabled', false: '' }),
    ])
  },
  example: ({ className }) => <button className={className} />
}
```

In Dev Mode this will display as:
```
<button className="btn-base btn-large btn-disabled" />
```

## Variant restrictions

Sometimes a component in Figma is represented by more than one component in code. For example you may have a single `Button` in your Figma design system with a `type` property to switch between primary, secondary, and danger variants. However, in code this may be represented by three different components, a `PrimaryButton`, `SecondaryButton` and `DangerButton`.

To model this behaviour with Code Connect we can make use of something called variant restrictions. Variant restrictions allow you to provide entirely different code samples for different variants of a single Figma component. The keys and values used should match the name of the variant (or property) in Figma and it's options respectively.

```tsx
figma.connect(PrimaryButton, 'https://...', {
  variant: { Type: 'Primary' },
  example: () => <PrimaryButton />,
})

figma.connect(SecondaryButton, 'https://...', {
  variant: { Type: 'Secondary' },
  example: () => <SecondaryButton />,
})

figma.connect(DangerButton, 'https://...', {
  variant: { Type: 'Danger' },
  example: () => <DangerButton />,
})
```

This will also work for Figma properties that aren't variants (for example, boolean props).

```
figma.connect(IconButton, 'https://...', {
  variant: { "Has Icon": true },
  example: () => <IconButton />,
})
```

In some complex cases you may also want to map a code component to a combination of variants in Figma.

```tsx
figma.connect(DangerButton, 'https://...', {
  variant: { Type: 'Danger', Disabled: true },
  example: () => <DangerButton />,
})
```

You can achieve the same thing using the Storybook API.

```tsx
export default {
  component: Button,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://...',
      examples: [
        { example: PrimaryButtonStory, variant: { Type: 'Primary' } },
        { example: SecondaryButtonStory, variant: { Type: 'Secondary' } },
        { example: DangerButtonStory, variant: { Type: 'Danger' } },
      ],
    },
  },
}

export function PrimaryButtonStory() {
  return <PrimaryButton />
}

export function SecondaryButtonStory() {
  return <SecondaryButton />
}

export function DangerButtonStory() {
  return <DangerButton />
}
```

## Icons

For connecting a lot of icons, we recommend creating a script that pulls icons from a Figma file to generate an `icons.figma.tsx` file that includes all icons. You can use the script [here](./scripts/README.md) as a starting point. The script is marked with "EDIT THIS" in areas where you'll need to make edits for it to work with how your Figma design system is setup and how your icons are defined in code.

## CI / CD

The easiest way to get started using Code Connect is by using the CLI locally. However, once you have set up your first connected components it may be beneficial to integrate Code Connect with your CI/CD environment to simplify maintenance and to ensure component connections are always up to date. Using GitHub actions, we can specify that we want to publish new files when any PR is merged to the main branch. We recommend only running this on pull requests that are relevant to Code Connect to minimize impact on other pull requests.

```yml
on:
  push:
    paths:
      - src/components/**/*.figma.tsx
    branches:
      - main

jobs:
  code-connect:
    name: Code Connect
    runs-on: ubuntu-latest
    steps:
      - run: npx figma connect publish
```

## Co-locating Code Connect files

By default Code Connect creates a new file which lives alongside the components you want to connect to Figma. However, Code Connect may also be co-located with the component it is connecting in code. To do this, simply move the contents of the `<component-name>.figma.tsx` file into your component definition file.

```tsx
import figma from "@figma/code-connect"

interface ButtonProps { ... }
export function Button(props: ButtonProps) { ... }

figma.connect(Button, "https://...", {
  example: () => {
    return <Button />
  }
})
```
