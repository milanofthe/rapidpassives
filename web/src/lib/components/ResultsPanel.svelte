<script lang="ts">
	import { onMount } from 'svelte';
	import type { SimulationResult } from '$lib/solver/peec';

	let { result }: { result: SimulationResult | null } = $props();

	function getSrf(r: SimulationResult): string {
		const srf = r.freqs.find((p, i) => i > 0 && p.L < 0);
		return srf ? (srf.freq / 1e9).toFixed(1) : '> ' + (r.freqs[r.freqs.length - 1].freq / 1e9).toFixed(0);
	}

	let plotDiv: HTMLDivElement;
	let Plotly: any = null;
	let mounted = false;

	onMount(async () => {
		Plotly = (await import('plotly.js-dist-min')).default;
		mounted = true;
	});

	$effect(() => {
		if (!mounted || !Plotly || !plotDiv || !result) return;
		renderPlots();
	});

	function renderPlots() {
		if (!result || !Plotly) return;

		const freqs = result.freqs;
		const f = freqs.map(p => p.freq);
		const L = freqs.map(p => p.L * 1e9);  // nH
		const Q = freqs.map(p => p.Q);
		const R = freqs.map(p => p.R);
		const S11_dB = freqs.map(p => {
			const re = p.S[0][0][0], im = p.S[0][0][1];
			return 10 * Math.log10(re * re + im * im);
		});

		const layout = {
			font: { family: 'JetBrains Mono, monospace', size: 10, color: '#7d7a85' },
			paper_bgcolor: '#232329',
			plot_bgcolor: '#18181d',
			margin: { t: 28, r: 16, b: 36, l: 50 },
			xaxis: {
				type: 'log' as const,
				title: 'Frequency (Hz)',
				gridcolor: '#2a2a32',
				linecolor: '#35353d',
				tickfont: { size: 9 },
			},
			height: 200,
		};

		const traceStyle = {
			line: { width: 2 },
			type: 'scatter' as const,
			mode: 'lines' as const,
		};

		// L plot
		Plotly.react(plotDiv, [
			{ x: f, y: L, name: 'L (nH)', line: { color: '#e8944a', width: 2 }, ...traceStyle },
		], {
			...layout,
			yaxis: { title: 'L (nH)', gridcolor: '#2a2a32', linecolor: '#35353d', tickfont: { size: 9 } },
		}, { responsive: true, displayModeBar: false });

		// Create additional plot containers if they don't exist
		ensurePlotContainer('plot-q');
		ensurePlotContainer('plot-r');
		ensurePlotContainer('plot-s11');

		const qDiv = plotDiv.parentElement!.querySelector('#plot-q') as HTMLDivElement;
		const rDiv = plotDiv.parentElement!.querySelector('#plot-r') as HTMLDivElement;
		const s11Div = plotDiv.parentElement!.querySelector('#plot-s11') as HTMLDivElement;

		// Q plot
		Plotly.react(qDiv, [
			{ x: f, y: Q, name: 'Q', line: { color: '#d9513c', width: 2 }, ...traceStyle },
		], {
			...layout,
			yaxis: { title: 'Q factor', gridcolor: '#2a2a32', linecolor: '#35353d', tickfont: { size: 9 } },
		}, { responsive: true, displayModeBar: false });

		// R plot
		Plotly.react(rDiv, [
			{ x: f, y: R, name: 'R (Ω)', line: { color: '#6bbf8a', width: 2 }, ...traceStyle },
		], {
			...layout,
			yaxis: { title: 'R (Ω)', gridcolor: '#2a2a32', linecolor: '#35353d', tickfont: { size: 9 } },
		}, { responsive: true, displayModeBar: false });

		// S11 plot
		Plotly.react(s11Div, [
			{ x: f, y: S11_dB, name: '|S11| (dB)', line: { color: '#7b5e8a', width: 2 }, ...traceStyle },
		], {
			...layout,
			yaxis: { title: '|S11| (dB)', gridcolor: '#2a2a32', linecolor: '#35353d', tickfont: { size: 9 } },
		}, { responsive: true, displayModeBar: false });
	}

	function ensurePlotContainer(id: string) {
		if (!plotDiv.parentElement!.querySelector(`#${id}`)) {
			const div = document.createElement('div');
			div.id = id;
			plotDiv.parentElement!.appendChild(div);
		}
	}
</script>

<div class="results">
	{#if result}
		<div class="summary">
			<div class="stat">
				<span class="stat-label">L</span>
				<span class="stat-value">{(result.freqs[Math.floor(result.freqs.length / 2)]?.L * 1e9).toFixed(2)}</span>
				<span class="stat-unit">nH</span>
			</div>
			<div class="stat">
				<span class="stat-label">Q<sub>max</sub></span>
				<span class="stat-value">{Math.max(...result.freqs.map(p => p.Q)).toFixed(1)}</span>
			</div>
			<div class="stat">
				<span class="stat-label">SRF</span>
				<span class="stat-value">{getSrf(result)}</span>
				<span class="stat-unit">GHz</span>
			</div>
			<div class="stat">
				<span class="stat-label">Fils</span>
				<span class="stat-value">{result.filaments.length}</span>
			</div>
		</div>
		<div class="plots">
			<div bind:this={plotDiv}></div>
		</div>
	{:else}
		<div class="no-result">Run simulation to see results</div>
	{/if}
</div>

<style>
	.results {
		height: 100%;
		overflow-y: auto;
		background: var(--bg-surface);
	}
	.summary {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
	}
	.stat {
		flex: 1;
		padding: 8px 10px;
		display: flex;
		align-items: baseline;
		gap: 4px;
		border-right: 1px solid var(--border-subtle);
	}
	.stat:last-child { border-right: none; }
	.stat-label {
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.stat-value {
		font-size: 14px;
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-secondary);
	}
	.stat-unit {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.plots {
		padding: 8px;
	}
	.no-result {
		padding: 24px;
		text-align: center;
		color: var(--text-dim);
		font-size: 12px;
		font-family: var(--font-mono);
	}
</style>
