import {
	getWeightedRules,
	initTypographyRules,
	initMarkupRules,
	isRuleDisabled,
	htmlNode,
	ALIAS,
	type FunctionRule,
	type NodeFunctionRule,
	type RegExpReplaceRule,
	type RegExpTransformRule,
	type Node,
	type ElementNode,
	type TextNode,
} from '@nkardaz/typography-rules';
import { joinNodes, protect, splitNodes, unprotect } from '@nkardaz/typography-rules/helpers';

import type { ResolvedCoreConfig } from './types';
export * from './factory';
export type * from './types';

import { createTypographyPlugin } from './factory';
export default createTypographyPlugin;

export function initRules(config: ResolvedCoreConfig): void {
	if (config.initTypographyRules) {
		initTypographyRules();
	}
	if (config.initMarkupRules) {
		initMarkupRules();
	}
	config.plugins?.forEach((plugin) => plugin()());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function warning(message: string, showLogs: boolean): void {
	if (showLogs) {
		console.warn(`[@nkardaz/typography] ${message}`);
	}
}

/**
 * Resolve locale from a parsed frontmatter data object.
 * Checks keys in order: `locale` → `lang` → `language`.
 */
export function getFrontmatterLocale(data: Record<string, unknown> | null): string | undefined {
	if (!data) return undefined;
	return (
		(typeof data['locale'] === 'string' ? data['locale'] : undefined) ??
		(typeof data['lang'] === 'string' ? data['lang'] : undefined) ??
		(typeof data['language'] === 'string' ? data['language'] : undefined)
	);
}

// ─── Core string processing ───────────────────────────────────────────────────

/**
 * Apply all string-phase rules (replace / transform / function→string) to `text`.
 * Protected regions (URLs, emails, code spans, …) are shielded before rules run.
 *
 * This is the only processing function that is truly framework-agnostic:
 * it operates purely on strings and has no knowledge of any AST.
 */
export function applyRules(
	text: string,
	locale: string,
	config: Pick<ResolvedCoreConfig, 'logs'>
): string {
	const key = ALIAS.resolve(locale) ?? locale;
	const rules = getWeightedRules(key);
	if (rules.length === 0) return text;

	const [initialProtectedValue, protectedMatches] = protect(text, key);
	let value = initialProtectedValue;

	for (const item of rules) {
		if (!item?.kind) {
			if (config.logs) console.warn('[@nkardaz/typography] Skipping invalid rule:', item);
			continue;
		}

		if (item.label && isRuleDisabled(item.label)) continue;
		if (item.kind === 'node') continue;

		try {
			switch (item.kind) {
				case 'function': {
					const funcItem = item as FunctionRule;
					const result = funcItem.rule(value, ...(funcItem.args ?? []));
					if (typeof result === 'string') value = result;
					break;
				}
				case 'transform': {
					const transformItem = item as RegExpTransformRule;
					value = value.replace(transformItem.rule, (match: string, ...groups: unknown[]) => {
						const regexArray = [match, ...groups] as unknown as RegExpExecArray;
						return transformItem.transform(regexArray);
					});
					break;
				}
				case 'replace': {
					const replaceItem = item as RegExpReplaceRule;
					value = value.replace(replaceItem.rule, replaceItem.replacement);
					break;
				}
			}
		} catch (err) {
			if (config.logs)
				console.warn('[@nkardaz/typography] Rule threw an error, skipping:', item, err);
		}
	}

	return unprotect(value, protectedMatches);
}

// ─── Core node processing ─────────────────────────────────────────────────────

/**
 * Apply node-phase rules (kind === 'node' | 'function'→Node[]) to a flat list
 * of text nodes belonging to a single parent element, mutating the parent's
 * children array in-place.
 *
 * This function operates on one level of the tree only — it does not recurse.
 * Traversal and locale switching across element boundaries is the caller's
 * responsibility (see `processElement`).
 *
 * Must be called *after* `applyRules` + `joinNodes`/`splitNodes` have already
 * handled string-phase processing on the same text nodes.
 *
 * @param textNodes - Direct text-node children of `parent`, pre-filtered by the caller
 * @param parent    - The element whose `children` array will be mutated on expansion
 * @param locale    - Active locale for rule selection
 * @param config    - Core config; only `logs` is used
 */
export function applyNodeRules(
	textNodes: TextNode[],
	parent: ElementNode,
	locale: string,
	config: Pick<ResolvedCoreConfig, 'logs'>
): void {
	const key = ALIAS.resolve(locale) ?? locale;

	const rules = getWeightedRules(key).filter(
		(r): r is NodeFunctionRule | FunctionRule => r.kind === 'node' || r.kind === 'function'
	);

	if (rules.length === 0) return;

	for (const textNode of textNodes) {
		let current: Node[] = [textNode];

		for (const rule of rules) {
			if (rule.label && isRuleDisabled(rule.label)) continue;

			const next: Node[] = [];

			for (const node of current) {
				if (node.type !== 'text') {
					next.push(node);
					continue;
				}

				const textValue = (node as TextNode).value;
				let nodeList: Node[];

				try {
					if (rule.kind === 'node') {
						const nodeRule = rule as NodeFunctionRule;
						nodeList = htmlNode(textValue, {
							expression: nodeRule.rule,
							nodes: nodeRule.nodes,
						});
					} else {
						const funcRule = rule as FunctionRule;
						const result = funcRule.rule(textValue, ...(funcRule.args ?? []));

						if (typeof result === 'string' || !Array.isArray(result)) {
							next.push(node);
							continue;
						}

						nodeList = result as Node[];
					}
				} catch (err) {
					if (config.logs)
						console.warn('[@nkardaz/typography] Node rule threw an error, skipping:', rule, err);
					next.push(node);
					continue;
				}

				if (
					nodeList.length === 1 &&
					nodeList[0]!.type === 'text' &&
					(nodeList[0] as TextNode).value === textValue
				) {
					next.push(node);
					continue;
				}

				for (const n of nodeList) next.push(n);
			}

			current = next;
		}

		if (current.length === 1 && current[0] === textNode) continue;

		const index = parent.children.indexOf(textNode);
		if (index !== -1) {
			parent.children.splice(index, 1, ...current);
		}
	}
}

/**
 * Recursively processes an element and all its descendants, applying both
 * string-phase and node-phase typography rules.
 *
 * Mirrors the role of `processNode` in the remark plugin: it owns the locale
 * stack, handles `lang`/`language`/`locale` attribute switching on child
 * elements, and coordinates the two-phase pipeline for each level:
 *   1. `joinNodes` → `applyRules` → `splitNodes`  (string phase)
 *   2. `applyNodeRules`                            (node phase)
 *
 * @param element - The element to process; its `children` array is mutated in-place
 * @param locale  - Inherited locale from the parent scope
 * @param config  - Core config; only `logs` is used
 */
export function processElement(
	element: ElementNode,
	locale: string,
	config: Pick<ResolvedCoreConfig, 'logs'>
): void {
	const lang =
		element.attrs?.['lang'] ?? element.attrs?.['language'] ?? element.attrs?.['locale'] ?? locale;

	const textNodes = element.children.filter((c): c is TextNode => c.type === 'text');

	if (textNodes.length > 0) {
		const combined = joinNodes(textNodes);
		const transformed = applyRules(combined, lang, config);
		splitNodes(transformed, textNodes);
		applyNodeRules(textNodes, element, lang, config);
	}

	for (const child of element.children) {
		if (child.type !== 'text') {
			processElement(child as ElementNode, lang, config);
		}
	}
}
