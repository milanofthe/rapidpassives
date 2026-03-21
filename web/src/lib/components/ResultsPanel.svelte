<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { SimulationResult } from '$lib/solver/peec';

	let { result }: { result: SimulationResult | null } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let Plotly: any = $state(null);

	onMount(async () => {
		Plotly = (await import('plotly.js-dist-min')).default;
	});

	$effect(() => {
		const r = result;
		const P = Plotly;
		const el = container;
		if (!P || !r || r.freqs.length === 0) return;
		// Wait for DOM if container isn't ready yet
		if (!el) {
			tick().then(() => {
				if (container) renderPlots(container, r, P);
			});
			return;
		}
		renderPlots(el, r, P);
	});

	function renderPlots(el: HTMLDivElement, r: SimulationResult, P: any) {
		const f = r.freqs.map(p => p.freq);
		const L = r.freqs.map(p => p.L * 1e9);
		const Q = r.freqs.map(p => p.Q);
		const R = r.freqs.map(p => p.R);

		const s11Mag = r.freqs.map(p => {
			const [re, im] = p.S[0][0];
			return 20 * Math.log10(Math.sqrt(re * re + im * im));
		});
		const s21Mag = r.freqs.map(p => {
			const [re, im] = p.S[1][0];
			return 20 * Math.log10(Math.sqrt(re * re + im * im));
		});
		const s11Phase = r.freqs.map(p => {
			const [re, im] = p.S[0][0];
			return Math.atan2(im, re) * 180 / Math.PI;
		});
		const s21Phase = r.freqs.map(p => {
			const [re, im] = p.S[1][0];
			return Math.atan2(im, re) * 180 / Math.PI;
		});

		const xType = r.logScale ? 'log' : 'linear';
		const base = {
			font: { family: 'JetBrains Mono, monospace', size: 10, color: '#7d7a85' },
			paper_bgcolor: 'rgba(0,0,0,0)',
			plot_bgcolor: '#18181d',
			margin: { t: 8, r: 12, b: 40, l: 52 },
			xaxis: {
				type: xType as any,
				title: { text: 'Frequency (Hz)', font: { size: 9 } },
				gridcolor: '#2a2a32',
				linecolor: '#35353d',
				tickfont: { size: 9 },
			},
			height: 200,
			showlegend: false,
		};
		const cfg = { responsive: true, displayModeBar: false };
		const tr = (y: number[], color: string) => ({
			x: f, y, type: 'scatter' as const, mode: 'lines' as const, line: { color, width: 2 },
		});
		const yax = (title: string) => ({ title: { text: title, font: { size: 10 } }, gridcolor: '#2a2a32', tickfont: { size: 9 } });

		const trNamed = (y: number[], color: string, name: string) => ({
			...tr(y, color), name, showlegend: true,
		});

		const plots = [
			{ id: 'p-l', data: [tr(L, '#e8944a')], yaxis: yax('L (nH)'), legend: false },
			{ id: 'p-q', data: [tr(Q, '#d9513c')], yaxis: yax('Q'), legend: false },
			{ id: 'p-r', data: [tr(R, '#6bbf8a')], yaxis: yax('R (Ω)'), legend: false },
			{ id: 'p-s', data: [
				trNamed(s11Mag, '#7b5e8a', '|S11|'),
				trNamed(s21Mag, '#e8944a', '|S21|'),
			], yaxis: yax('dB'), legend: true },
			{ id: 'p-ph', data: [
				trNamed(s11Phase, '#7b5e8a', '∠S11'),
				trNamed(s21Phase, '#e8944a', '∠S21'),
			], yaxis: yax('Phase (°)'), legend: true },
		];

		const grid = el.querySelector('.plot-grid')!;
		for (const p of plots) {
			let div = grid.querySelector(`#${p.id}`) as HTMLDivElement;
			if (!div) {
				div = document.createElement('div');
				div.id = p.id;
				grid.appendChild(div);
			}
			P.react(div, p.data, { ...base, yaxis: p.yaxis, showlegend: p.legend ?? false, legend: { font: { size: 9 }, x: 0.02, y: 0.98 } }, cfg);
		}
	}
</script>

{#if result}
	<div class="results" bind:this={container}>
		<div class="plot-grid"></div>
	</div>
{:else}
	<div class="no-result">Run simulation to see results</div>
{/if}

<style>
	.results {
		height: 100%;
		overflow-y: auto;
		background: var(--bg-surface);
		padding: 8px;
	}
	.plot-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.no-result {
		padding: 24px;
		text-align: center;
		color: var(--text-dim);
		font-size: 12px;
		font-family: var(--font-mono);
	}
</style>
