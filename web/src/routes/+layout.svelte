<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="app">
	<header>
		<div class="brand">
			<h1>RAPIDPASSIVES</h1>
			<div class="divider"></div>
			<span class="subtitle">RFIC Inductor & Transformer Design</span>
		</div>
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
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	header h1 {
		font-size: 12px;
		font-weight: 700;
		color: var(--accent);
		letter-spacing: 2px;
		font-family: 'JetBrains Mono', monospace;
	}
	.divider {
		width: 1px;
		height: 14px;
		background: var(--border);
	}
	.subtitle {
		font-size: 11px;
		color: var(--text-dim);
		letter-spacing: 0.3px;
	}
	main {
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}
</style>
