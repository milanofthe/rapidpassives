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
			layers: buildSpiralInductor({ Dout: 80, N: 2, sides: 8, width: 8, spacing: 4, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45 }),
		},
		{
			title: 'Symmetric Inductor',
			href: '/symmetric-inductor',
			desc: 'Differential symmetric inductor with optional center tap',
			layers: buildSymmetricInductor({ Dout: 120, N: 2, sides: 8, width: 10, spacing: 3, center_tap: false, via_extent: 6, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45 }),
		},
		{
			title: 'Symmetric Transformer',
			href: '/symmetric-transformer',
			desc: 'Interleaved transformer with configurable winding ratio',
			layers: buildSymmetricTransformer({ Dout: 120, N1: 1, N2: 2, sides: 8, width: 8, spacing: 3, center_tap_primary: false, center_tap_secondary: false, via_extent: 5, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45 }),
		},
	];

	let canvases: HTMLCanvasElement[] = [];

	function renderCard(canvas: HTMLCanvasElement, layers: LayerMap) {
		if (!canvas) return;
		const rect = canvas.parentElement!.getBoundingClientRect();
		const size = Math.round(Math.min(rect.width, rect.height));
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		const view = fitToView(size, size, layers);
		renderLayers(ctx, layers, view);
	}

	onMount(() => {
		cards.forEach((card, i) => {
			if (canvases[i]) renderCard(canvases[i], card.layers);
		});
	});
</script>

<div class="landing">
	<div class="hero">
		<h2>RFIC Passive Design</h2>
		<p>Generate DRC-clean inductor and transformer layouts with real-time preview and GDS export.</p>
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
</div>

<style>
	.landing {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 40px;
		padding: 40px;
	}
	.hero {
		text-align: center;
	}
	.hero h2 {
		font-size: 20px;
		font-weight: 700;
		color: var(--accent);
		font-family: var(--font-mono);
		letter-spacing: 1px;
		margin-bottom: 8px;
	}
	.hero p {
		font-size: 13px;
		color: var(--text-muted);
		max-width: 500px;
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
		font-size: 13px;
		font-weight: 600;
		color: var(--accent);
		font-family: var(--font-mono);
		margin-bottom: 4px;
	}
	.card-info p {
		font-size: 11px;
		color: var(--text-dim);
		line-height: 1.4;
	}
</style>
