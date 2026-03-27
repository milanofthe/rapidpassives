import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: '404.html'
		}),
		prerender: {
			handleHttpError: ({ path }) => {
				// Static files in /embed/ are served at runtime, not during prerender
				if (path.startsWith('/embed/') || path.startsWith('/cards/')) return;
				throw new Error(`404: ${path}`);
			}
		}
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	}
};

export default config;
