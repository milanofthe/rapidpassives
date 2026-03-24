<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const generators = [
		{ href: '/generator/spiral', label: 'Spiral' },
		{ href: '/generator/symmetric-inductor', label: 'Symmetric' },
		{ href: '/generator/symmetric-transformer', label: 'Interleaved' },
		{ href: '/generator/stacked-transformer', label: 'Stacked' },
		{ href: '/generator/mom-capacitor', label: 'MOM Cap' },
	];

	const isGenerator = $derived(generators.some(t => page.url.pathname === t.href));
	const isViewer = $derived(page.url.pathname === '/viewer');
	const isEditor = $derived(isGenerator || isViewer);
</script>

<div class="app">
	<header>
		<a class="brand" href="/">
			<img src="/favicon.svg" alt="RapidPassives" class="logo" />
		</a>
		{#if isEditor}
			<span class="nav-sep"></span>
			<nav class="tabs">
				{#each generators as tab}
					<a href={tab.href} class="tab" class:active={page.url.pathname === tab.href}>{tab.label}</a>
				{/each}
			</nav>
			<span class="nav-sep"></span>
			<a href="/viewer" class="tab" class:active={isViewer}>Viewer</a>
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
	.nav-sep {
		width: 1px;
		height: 100%;
		background: var(--border);
		flex-shrink: 0;
	}
	main {
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}
</style>
