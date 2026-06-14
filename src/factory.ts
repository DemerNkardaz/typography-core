import { ALIAS } from '@nkardaz/typography-rules';
import { initRules } from '.';
import type { ResolvedCoreConfig, TypographyCoreOptions } from './types';

export interface PluginFactory<TOptions extends TypographyCoreOptions, TTree> {
	defaultOptions?: Partial<TOptions>;
	createHandler: (config: ResolvedCoreConfig & TOptions) => (tree: TTree) => void;
}

export function createTypographyPlugin<TOptions extends TypographyCoreOptions, TTree>(
	factory: PluginFactory<TOptions, TTree>
) {
	return function plugin(options: Partial<TOptions> = {}) {
		const resolved = {
			initTypographyRules: true,
			initMarkupRules: false,
			logs: false,
			locale: 'en',
			plugins: [],
			...factory.defaultOptions,
			...options,
		} as ResolvedCoreConfig;

		resolved.locale = ALIAS.resolve(resolved.locale) ?? resolved.locale;

		initRules(resolved);

		return factory.createHandler(resolved as TOptions & ResolvedCoreConfig);
	};
}
