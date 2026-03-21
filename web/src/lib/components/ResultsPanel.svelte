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

	function sMag(s: [number, number]): number {
		return 20 * Math.log10(Math.max(1e-15, Math.sqrt(s[0] * s[0] + s[1] * s[1])));
	}
	function sPhase(s: [number, number]): number {
		return Math.atan2(s[1], s[0]) * 180 / Math.PI;
	}

	function renderPlots(el: HTMLDivElement, r: SimulationResult, P: any) {
		const f = r.freqs.map(p => p.freq);
		const L = r.freqs.map(p => p.L * 1e9);
		const Q = r.freqs.map(p => p.Q);
		const R = r.freqs.map(p => p.R);

		// S-parameter traces — adapt to matrix size
		const nS = r.freqs[0]?.S?.length ?? 0;
		const sTracesMag: { data: number[]; name: string; ci: number }[] = [];
		const sTracesPhase: { data: number[]; name: string; ci: number }[] = [];
		let ci = 0;
		for (let i = 0; i < nS; i++) {
			for (let j = 0; j < nS; j++) {
				const name = `S${i + 1}${j + 1}`;
				sTracesMag.push({ data: r.freqs.map(p => sMag(p.S[i][j])), name: `|${name}|`, ci });
				sTracesPhase.push({ data: r.freqs.map(p => sPhase(p.S[i][j])), name: `∠${name}`, ci });
				ci++;
			}
		}

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

		// Winding-level L/Q/R traces (primary/secondary for transformers)
		const nWindings = r.freqs[0]?.windings?.length ?? 0;

		const lTraces: any[] = [], qTraces: any[] = [], rTraces: any[] = [];
		const lData: number[][] = [], qData: number[][] = [], rData: number[][] = [];

		if (nWindings > 1) {
			for (let wi = 0; wi < nWindings; wi++) {
				const name = r.freqs[0].windings[wi]?.name ?? `W${wi + 1}`;
				const wL = r.freqs.map(p => (p.windings[wi]?.L ?? 0) * 1e9);
				const wQ = r.freqs.map(p => p.windings[wi]?.Q ?? 0);
				const wR = r.freqs.map(p => p.windings[wi]?.R ?? 0);
				lTraces.push(tr(wL, wi, `L ${name}`));
				qTraces.push(tr(wQ, wi, `Q ${name}`));
				rTraces.push(tr(wR, wi, `R ${name}`));
				lData.push(wL); qData.push(wQ); rData.push(wR);
			}
		} else {
			lTraces.push(tr(L, 0));
			qTraces.push(tr(Q, 0));
			rTraces.push(tr(R, 0));
			lData.push(L); qData.push(Q); rData.push(R);
		}

		const plots: { id: string; data: any[]; yaxis: any }[] = [
			{ id: 'p-l', data: lTraces, yaxis: yax('L (nH)', ...lData) },
			{ id: 'p-q', data: qTraces, yaxis: yax('Q', ...qData) },
			{ id: 'p-r', data: rTraces, yaxis: yax('R (Ω)', ...rData) },
		];

		// S-param magnitude plot
		if (sTracesMag.length > 0) {
			const hasMultiple = sTracesMag.length > 1;
			plots.push({
				id: 'p-s',
				data: sTracesMag.map(t => tr(t.data, t.ci % plotColors.cycle.length, hasMultiple ? t.name : undefined)),
				yaxis: yax('|S| (dB)', ...sTracesMag.map(t => t.data)),
				});
		}

		// S-param phase plot
		if (sTracesPhase.length > 0) {
			const hasMultiple = sTracesPhase.length > 1;
			plots.push({
				id: 'p-ph',
				data: sTracesPhase.map(t => tr(t.data, t.ci % plotColors.cycle.length, hasMultiple ? t.name : undefined)),
				yaxis: yax('Phase (°)', ...sTracesPhase.map(t => t.data)),
				});
		}

		// Coupling coefficient for transformer (4+ ports only)
		if (r.freqs[0]?.k !== undefined && r.nPorts >= 4) {
			const kData = r.freqs.map(p => p.k ?? 0);
			plots.push({ id: 'p-k', data: [tr(kData, 3)], yaxis: yax('k', kData) });
		}

		const grid = el.querySelector('.plot-grid')!;
		for (const p of plots) {
			let div = grid.querySelector(`#${p.id}`) as HTMLDivElement;
			if (!div) {
				div = document.createElement('div');
				div.id = p.id;
				grid.appendChild(div);
			}
			P.react(div, p.data, { ...base, yaxis: p.yaxis, showlegend: false, hovermode: 'closest' }, cfg);
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
