<script lang="ts">
	import '$lib/components/fields.css';
	import { PDK_NAMES, PDK_DESCRIPTIONS } from '$lib/stack/pdk-mapping';

	let { value = $bindable<string>() }: { value: string } = $props();
	let open = $state(false);
</script>

<div class="pdk-dropdown">
	<button class="pdk-btn" onclick={() => open = !open}>
		{PDK_NAMES[value] ?? value}
		<svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M0 0L4 5L8 0Z"/></svg>
	</button>
	{#if open}
		<div class="pdk-menu">
			{#each Object.entries(PDK_NAMES) as [id, name]}
				<button class="pdk-option" class:active={value === id} onclick={() => { value = id; open = false; }}>
					<span>{name}</span>
					<span class="pdk-desc">{PDK_DESCRIPTIONS[id]}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.pdk-dropdown {
		position: relative;
	}
	.pdk-btn {
		width: 100%;
		padding: 5px 8px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: var(--text-muted);
		cursor: pointer;
		text-align: left;
		display: flex;
		justify-content: space-between;
		align-items: center;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 500;
		transition: border-color var(--transition);
	}
	.pdk-btn:hover {
		border-color: var(--accent);
	}
	.pdk-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 20;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
	}
	.pdk-option {
		padding: 6px 8px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-muted);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		display: flex;
		flex-direction: column;
		gap: 1px;
		transition: background var(--transition);
	}
	.pdk-option:hover {
		background: var(--accent-dim);
	}
	.pdk-option.active {
		color: var(--accent);
		font-weight: 600;
	}
	.pdk-desc {
		font-size: 9px;
		color: var(--text-dim);
	}
</style>
