import {
	getWeightedRules,
	initTypographyRules,
	initMarkupRules,
	isRuleDisabled,
	type FunctionRule,
	type RegExpReplaceRule,
	type RegExpTransformRule,
} from '@yalla/typography-rules';
import { protect, unprotect } from '@yalla/typography-rules/helpers';

import type { ResolvedCoreConfig } from './types';
export type * from './types';

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
		console.warn(`[@yalla/typography] ${message}`);
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
	const rules = getWeightedRules(locale);
	if (rules.length === 0) return text;

	const [initialProtectedValue, protectedMatches] = protect(text);
	let value = initialProtectedValue;

	for (const item of rules) {
		if (!item?.kind) {
			if (config.logs) console.warn('[@yalla/typography] Skipping invalid rule:', item);
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
				console.warn('[@yalla/typography] Rule threw an error, skipping:', item, err);
		}
	}

	return unprotect(value, protectedMatches);
}
