<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const tabs = [
		{ href: '/spiral', label: 'Spiral Inductor' },
		{ href: '/symmetric-inductor', label: 'Symmetric Inductor' },
		{ href: '/symmetric-transformer', label: 'Interleaved Transformer' },
		{ href: '/stacked-transformer', label: 'Stacked Transformer' },
		{ href: '/mom-capacitor', label: 'MOM Capacitor' },
	];

	const isEditor = $derived(tabs.some(t => page.url.pathname === t.href));
</script>

<div class="app">
	<header>
		<a class="brand" href="/">
			<img src="/favicon.svg" alt="RapidPassives" class="logo" />
		</a>
		{#if isEditor}
			<nav class="tabs">
				{#each tabs as tab}
					<a
						href={tab.href}
						class="tab"
						class:active={page.url.pathname === tab.href}
					>{tab.label}</a>
				{/each}
			</nav>
		{/if}
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	header {
		display: flex;
		align-items: center;
		padding: 0 16px;
		height: 36px;
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		gap: 12px;
	}
	.brand {
		text-decoration: none;
	}
	.logo {
		height: 22px;
		width: auto;
		display: block;
	}
.tabs {
		display: flex;
		gap: 0;
		height: 100%;
	}
	.tab {
		display: flex;
		align-items: center;
		padding: 0 14px;
		font-size: var(--fs-xs);
		font-weight: 600;
		font-family: var(--font-mono);
		letter-spacing: 0.5px;
		color: var(--text-dim);
		text-decoration: none;
		transition: color 0.15s;
	}
	.tab:hover {
		color: var(--text-muted);
	}
	.tab.active {
		color: var(--accent);
	}
	main {
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}
</style>
