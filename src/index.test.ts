import { describe, it, expect } from 'vitest';
import { greet } from './index';

describe('greet', () => {
	it('should greet with a default name', () => {
		const result = greet();
		expect(result).toBe('Hello World');
	});

	it('should greet with a provided name', () => {
		const result = greet('Alice');
		expect(result).toBe('Hello Alice');
	});
});
