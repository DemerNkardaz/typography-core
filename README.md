# @nkardaz/typography-core

Framework-agnostic core for building typography plugins.
Provides rule initialisation, string-phase processing, locale resolution,
and a plugin factory — with no knowledge of any AST or framework.

Used internally by [@nkardaz/remark-typography](https://github.com/DemerNkardaz/remark-typography)
and intended as the foundation for any custom typography plugin built on
[@nkardaz/typography-rules](https://github.com/DemerNkardaz/typography-rules).

---

## Installation

```bash
npm i -D @nkardaz/typography-core
```

> **Requires Node.js ≥ 24.0.0**

---

## Overview

`@nkardaz/typography-core` does three things:

- **Initialises rules** — registers built-in and custom rule sets via `initRules`
- **Processes strings** — applies all string-phase rules to a text value via `applyRules`
- **Creates plugins** — provides `createTypographyPlugin` as a generic factory for building framework-specific plugins with a standardised config contract

---

## API

### `initRules(config: ResolvedCoreConfig): void`

Registers rule sets based on the resolved config. Called once per plugin instantiation.

```typescript
import { initRules } from '@nkardaz/typography-core';

initRules({
  initTypographyRules: true,
  initMarkupRules: false,
  locale: 'en',
  plugins: [myCustomRules],
  logs: false,
});
```

Behaviour:
- If `initTypographyRules` is `true` — calls `initTypographyRules()` from `@nkardaz/typography-rules`
- If `initMarkupRules` is `true` — calls `initMarkupRules()` from `@nkardaz/typography-rules`
- Runs each plugin in `plugins` as `plugin()()`

---

### `applyRules(text, locale, config): string`

Applies all string-phase rules (`replace`, `transform`, `function→string`) to a text value.
Protected regions (URLs, emails, code spans, etc.) are shielded before rules run and restored after.

```typescript
import { applyRules } from '@nkardaz/typography-core';

const result = applyRules('Hello -- world', 'en', { logs: false });
```

Node-type rules (`kind: 'node'`) are skipped here — they require AST access and are handled
by the framework-specific plugin layer.

---

### `applyNodeRules(textNodes, parent, locale, config): void`

Applies node-phase rules (`kind === 'node'` and `function`→`Node[]`) to a flat list of
text nodes belonging to a single parent element, mutating `parent.children` in-place.

Operates on one level of the tree only — it does not recurse. Traversal and locale
switching across element boundaries is the caller's responsibility (see `processElement`).

Must be called **after** `applyRules` + `joinNodes`/`splitNodes` have already handled
string-phase processing on the same text nodes.

```typescript
import { applyRules, applyNodeRules } from '@nkardaz/typography-core';
import { joinNodes, splitNodes } from '@nkardaz/typography-rules/helpers';
import type { ElementNode, TextNode } from '@nkardaz/typography-rules';

const textNodes = element.children.filter((c): c is TextNode => c.type === 'text');

if (textNodes.length > 0) {
  // Phase 1 — string rules
  const combined = joinNodes(textNodes);
  const transformed = applyRules(combined, locale, { logs: false });
  splitNodes(transformed, textNodes);

  // Phase 2 — node rules (mutates element.children in-place)
  applyNodeRules(textNodes, element, locale, { logs: false });
}
```

| Parameter   | Type                               | Description                                              |
| ----------- | ---------------------------------- | -------------------------------------------------------- |
| `textNodes` | `TextNode[]`                       | Direct text-node children of `parent`, pre-filtered     |
| `parent`    | `ElementNode`                      | The element whose `children` array is mutated on expansion |
| `locale`    | `string`                           | Active locale for rule selection                         |
| `config`    | `Pick<ResolvedCoreConfig, 'logs'>` | Only `logs` is used — controls warning output            |

Rules of `kind: 'function'` are only expanded here if they return `Node[]`.
If a function rule returns a `string`, it is silently skipped (already handled by `applyRules`).

---

### `processElement(element, locale, config): void`

Recursively processes an element and all its descendants, applying both string-phase and
node-phase typography rules. Owns traversal, locale inheritance, and coordinates the
two-phase pipeline at each level of the tree.

Locale is resolved per element: if the element carries a `lang`, `language`, or `locale`
attribute, that value is used for the element's subtree; otherwise the parent's locale is
inherited. This mirrors the `lang` attribute semantics of HTML.

```typescript
import { processElement } from '@nkardaz/typography-core';
import type { ElementNode } from '@nkardaz/typography-rules';

// Process an entire element tree with a base locale
processElement(rootElement, 'en', { logs: false });

// Mixed-locale content is handled automatically via attributes:
// <p lang="ru">Привет — мир</p>  →  processed with Russian rules
// <p>Hello -- world</p>          →  processed with inherited locale
```

| Parameter | Type                               | Description                                                  |
| --------- | ---------------------------------- | ------------------------------------------------------------ |
| `element` | `ElementNode`                      | Root of the subtree to process; `children` mutated in-place  |
| `locale`  | `string`                           | Inherited locale from the parent scope                       |
| `config`  | `Pick<ResolvedCoreConfig, 'logs'>` | Only `logs` is used — controls warning output                |

Locale attribute priority: `lang` → `language` → `locale` → inherited.

> `processElement` works with `ElementNode` from `@nkardaz/typography-rules`. For vanilla DOM,
> write a thin adapter that reads `element.getAttribute('lang')` and maps DOM nodes to
> `ElementNode` — the pipeline logic is identical.

---

### `getFrontmatterLocale(data): string | undefined`

Resolves a locale string from a parsed frontmatter object.
Checks keys in order: `locale` → `lang` → `language`.

```typescript
import { getFrontmatterLocale } from '@nkardaz/typography-core';

const locale = getFrontmatterLocale({ lang: 'ru' }); // → 'ru'
```

---

### `warning(message, showLogs): void`

Emits a prefixed `console.warn` if `showLogs` is `true`.

```typescript
import { warning } from '@nkardaz/typography-core';

warning('No rules registered for locale “is”', config.logs);
```

---

### `createTypographyPlugin(factory): (options?) => handler`

Generic factory for building framework-specific typography plugins.
Handles config merging, default resolution, and `initRules` — so the plugin
author only provides the handler logic.

```typescript
import { createTypographyPlugin } from '@nkardaz/typography-core';

export const myPlugin = createTypographyPlugin({
  defaultOptions: {
    locale: 'de',
  },
  createHandler: (config) => (tree) => {
    // your AST traversal here
    // config is fully resolved: ResolvedCoreConfig & TOptions
  },
});
```

The returned `myPlugin` is a standard two-call plugin function:

```typescript
myPlugin()                     // default options
myPlugin({ locale: 'fr' })    // override options
```

Config resolution order (last wins):

```
factory defaults  ←  createTypographyPlugin defaultOptions  ←  user options
```

---

## Exports

```typescript
// Functions
export { initRules } from '@nkardaz/typography-core';
export { applyRules } from '@nkardaz/typography-core';
export { applyNodeRules } from '@nkardaz/typography-core';
export { processElement } from '@nkardaz/typography-core';
export { getFrontmatterLocale } from '@nkardaz/typography-core';
export { warning } from '@nkardaz/typography-core';
export { createTypographyPlugin } from '@nkardaz/typography-core';

// Types
export type { TypographyCoreOptions, ResolvedCoreConfig, PluginFactory } from '@nkardaz/typography-core';
```

---

## Types

```typescript
import type {
  TypographyCoreOptions,
  ResolvedCoreConfig,
  PluginFactory,
} from '@nkardaz/typography-core';
```

### `TypographyCoreOptions`

Options accepted by any plugin built with `createTypographyPlugin`.

```typescript
export interface TypographyCoreOptions {
  initTypographyRules?: boolean;
  initMarkupRules?: boolean;
  locale?: string;
  plugins?: (() => () => void)[];
  logs?: boolean;
}
```

| Option                | Type                   | Default | Description                                                                 |
| --------------------- | ---------------------- | ------- | --------------------------------------------------------------------------- |
| `initTypographyRules` | `boolean`              | `true`  | Register built-in typography rules from `@nkardaz/typography-rules`           |
| `initMarkupRules`     | `boolean`              | `false` | Register built-in markup rules from `@nkardaz/typography-rules`               |
| `locale`              | `string`               | `'en'`  | Default locale for rule selection                                           |
| `plugins`             | `(() => () => void)[]` | `[]`    | Custom rule plugins. Each is a factory returning a thunk: `() => () => void` |
| `logs`                | `boolean`              | `false` | Emit warnings for missing locales and rule errors                           |

### `ResolvedCoreConfig`

`Required<TypographyCoreOptions>` — all fields guaranteed present. This is what
`createHandler` receives.

### `PluginFactory<TOptions, TTree>`

```typescript
export interface PluginFactory<TOptions extends TypographyCoreOptions, TTree> {
  defaultOptions?: Partial<TOptions>;
  createHandler: (config: ResolvedCoreConfig & TOptions) => (tree: TTree) => void;
}
```

---

## Building a Custom Plugin

Extend `TypographyCoreOptions` with your own fields and pass a typed factory:

```typescript
import { createTypographyPlugin, type TypographyCoreOptions } from '@nkardaz/typography-core';
import { myRules } from './rules';

interface MyPluginOptions extends TypographyCoreOptions {
  strictMode?: boolean;
}

export const myTypographyPlugin = createTypographyPlugin<MyPluginOptions, MyTree>({
  defaultOptions: {
    locale: 'fr',
    plugins: [myRules],
    strictMode: false,
  },
  createHandler: (config) => (tree) => {
    if (config.strictMode) {
      // strict processing
    }
    // traverse tree, call applyRules, etc.
  },
});
```

The factory automatically calls `initRules` with the resolved config before
invoking `createHandler`. No need to call it manually.

---

## Two-Phase Processing Pattern

Typography processing is split into two sequential phases. Both must run in order for full rule coverage.

**Phase 1 — string rules** (`applyRules`): handles `replace`, `transform`, and `function`→`string` rules.
Operates on raw text; protected regions (URLs, code, etc.) are shielded automatically.

**Phase 2 — node rules** (`applyNodeRules`): handles `node` and `function`→`Node[]` rules.
Expands text nodes into mixed text/element trees (e.g. wrapping `H[^2]O` into `H<sup>2</sup>O`).
Must run after phase 1 because node expansion on unsettled text produces incorrect results.

The helpers `joinNodes` / `splitNodes` from `@nkardaz/typography-rules/helpers` bridge sibling text
nodes into a single string before phase 1, so rules can see context across node boundaries.

For most cases `processElement` handles both phases and full traversal automatically:

```typescript
import { processElement } from '@nkardaz/typography-core';

processElement(rootElement, 'en', { logs: false });
```

When building a custom plugin that needs finer control, the two phases can be called directly.
This is exactly what `processElement` does internally at each level:

```typescript
import { joinNodes, splitNodes } from '@nkardaz/typography-rules/helpers';
import { applyRules, applyNodeRules } from '@nkardaz/typography-core';
import type { ElementNode, TextNode } from '@nkardaz/typography-rules';

function processLevel(element: ElementNode, locale: string, config: ResolvedCoreConfig) {
  const lang =
    element.attrs?.['lang'] ??
    element.attrs?.['language'] ??
    element.attrs?.['locale'] ??
    locale;

  const textNodes = element.children.filter((c): c is TextNode => c.type === 'text');

  if (textNodes.length > 0) {
    // Phase 1 — join siblings → string rules → split back
    const combined = joinNodes(textNodes);
    const transformed = applyRules(combined, lang, config);
    splitNodes(transformed, textNodes);

    // Phase 2 — node-expanding rules
    applyNodeRules(textNodes, element, lang, config);
  }

  // Recurse into non-text children with updated locale
  for (const child of element.children) {
    if (child.type !== 'text') {
      processLevel(child as ElementNode, lang, config);
    }
  }
}
```

> `applyNodeRules` operates on a single level only — it does not recurse.
> Traversal and locale propagation are always the caller's responsibility.
