<script lang="ts">
	import { onMount } from 'svelte';

	// Load the embed script for <gds-viewer> custom elements
	onMount(() => {
		if (customElements.get('gds-viewer')) return;
		const script = document.createElement('script');
		script.src = '/embed/gds-viewer.js';
		document.head.appendChild(script);
	});

	const cards = [
		{ title: 'Spiral Inductor', href: '/generator/spiral', desc: 'Single-ended spiral with underpass routing', gds: '/cards/spiral_inductor.gds' },
		{ title: 'Symmetric Inductor', href: '/generator/symmetric-inductor', desc: 'Differential symmetric inductor with optional center tap', gds: '/cards/symmetric_inductor.gds' },
		{ title: 'Interleaved Transformer', href: '/generator/symmetric-transformer', desc: 'Laterally interleaved transformer with configurable winding ratio', gds: '/cards/symmetric_transformer.gds' },
		{ title: 'Stacked Transformer', href: '/generator/stacked-transformer', desc: 'Vertically stacked differential transformer on separate metal layers', gds: '/cards/stacked_transformer.gds' },
		{ title: 'MOM Capacitor', href: '/generator/mom-capacitor', desc: 'Interdigitated metal-oxide-metal finger capacitor', gds: '/cards/mom_capacitor.gds' },
		{ title: 'Patch Antenna', href: '/generator/patch-antenna', desc: 'Microstrip patch antenna with inset or edge feed', gds: '/cards/patch_antenna.gds' },
		{ title: 'Rat-Race Coupler', href: '/generator/ratrace-coupler', desc: 'Ring hybrid coupler with 4 ports', gds: '/cards/ratrace_coupler.gds' },
	];
</script>

<svelte:head>
	<title>RapidPassives — RFIC Passive Layout Generator</title>
	<meta name="description" content="Browser-based RFIC passive layout generator. Configure geometry, preview in real time, and export production-ready GDS-II." />
</svelte:head>

<div class="page">
	<div class="landing">
		<div class="hero">
			<h1>RapidPassives</h1>
			<p>Browser-based RFIC passive layout generator. Configure geometry, preview in real time, and export production-ready GDS-II.</p>
		</div>
		<div class="cards">
			{#each cards as card}
				<a class="card" href={card.href}>
					<div class="card-preview">
						{@html `<gds-viewer src="${card.gds}" rotate speed="0.5" width="100%" height="200px"></gds-viewer>`}
					</div>
					<div class="card-info">
						<h3>{card.title}</h3>
						<p>{card.desc}</p>
					</div>
				</a>
			{/each}
			<a class="card" href="/viewer">
				<div class="card-preview viewer-preview">
					<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="8" y="6" width="32" height="36" rx="2" />
						<path d="M18 24L24 30L30 24" />
						<path d="M24 16V30" />
					</svg>
				</div>
				<div class="card-info">
					<h3>GDS Viewer</h3>
					<p>Import and visualize GDS-II files in 2D and 3D</p>
				</div>
			</a>
		</div>
		<a class="embed-hint" href="/embed/test">
			<span class="embed-tag">&lt;gds-viewer&gt;</span>
			<span>Embed 3D layouts on your website</span>
		</a>
	</div>
	<footer class="landing-footer">
		<a href="https://github.com/milanofthe/rapidpassives" target="_blank" rel="noopener">GitHub</a>
		<span class="sep">/</span>
		<a href="https://milanrother.com" target="_blank" rel="noopener">Milan Rother</a>
	</footer>
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	.landing {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 32px;
		padding: 40px;
		overflow-y: auto;
	}
	.hero {
		text-align: center;
		margin-bottom: 16px;
	}
	.hero h1 {
		font-size: 28px;
		font-weight: 700;
		color: var(--accent);
		font-family: var(--font-mono);
		letter-spacing: 2px;
		margin-bottom: 10px;
	}
	.hero p {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		max-width: 480px;
		font-family: var(--font-mono);
		line-height: 1.5;
	}
	.cards {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
		justify-content: center;
		max-width: 900px;
	}
	.card {
		width: 200px;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		text-decoration: none;
		color: inherit;
		transition: border-color var(--transition), transform var(--transition);
		display: flex;
		flex-direction: column;
	}
	.card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
	}
	.card-preview {
		width: 100%;
		overflow: hidden;
	}
	.card-info {
		padding: 12px 14px;
		border-top: 1px solid var(--border-subtle);
	}
	.card-info h3 {
		font-size: var(--fs-sm);
		font-weight: 600;
		color: var(--accent);
		font-family: var(--font-mono);
		margin-bottom: 4px;
	}
	.card-info p {
		font-size: var(--fs-xs);
		color: var(--text-dim);
		line-height: 1.4;
		font-family: var(--font-mono);
	}
	.viewer-preview {
		height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dim);
		transition: color var(--transition);
	}
	.card:hover .viewer-preview {
		color: var(--accent);
	}
	.embed-hint {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		color: var(--text-dim);
		transition: color var(--transition);
	}
	.embed-hint:hover {
		color: var(--accent);
	}
	.embed-tag {
		font-weight: 600;
		color: var(--text-muted);
		border: 1px solid var(--border);
		padding: 3px 8px;
		transition: border-color var(--transition), color var(--transition);
	}
	.embed-hint:hover .embed-tag {
		border-color: var(--accent);
		color: var(--accent);
	}
	.landing-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 16px;
		height: 36px;
		background: var(--bg-surface);
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}
	.sep {
		color: var(--border);
		font-size: var(--fs-xs);
	}
	.landing-footer a {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
		text-decoration: none;
		letter-spacing: 0.3px;
		transition: color var(--transition);
	}
	.landing-footer a:hover {
		color: var(--accent);
	}
</style>
