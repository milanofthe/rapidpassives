<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { SimulationResult } from '$lib/solver/peec';
	import { plotColors, fonts } from '$lib/theme';

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
			font: { family: fonts.mono, size: 10, color: plotColors.text },
			paper_bgcolor: 'rgba(0,0,0,0)',
			plot_bgcolor: plotColors.bg,
			margin: { t: 8, r: 12, b: 44, l: 60 },
			xaxis: {
				type: xType as any,
				title: { text: 'Frequency (Hz)', font: { size: 10 }, standoff: 8 },
				gridcolor: plotColors.grid,
				linecolor: plotColors.axis,
				tickfont: { size: 10 },
			},
			autosize: true,
			showlegend: false,
		};
		const cfg = { responsive: true, displayModeBar: false };
		const tr = (y: number[], ci: number, name?: string) => ({
			x: f, y, type: 'scatter' as const, mode: 'lines' as const,
			line: { color: plotColors.cycle[ci % plotColors.cycle.length], width: 2 },
			...(name ? { name, showlegend: true } : {}),
		});
		const yax = (title: string, ...datasets: number[][]) => {
			const axis: any = { title: { text: title, font: { size: 10 }, standoff: 12 }, gridcolor: plotColors.grid, tickfont: { size: 10 } };
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

		const plots = [
			{ id: 'p-l', data: [tr(L, 0)], yaxis: yax('L (nH)', L), legend: false },
			{ id: 'p-q', data: [tr(Q, 0)], yaxis: yax('Q', Q), legend: false },
			{ id: 'p-r', data: [tr(R, 0)], yaxis: yax('R (Ω)', R), legend: false },
			{ id: 'p-s', data: [
				tr(s11Mag, 0, '|S11|'),
				tr(s21Mag, 1, '|S21|'),
			], yaxis: yax('dB', s11Mag, s21Mag), legend: true },
			{ id: 'p-ph', data: [
				tr(s11Phase, 0, '∠S11'),
				tr(s21Phase, 1, '∠S21'),
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

		// Force resize after initial render to fit grid cells
		requestAnimationFrame(() => {
			const divs = grid.querySelectorAll(':scope > div');
			for (const div of divs) P.Plots?.resize(div);
		});
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
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
	}
</style>
