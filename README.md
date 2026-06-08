# @yalla/typography-core

Framework-agnostic core for building typography plugins.
Provides rule initialisation, string-phase processing, locale resolution,
and a plugin factory — with no knowledge of any AST or framework.

Used internally by [@yalla/remark-typography](https://github.com/DemerNkardaz/remark-typography)
and intended as the foundation for any custom typography plugin built on
[@yalla/typography-rules](https://github.com/DemerNkardaz/typography-rules).

---

## Installation

```bash
npm i -D @yalla/typography-core
```

> **Requires Node.js ≥ 24.0.0**

---

## Overview

`@yalla/typography-core` does three things:

- **Initialises rules** — registers built-in and custom rule sets via `initRules`
- **Processes strings** — applies all string-phase rules to a text value via `applyRules`
- **Creates plugins** — provides `createTypographyPlugin` as a generic factory for building framework-specific plugins with a standardised config contract

---

## API

### `initRules(config: ResolvedCoreConfig): void`

Registers rule sets based on the resolved config. Called once per plugin instantiation.

```typescript
import { initRules } from '@yalla/typography-core';

initRules({
  initTypographyRules: true,
  initMarkupRules: false,
  locale: 'en',
  plugins: [myCustomRules],
  logs: false,
});
```

Behaviour:
- If `initTypographyRules` is `true` — calls `initTypographyRules()` from `@yalla/typography-rules`
- If `initMarkupRules` is `true` — calls `initMarkupRules()` from `@yalla/typography-rules`
- Runs each plugin in `plugins` as `plugin()()`

---

### `applyRules(text, locale, config): string`

Applies all string-phase rules (`replace`, `transform`, `function→string`) to a text value.
Protected regions (URLs, emails, code spans, etc.) are shielded before rules run and restored after.

```typescript
import { applyRules } from '@yalla/typography-core';

const result = applyRules('Hello -- world', 'en', { logs: false });
```

Node-type rules (`kind: 'node'`) are skipped here — they require AST access and are handled
by the framework-specific plugin layer.

---

### `getFrontmatterLocale(data): string | undefined`

Resolves a locale string from a parsed frontmatter object.
Checks keys in order: `locale` → `lang` → `language`.

```typescript
import { getFrontmatterLocale } from '@yalla/typography-core';

const locale = getFrontmatterLocale({ lang: 'ru' }); // → 'ru'
```

---

### `warning(message, showLogs): void`

Emits a prefixed `console.warn` if `showLogs` is `true`.

```typescript
import { warning } from '@yalla/typography-core';

warning('No rules registered for locale “is”', config.logs);
```

---

### `createTypographyPlugin(factory): (options?) => handler`

Generic factory for building framework-specific typography plugins.
Handles config merging, default resolution, and `initRules` — so the plugin
author only provides the handler logic.

```typescript
import { createTypographyPlugin } from '@yalla/typography-core';

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

## Types

```typescript
import type {
  TypographyCoreOptions,
  ResolvedCoreConfig,
  PluginFactory,
} from '@yalla/typography-core';
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
| `initTypographyRules` | `boolean`              | `true`  | Register built-in typography rules from `@yalla/typography-rules`           |
| `initMarkupRules`     | `boolean`              | `false` | Register built-in markup rules from `@yalla/typography-rules`               |
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
import { createTypographyPlugin, type TypographyCoreOptions } from '@yalla/typography-core';
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
