<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { children } = $props();
	let globalDragOver = $state(false);
	let globalDragCounter = 0;

	function onGlobalDragEnter(e: DragEvent) {
		// Only react to file drops, not internal drags
		if (!e.dataTransfer?.types.includes('Files')) return;
		// Don't show overlay if already on viewer page
		if (page.url.pathname === '/viewer') return;
		e.preventDefault();
		globalDragCounter++;
		globalDragOver = true;
	}

	function onGlobalDragOver(e: DragEvent) {
		if (!globalDragOver) return;
		e.preventDefault();
	}

	function onGlobalDragLeave() {
		globalDragCounter--;
		if (globalDragCounter <= 0) {
			globalDragCounter = 0;
			globalDragOver = false;
		}
	}

	function onGlobalDrop(e: DragEvent) {
		e.preventDefault();
		globalDragCounter = 0;
		globalDragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file && /\.(gds|gdsii|gds2)$/i.test(file.name)) {
			(window as any).__gdsPendingFile = file;
			goto('/viewer');
		}
	}

	const generators = [
		{ href: '/generator/spiral', label: 'Spiral' },
		{ href: '/generator/symmetric-inductor', label: 'Symmetric' },
		{ href: '/generator/symmetric-transformer', label: 'Interleaved' },
		{ href: '/generator/stacked-transformer', label: 'Stacked' },
		{ href: '/generator/mom-capacitor', label: 'MOM Cap' },
		{ href: '/generator/patch-antenna', label: 'Patch' },
		{ href: '/generator/ratrace-coupler', label: 'Rat-Race' },
		{ href: '/generator/meander-line', label: 'Meander' },
		{ href: '/generator/balun', label: 'Balun' },
	];

	const isGenerator = $derived(generators.some(t => page.url.pathname === t.href));
	const isViewer = $derived(page.url.pathname === '/viewer');
	const isEditor = $derived(isGenerator || isViewer);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="app"
	ondragenter={onGlobalDragEnter}
	ondragover={onGlobalDragOver}
	ondragleave={onGlobalDragLeave}
	ondrop={onGlobalDrop}
>
	{#if globalDragOver}
		<div class="global-drop-overlay">
			<div class="global-drop-prompt">
				<svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
					<rect x="8" y="6" width="32" height="36" rx="2" />
					<path d="M18 24L24 30L30 24" />
					<path d="M24 16V30" />
				</svg>
				<p>Drop GDS file to open in Viewer</p>
			</div>
		</div>
	{/if}
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
	.global-drop-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}
	.global-drop-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--accent);
		border: 2px dashed var(--accent);
		padding: 30px 50px;
	}
	.global-drop-prompt p {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		font-weight: 600;
	}
</style>
