<script lang="ts">
	import type { SpiralInductorParams, SymmetricInductorParams, SymmetricTransformerParams, LayerMap } from '$lib/geometry/types';
	import { buildSpiralInductor } from '$lib/geometry/spiral';
	import { buildSymmetricInductor } from '$lib/geometry/symmetric_inductor';
	import { buildSymmetricTransformer } from '$lib/geometry/symmetric_transformer';
	import { fitToView, renderLayers } from '$lib/render/canvas2d';
	import { onMount } from 'svelte';

	const cards = [
		{
			title: 'Spiral Inductor',
			href: '/spiral',
			desc: 'Single-ended spiral with underpass routing',
			layers: buildSpiralInductor({ Dout: 80, N: 2, sides: 8, width: 8, spacing: 4, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45 }).layers,
		},
		{
			title: 'Symmetric Inductor',
			href: '/symmetric-inductor',
			desc: 'Differential symmetric inductor with optional center tap',
			layers: buildSymmetricInductor({ Dout: 120, N: 2, sides: 8, width: 10, spacing: 3, center_tap: false, via_extent: 6, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45 }).layers,
		},
		{
			title: 'Symmetric Transformer',
			href: '/symmetric-transformer',
			desc: 'Interleaved transformer with configurable winding ratio',
			layers: buildSymmetricTransformer({ Dout: 120, N1: 1, N2: 2, sides: 8, width: 8, spacing: 3, center_tap_primary: false, center_tap_secondary: false, via_extent: 5, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45 }).layers,
		},
	];

	let canvases = $state<HTMLCanvasElement[]>([]);

	function renderCard(canvas: HTMLCanvasElement, layers: LayerMap) {
		if (!canvas) return;
		const rect = canvas.parentElement!.getBoundingClientRect();
		const size = Math.round(Math.min(rect.width, rect.height));
		if (size <= 0) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(size * dpr);
		canvas.height = Math.round(size * dpr);
		canvas.style.width = size + 'px';
		canvas.style.height = size + 'px';
		const ctx = canvas.getContext('2d')!;
		ctx.scale(dpr, dpr);
		const view = fitToView(size, size, layers);
		renderLayers(ctx, layers, view, null, undefined, size, size);
	}

	onMount(() => {
		cards.forEach((card, i) => {
			if (canvases[i]) renderCard(canvases[i], card.layers);
		});
	});
</script>

<div class="page">
	<div class="landing">
		<div class="hero">
			<h1>RapidPassives</h1>
			<p>Browser-based RFIC passive design. Configure, preview, and export production-ready layouts.</p>
		</div>
		<div class="cards">
			{#each cards as card, i}
				<a class="card" href={card.href}>
					<div class="card-preview">
						<canvas bind:this={canvases[i]}></canvas>
					</div>
					<div class="card-info">
						<h3>{card.title}</h3>
						<p>{card.desc}</p>
					</div>
				</a>
			{/each}
		</div>
		<div class="features">
			<span class="pill">Real-time Preview</span>
			<span class="pill">GDS Export</span>
			<span class="pill">MOM Solver</span>
			<span class="pill">Process Stack</span>
			<span class="pill">No Install</span>
		</div>
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
		justify-content: center;
		gap: 32px;
		padding: 40px;
		min-height: 0;
	}
	.hero {
		text-align: center;
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
	}
	.card {
		width: 260px;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, transform 0.15s;
		display: flex;
		flex-direction: column;
	}
	.card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
	}
	.card-preview {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.card-preview canvas {
		display: block;
		width: 100%;
		height: 100%;
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
	.features {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.pill {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-muted);
		border: 1px solid var(--border);
		padding: 4px 12px;
		letter-spacing: 0.3px;
		transition: border-color 0.15s, color 0.15s;
	}
	.pill:hover {
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
		transition: color 0.15s;
	}
	.landing-footer a:hover {
		color: var(--accent);
	}
</style>
