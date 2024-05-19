import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	test: {
		include: ['tests/**/*.{test,spec}.{js,ts}']
	},
	plugins: [tsconfigPaths()]
});
