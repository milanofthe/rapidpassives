import { sveltekit } from '@sveltejs/kit/vite';
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [wasm(), sveltekit()],
	resolve: {
		alias: {
			'gds-wasm': path.resolve(__dirname, '../wasm/pkg'),
		},
	},
	worker: {
		plugins: () => [wasm()],
	},
	server: {
		fs: {
			allow: ['..'],
		},
	},
});
