# Code Connect (HTML)

> [!IMPORTANT]
> HTML support for Code Connect is in preview, and the API is liable to change during this period. Please let us know your feedback via [GitHub Issues](https://github.com/figma/code-connect/issues/new/choose).

For more information about Code Connect as well as guides for other platforms and frameworks, please [go here](../README.md).

This documentation will help you connect your HTML components with Figma components using Code Connect. This allows you to document Web Components, Angular, Vue, and any other framework which uses HTML syntax. See the [examples](#examples) section for examples of using Code Connect HTML with various HTML-based frameworks.

We'll cover basic setup to display your first connected code snippet, followed by making snippets dynamic by using property mappings.

## Installation

Code Connect is used through a command line interface (CLI). The CLI comes bundled with the `@figma/code-connect` package, which you'll need to install through `npm`. This package also includes helper functions and types associated with Code Connect, which you import from `@figma/code-connect/html`.

Install this package into your project's directory.

```sh
npm install @figma/code-connect
```

> [!NOTE]
> Code Connect uses [package.json entry points](https://nodejs.org/api/packages.html#packages_package_entry_points), which requires `"moduleResolution": "NodeNext"` in your `tsconfig.json`. If this is a problem for your project, please let us know via [GitHub Issues](https://github.com/figma/code-connect/issues/new/choose).

## Basic setup

To connect your first component go to Dev Mode in Figma and right-click on the component you want to connect, then choose `Copy link to selection` from the menu. Make sure you are copying the link to a main component and not an instance of the component. The main component will typically be located in a centralized design system library file. Using this link, run `figma connect create` from inside your project. Note that depending on what terminal software you're using, you might need to wrap the URL in quotes.

```sh
npx figma connect create "https://..." --token <auth token>
```

This will create a Code Connect file with some basic scaffolding for the component you want to connect. By default this file will be called `<component-name>.figma.ts` based on the name of the component in Figma. However, you may rename this file as you see fit. The scaffolding that is generated is based on the interface of the component in Figma. Depending on how closely this matches your code component you'll need to make some edits to this file before you publish it.

Some CLI commands, like `create`, require a valid [authentication token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens) with write permission for the Code Connect scope as well as the read permission for the File content scope. You can either pass this via the `--token` flag, or set the `FIGMA_ACCESS_TOKEN` environment variable. The Figma CLI reads this from a `.env` file in the same folder, if it exists.

To keep things simple, we're going to start by replacing the contents of the generated file with the most basic Code Connect configuration possible to make sure everything is set up and working as expected. Replace the contents of the file with the following, replacing the `<ds-button>` reference with a reference to whatever component you are trying to connect.

The object called by `figma.connect` is your Code Connect doc. Code Connect HTML support uses template literals tagged with the `html` tag for the example code. The code inside these literals will be formatted correctly by Prettier.

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://...', {
  example: () => html`<ds-button></ds-button>`
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

The interactive setup flow is not currently supported for HTML projects.

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
- `--label <label>` For publishing or unpublishing under a custom label

## Configuration

To configure the behaviour of the CLI and Code Connect you can create a `figma.config.json` file. This file must be located in the project root, i.e. alongside your `package.json` file. This config file will automatically be picked up by the CLI if it's in the same folder where you run the commands, but you can also specify a path to the config file via the `--config` flag.

See the [general configuration](../README.md#general-configuration) documentation for information about the support configuration options.

### `label`

For HTML projects, Code Connect sets the default label based on HTML-based frameworks detected in the first ancestor `package.json` of the working directory which matches one of the following:

- If a `package.json` containing `angular` is found, the label is set to `Angular`
- If a `package.json` containing `vue` is found, the label is set to `Vue`
- Otherwise, the label is set to `Web Components`

## Dynamic code snippets

With the basic setup as described above, you should have a connected code snippet visible in Dev Mode when inspecting instances of that component. However, the code snippet doesn't yet reflect the entirety of the design. For example, we see the same code snippet for a button whether it has the `type` variant set to `primary` or `secondary`.

To ensure the connected code snippet accurately reflects the design, we need to make use of property mappings. This enables you to link specific props in the design to props in code. In most cases, design and code props don't match 1:1, so it's necessary for us to configure this to ensure the correct code is shown in Dev Mode.

Here is a simple example for a button with a `label`, `disabled`, and `type` property.

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://...', {
  props: {
    label: figma.string('Text Content'),
    disabled: figma.boolean('Disabled'),
    type: figma.enum('Type', {
      Primary: 'primary',
      Secondary: 'secondary',
    }),
  },
  example: ({ disabled, label, type }) => html`\
<ds-button disabled=${disabled} type=${type}>
  ${label}
</ds-button>`
})
```

Figma properties can be inserted in the Code Connect example using template string interpolation, e.g. `${disabled}`. For HTML element attributes, Code Connect uses the type of the Figma property to render it correctly, so `disabled=${disabled}` will either render `disabled` or nothing, as it is a boolean; whereas `type=${type}` will render `type="primary"`, as it is a string.

The `figma` import contains helpers for mapping all sorts of properties from design to code. They work for simple mappings where only the naming differs between Figma and code, as well as more complex mappings where the type differs. See the below reference for all the helpers that exist and the ways you can use them to connect Figma and code components using Code Connect.

### Strings

Strings are the simplest value to map from Figma to code. Simply call `figma.string` with the Figma prop name you want to reference as a parameter. This is useful for things like button labels, header titles, tooltips, etc.

```ts
figma.string('Title')
```

### Booleans

Booleans work similar to strings. However Code Connect also provides helpers for mapping booleans in Figma to more complex types in code. For example you may want to map a Figma boolean to the existence of a specific sublayer in code. In addition to mapping boolean props, `figma.boolean` can be used to map boolean Variants in Figma. A boolean Variant is a Variant with only two options that are either "Yes"/"No", "True"/"False" or "On"/Off". For `figma.boolean` these values are normalized to `true` and `false`.

```ts
// simple mapping of boolean from figma to code
figma.boolean('Has Icon')

// map a boolean value to one of two options of any type
figma.boolean('Has Icon', {
  true: html`<ds-icon></ds-icon>`,
  false: html`<ds-spacer></ds-spacer>`,
})
```

In some cases, you only want to render a certain prop if it matches some value in Figma. You can do this either by passing a partial mapping object, or setting the value to `undefined`.

```ts
// Don't render the prop if 'Has label' in figma is `false`
figma.boolean('Has label', {
  true: figma.string('Label'),
  false: undefined,
})
```

### Enums

Variants (or enums) in Figma are commonly used to control the look and feel of components that require more complex options than a simple boolean toggle. Variant properties are always strings in Figma but they can be mapped to any type in code. The first parameter is the name of the Variant in Figma, and the second parameter is a value mapping. The _keys_ in this object should match the different options of that Variant in Figma, and the _value_ is whatever you want to output instead.

```ts
// maps the 'Options' variant in Figma to enum values in code
figma.enum('Options', {
  'Option 1': Option.first,
  'Option 2': Option.second,
})

// maps the 'Options' variant in Figma to sub-component values in code
figma.enum('Options', {
  'Option 1': html`<ds-icon></ds-icon>`,
  'Option 2': html`<ds-icon-button></ds-icon-button>`,
})

// result is true for disabled variants otherwise undefined
figma.enum('Variant', { Disabled: true })

// enums mappings can be used to show a component based on a Figma variant
figma.connect('https://...', {
  props: {
    cancelButton: figma.enum('Type', {
      Cancellable: html`<ds-cancel-button></ds-cancel-button>`
    }),
    // ...
  },
  example: ({ cancelButton }) => html`\
<ds-modal>
  <ds-modal-title>Title</ds-modal-title>
  <ds-modal-content>Some content</ds-modal-content>
  ${cancelButton}
</ds-modal>`
  },
})
```

Mapping objects for `figma.enum` as well as `figma.boolean` allows nested references, which is useful if you want to conditionally render a nested instance for example. (see the next section for how to use `figma.instance`)

```ts
// maps the 'Options' variant in Figma to enum values in code
figma.enum('Type', {
  WithIcon: figma.instance('Icon'),
  WithoutIcon: undefined,
})
```

Note that in contrast to `figma.boolean`, values are _not_ normalized for `figma.enum`. You always need to pass the exact literal values to the mapping object.

```ts
// These two are equivalent for a variant with the options "Yes" and "No"
disabled: figma.enum("Boolean Variant", {
  Yes: // ...
  No: // ...
})
disabled: figma.boolean("Boolean Variant", {
  true: // ...
  false: // ...
})
```

### Instances

Instances is a Figma term for nested component references. For example, in the case of a `Button` containing an `Icon` as a nested component, we would call the `Icon` an instance. In Figma instances can be properties, (that is, inputs to the component), just like we have render props in code. Similarly to how we can map booleans, enums, and strings from Figma to code, we can also map these to instance props.

To ensure instance properties are as useful as possible with Code Connect, it is advised that you also provide Code Connect for the common components which you would expect to be used as values to this property. Dev Mode will automatically hydrate the referenced component's connected code snippet example and how changes it in Dev Mode for instance props.

```ts
// maps an instance-swap property from Figma
figma.instance('PropName')
```

The return value of `figma.instance` is a `html` tagged template literal and can be used in your example as a child element.

```ts
figma.connect('https://...', {
  props: {
    icon: figma.instance('Icon'),
  },
  example: ({ icon }) => html`<ds-button><div slot="icon">${icon}</div> Instance prop Example</ds-button>`
})
```

You should then have a separate `figma.connect` call that connects the Icon component with the nested Figma component. Make sure to connect the backing component of that instance, not the instance itself.

```ts
figma.connect('https://...', {
  example: () => html`<ds-icon icon="add"></ds-icon>`
})
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

```ts
// map one child instance with the layer name "Tab"
figma.children('Tab')

// map multiple child instances by their layer names to a single prop
figma.children(['Tab 1', 'Tab 2'])
```

### Wildcard match

`figma.children()` can be used with a single wildcard '\*' character, to partially match names or to render any nested child. Wildcards cannot be used with the array argument. Matches are case sensitive.

```ts
// map any (all) child instances
figma.children('*')

// map any child instances that starts with "Icon"
figma.children('Icon*')
```

### Nested properties

In cases where you don't want to connect a child component, but instead map its properties on the parent level, you can use `figma.nestedProps()` to achieve this. This helper takes the name of the layer as it's first parameter, and a mapping object as the second parameter. These props can then be referenced in the example function. `nestedProps` will always select a **single** instance, and cannot be used to map multiple children.

```ts
// map the properties of a nested instance named "Button Shape"
figma.connect("https://...", {
  props: {
    buttonShape: figma.nestedProps('Button Shape', {
      size: figma.enum({ ... }),
    })
  },
  example: ({ buttonShape }) => html`<ds-button size=${buttonShape.size}></ds-button>`
}
```

### Text Content

A common pattern for design systems in Figma is to not use props for texts, but rather rely on instances overriding the text content. `figma.textContent()` allows you to select a child text layer and render its content. It takes a single parameter which is the name of the layer in the original component.

```ts
figma.connect("https://...", {
  props: {
    label: figma.textContent("Text Layer")
  },
  example: ({ label }) => html`<ds-button>${label}</ds-button>`
}
```

### className

For mapping figma properties to a className string, you can use the `figma.className` helper. It takes an array of strings and returns the concatenated string. Any other helper that returns a string (or undefined) can be used in conjunction with this. Undefined values or empty strings will be filtered out from the result

```ts
figma.connect("https://...", {
  props: {
    className: figma.className([
      'btn-base',
      figma.enum("Size", { Large: 'btn-large' }),
      figma.boolean("Disabled", { true: 'btn-disabled', false: '' }),
    ])
  },
  example: ({ className }) => html`<button class=${className}></button>`
}
```

In Dev Mode this will display as:

```
<button class="btn-base btn-large btn-disabled"></button>
```

## Variant restrictions

Sometimes a component in Figma is represented by more than one component in code. For example you may have a single `Button` in your Figma design system with a `type` property to switch between primary, secondary, and danger variants. However, in code this may be represented by three different components, a `<ds-button-primary>`, `<ds-button-secondary>` and `<ds-button-danger>`.

To model this behaviour with Code Connect we can make use of something called variant restrictions. Variant restrictions allow you to provide entirely different code samples for different variants of a single Figma component. The keys and values used should match the name of the variant (or property) in Figma and it's options respectively.

```ts
figma.connect('https://...', {
  variant: { Type: 'Primary' },
  example: () => html`<ds-button-primary></ds-button-primary>`,
})

figma.connect('https://...', {
  variant: { Type: 'Secondary' },
  example: () => html`<ds-button-secondary></ds-button-secondary>`,
})

figma.connect('https://...', {
  variant: { Type: 'Danger' },
  example: () => html`<ds-button-danger></ds-button-danger>`,
})
```

This will also work for Figma properties that aren't variants (for example, boolean props).

```ts
figma.connect('https://...', {
  variant: { "Has Icon": true },
  example: () => html`<ds-icon-button></ds-icon-button>`,
})
```

In some complex cases you may also want to map a code component to a combination of variants in Figma.

```ts
figma.connect('https://...', {
  variant: { Type: 'Danger', Disabled: true },
  example: () => html`<ds-button-danger></ds-button-danger>`,
})
```

## Examples

Code Connect HTML supports any valid HTML markup, and so in addition to documenting plain HTML and Web Components, can also be used for documenting HTML-based frameworks such as Angular and Vue. Any JavaScript/TypeScript code accompanying the HTML code must be enclosed in a `<script>` tag.

Angular and Vue projects will be auto-detected based on their presence in `package.json`, and the default label for your examples will be set appropriately (see [label](#label) docs for more information).

### Web Components example

```ts
import figma, { html } from '@figma/code-connect/html';

figma.connect('https://...', {
  props: {
    text: figma.string('Text'),
    disabled: figma.boolean('Disabled'),
    size: figma.enum('Size', {
      'small': 'sm',
      'large': 'lg'
    })
  },
  example: (props) =>
      html`\
<ds-button
  disabled=${props.disabled}
  size=${props.size}
>
  ${props.text}
</ds-button>

<script>
  document.querySelector('ds-button')
    .addEventListener('click', () => {
      alert("You clicked ${props.text}");
    })
</script>`,
    imports: ['<script type="module" src="https://my.domain/js/ds-button.min.js">'],
  }
)
```

### Angular example

```ts
import figma, { html } from '@figma/code-connect/html';

figma.connect('https://...', {
  props: {
    text: figma.string('Text'),
    disabled: figma.boolean('Disabled'),
    size: figma.enum('Size', {
      'small': 'sm',
      'large': 'lg'
    })
  },
  example: (props) =>
      html`\
<button
  dsButton
  disabled=${props.disabled}
  size=${props.size}
  (onClick)="onClick($event)"
>
  ${props.text}
</button>

<script>
  export class Example {
    public onClick() {
      alert("You clicked ${props.text}");
    }
  }
</script>`,
    imports: ["import { DsButton } from '@ds-angular/button'"],
  }
)
```

### Vue example

```ts
import figma, { html } from '@figma/code-connect/html';

figma.connect('https://...', {
  props: {
    text: figma.string('Text'),
    disabled: figma.boolean('Disabled'),
    size: figma.enum('Size', {
      'small': 'sm',
      'large': 'lg'
    })
  },
  example: (props) =>
      html`\
<script setup>
  function onClick() {
    alert('You clicked ${props.text}');
  }
</script>

<ds-button
  disabled=${props.disabled}
  size=${props.size}
  @click="onClick"
>
  ${props.text}
</ds-button>`,
    imports: ["import { DsButton } from '@ds-vue/button'"],
  }
)
```

### Lit example

As the example code is written in a template string, you need to escape any `$` symbols which you want to render verbatim in your example, otherwise they'll be interpreted as placeholders.

```ts
import figma, { html } from '@figma/code-connect/html';

figma.connect('https://...', {
  props: {
    text: figma.string('Text'),
    disabled: figma.boolean('Disabled')
  },
  example: (props) =>
      html`\
<ds-button
  disabled=${props.disabled}
  size=${props.size}
  ?litSyntaxExample=\${booleanVar}
>
  ${props.text}
</ds-button>`,
    imports: ["import '@ds-lit/button'"],
  }
)
```

## CI / CD

The easiest way to get started using Code Connect is by using the CLI locally. However, once you have set up your first connected components it may be beneficial to integrate Code Connect with your CI/CD environment to simplify maintenance and to ensure component connections are always up to date. Using GitHub actions, we can specify that we want to publish new files when any PR is merged to the main branch. We recommend only running this on pull requests that are relevant to Code Connect to minimize impact on other pull requests.

```yml
on:
  push:
    paths:
      - src/components/**/*.figma.ts
    branches:
      - main

jobs:
  code-connect:
    name: Code Connect
    runs-on: ubuntu-latest
    steps:
      - run: npx figma connect publish --exit-on-unreadable-files
```

