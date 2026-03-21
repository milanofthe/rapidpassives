<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { SimulationResult } from '$lib/solver/peec';

	let { result }: { result: SimulationResult | null } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let Plotly: any = $state(null);

	onMount(async () => {
		Plotly = (await import('plotly.js-dist-min')).default;

		// Resize plots when container size changes
		const ro = new ResizeObserver(() => {
			if (!container || !Plotly) return;
			const plots = container.querySelectorAll('.plot-grid > div');
			for (const div of plots) {
				Plotly.Plots?.resize(div);
			}
		});
		return () => ro.disconnect();
	});

	// Observe container when it mounts
	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver(() => {
			if (!Plotly) return;
			const plots = container!.querySelectorAll('.plot-grid > div');
			for (const div of plots) {
				Plotly.Plots?.resize(div);
			}
		});
		ro.observe(container);
		return () => ro.disconnect();
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
			autosize: true,
			showlegend: false,
		};
		const cfg = { responsive: true, displayModeBar: false };
		const tr = (y: number[], color: string) => ({
			x: f, y, type: 'scatter' as const, mode: 'lines' as const, line: { color, width: 2 },
		});
		const yax = (title: string, ...datasets: number[][]) => {
			const axis: any = { title: { text: title, font: { size: 10 } }, gridcolor: '#2a2a32', tickfont: { size: 9 } };
			if (datasets.length > 0) {
				// Smart y-range: if variation is small relative to mean, zoom in
				const all = datasets.flat().filter(v => isFinite(v));
				if (all.length > 0) {
					const min = Math.min(...all);
					const max = Math.max(...all);
					const range = max - min;
					const mid = (min + max) / 2;
					const absMax = Math.max(Math.abs(min), Math.abs(max));
					// If range is < 5% of the absolute value, zoom in with 20% padding
					if (absMax > 0 && range / absMax < 0.05) {
						const pad = Math.max(range * 0.2, absMax * 0.005);
						axis.range = [min - pad, max + pad];
					}
				}
			}
			return axis;
		};

		const trNamed = (y: number[], color: string, name: string) => ({
			...tr(y, color), name, showlegend: true,
		});

		const plots = [
			{ id: 'p-l', data: [tr(L, '#e8944a')], yaxis: yax('L (nH)', L), legend: false },
			{ id: 'p-q', data: [tr(Q, '#d9513c')], yaxis: yax('Q', Q), legend: false },
			{ id: 'p-r', data: [tr(R, '#6bbf8a')], yaxis: yax('R (Ω)', R), legend: false },
			{ id: 'p-s', data: [
				trNamed(s11Mag, '#7b5e8a', '|S11|'),
				trNamed(s21Mag, '#e8944a', '|S21|'),
			], yaxis: yax('dB', s11Mag, s21Mag), legend: true },
			{ id: 'p-ph', data: [
				trNamed(s11Phase, '#7b5e8a', '∠S11'),
				trNamed(s21Phase, '#e8944a', '∠S21'),
			], yaxis: yax('Phase (°)', s11Phase, s21Phase), legend: true },
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
		overflow: auto;
		background: var(--bg-surface);
		padding: 8px;
	}
	.plot-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		grid-auto-rows: minmax(150px, 1fr);
		gap: 4px;
		min-height: 100%;
	}
	.no-result {
		padding: 24px;
		text-align: center;
		color: var(--text-dim);
		font-size: 12px;
		font-family: var(--font-mono);
	}
</style>
