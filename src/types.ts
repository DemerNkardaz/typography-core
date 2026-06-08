export interface TypographyCoreOptions {
	initTypographyRules?: boolean;
	initMarkupRules?: boolean;
	locale?: string;
	plugins?: (() => () => void)[];
	logs?: boolean;
}

export type ResolvedCoreConfig = Required<TypographyCoreOptions>;
