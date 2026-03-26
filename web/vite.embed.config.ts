import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, 'src/embed/gds-viewer.ts'),
			name: 'GdsViewer',
			fileName: 'gds-viewer',
			formats: ['iife'],
		},
		outDir: 'static/embed',
		emptyOutDir: true,
		rollupOptions: {
			output: {
				entryFileNames: 'gds-viewer.js',
			},
		},
	},
	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib'),
		},
	},
	worker: {
		format: 'iife',
		rollupOptions: {
			output: {
				entryFileNames: 'assets/[name].js',
			},
		},
	},
});
