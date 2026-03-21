<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="app">
	<header>
		<h1>RapidPassives</h1>
		<span class="subtitle">RFIC Inductor & Transformer Design</span>
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
		align-items: baseline;
		gap: 16px;
		padding: 8px 16px;
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	header h1 {
		font-size: 16px;
		font-weight: 700;
		color: var(--accent-secondary);
	}
	.subtitle {
		font-size: 12px;
		color: var(--text-muted);
	}
	main {
		flex: 1;
		overflow: hidden;
	}
</style>
