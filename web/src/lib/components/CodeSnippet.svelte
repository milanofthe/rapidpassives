<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, lineNumbers, drawSelection } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { html } from '@codemirror/lang-html';
	import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
	import { tags } from '@lezer/highlight';

	let { code }: { code: string } = $props();

	let editorEl: HTMLDivElement;
	let copied = $state(false);

	// Theme matching rapidpassives dark style
	const rpTheme = EditorView.theme({
		'&': {
			backgroundColor: '#18181d',
			color: '#e2ddd5',
			fontSize: '11px',
			fontFamily: "'JetBrains Mono', monospace",
			borderRadius: '0',
		},
		'.cm-content': {
			padding: '10px 0',
			caretColor: '#d9513c',
		},
		'.cm-line': {
			padding: '0 12px',
		},
		'.cm-gutters': {
			backgroundColor: '#18181d',
			color: '#55535a',
			border: 'none',
			paddingRight: '4px',
		},
		'.cm-activeLineGutter': {
			backgroundColor: 'transparent',
		},
		'.cm-activeLine': {
			backgroundColor: 'transparent',
		},
		'&.cm-focused .cm-cursor': {
			borderLeftColor: '#d9513c',
		},
		'&.cm-focused .cm-selectionBackground, ::selection': {
			backgroundColor: '#d9513c33',
		},
		'.cm-selectionBackground': {
			backgroundColor: '#d9513c22',
		},
		'&.cm-focused': {
			outline: 'none',
		},
		'.cm-scroller': {
			overflow: 'auto',
		},
	});

	const rpHighlight = HighlightStyle.define([
		{ tag: tags.keyword, color: '#d9513c' },
		{ tag: tags.string, color: '#6bbf8a' },
		{ tag: tags.tagName, color: '#d9513c' },
		{ tag: tags.attributeName, color: '#e8944a' },
		{ tag: tags.attributeValue, color: '#6bbf8a' },
		{ tag: tags.comment, color: '#55535a' },
		{ tag: tags.punctuation, color: '#7d7a85' },
		{ tag: tags.angleBracket, color: '#7d7a85' },
		{ tag: tags.content, color: '#e2ddd5' },
	]);

	function copyCode() {
		navigator.clipboard.writeText(code).then(() => {
			copied = true;
			setTimeout(() => copied = false, 1500);
		});
	}

	onMount(() => {
		const state = EditorState.create({
			doc: code,
			extensions: [
				rpTheme,
				syntaxHighlighting(rpHighlight),
				html(),
				lineNumbers(),
				drawSelection(),
				EditorState.readOnly.of(true),
				EditorView.editable.of(false),
			],
		});

		const view = new EditorView({ state, parent: editorEl });
		return () => view.destroy();
	});
</script>

<div class="snippet">
	<div class="snippet-header">
		<span>HTML</span>
		<button onclick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
	</div>
	<div class="snippet-editor" bind:this={editorEl}></div>
</div>

<style>
	.snippet {
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.snippet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 10px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border);
	}
	.snippet-header span {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 1px;
		font-weight: 600;
	}
	.snippet-header button {
		font-size: 9px;
		font-family: var(--font-mono);
		padding: 2px 8px;
		text-transform: none;
		letter-spacing: 0;
	}
	.snippet-editor {
		max-height: 200px;
		overflow: auto;
	}
</style>
