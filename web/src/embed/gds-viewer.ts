/**
 * <gds-viewer> — Embeddable GDS-II 3D viewer web component.
 *
 * Usage:
 *   <script src="https://rapidpassives.org/embed/gds-viewer.js"></script>
 *   <gds-viewer src="layout.gds" rotate explode></gds-viewer>
 *
 * Attributes:
 *   src      — URL to a .gds file
 *   width    — CSS width (default: 100%)
 *   height   — CSS height (default: 400px)
 *   rotate   — enable continuous camera rotation
 *   explode  — enable layer explode/assemble animation
 *   speed    — animation speed multiplier (default: 1)
 *   config   — JSON string or URL for layer config: { layers: { [gdsLayer]: { color, z, thickness } } }
 */

import { initGL, buildInstancedMeshes, render3D, fitCamera, disposeGL, createCamera, type Camera, type InstancedSceneData, type GdsLayerInfo } from '../lib/render/canvas3d';
import { readGds, buildInstancedScene } from '../lib/gds/reader';
import type { ProcessStack } from '../lib/stack/types';

// Default stack for embed (simple 6-layer)
function createEmbedStack(layerConfig?: Record<number, { color?: string; z?: number; thickness?: number }>): { stack: ProcessStack; gdsLayerInfo: Map<number, GdsLayerInfo> } {
	const defaultColors = ['#6bbf8a', '#d9513c', '#e8944a', '#f0b86a', '#7b5e8a', '#5a8fd9', '#d95a8f', '#8fd95a', '#5ad9c7', '#d9c75a'];
	const gdsLayerInfo = new Map<number, GdsLayerInfo>();

	// Will be populated when GDS is loaded
	const stack: ProcessStack = {
		name: 'Embed',
		layers: [
			{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: 300, color: '#4a4a5a', gdsLayers: [], visible: true },
		],
		substrateThickness: 300,
		oxideEr: 4.0,
		substrateRho: 10,
		substrateEr: 11.7,
	};

	return { stack, gdsLayerInfo };
}

function assignLayerInfo(
	scene: InstancedSceneData,
	layerConfig?: Record<number, { color?: string; z?: number; thickness?: number }>,
): Map<number, GdsLayerInfo> {
	const defaultColors = ['#6bbf8a', '#d9513c', '#e8944a', '#f0b86a', '#7b5e8a', '#5a8fd9', '#d95a8f', '#8fd95a', '#5ad9c7', '#d9c75a'];
	const info = new Map<number, GdsLayerInfo>();

	// Collect all layer numbers from the scene
	const layerNums = new Set<number>();
	for (const meshes of Object.values(scene.cellMeshes)) {
		for (const key of Object.keys(meshes)) layerNums.add(parseInt(key));
	}

	const sorted = [...layerNums].sort((a, b) => a - b);
	sorted.forEach((layerNum, i) => {
		const cfg = layerConfig?.[layerNum];
		info.set(layerNum, {
			z: cfg?.z ?? 301 + i * 1.5,
			thickness: cfg?.thickness ?? 0.8,
			color: cfg?.color ?? defaultColors[i % defaultColors.length],
		});
	});

	return info;
}

class GdsViewerElement extends HTMLElement {
	private canvas: HTMLCanvasElement | null = null;
	private glState: ReturnType<typeof initGL> = null;
	private camera: Camera = createCamera();
	private animId = 0;
	private mounted = false;
	private scene: InstancedSceneData | null = null;
	private gdsLayerInfo: Map<number, GdsLayerInfo> = new Map();
	private layerNums: number[] = [];

	static get observedAttributes() {
		return ['src', 'width', 'height', 'rotate', 'explode', 'speed', 'config'];
	}

	connectedCallback() {
		this.mounted = true;

		// Shadow DOM for isolation
		const shadow = this.attachShadow({ mode: 'open' });
		const wrapper = document.createElement('div');
		wrapper.style.cssText = `position:relative;width:${this.getAttribute('width') || '100%'};height:${this.getAttribute('height') || '400px'};background:#131316;overflow:hidden;`;

		this.canvas = document.createElement('canvas');
		this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
		wrapper.appendChild(this.canvas);

		// Branding
		const badge = document.createElement('a');
		badge.href = 'https://rapidpassives.org';
		badge.target = '_blank';
		badge.rel = 'noopener';
		badge.textContent = 'RapidPassives';
		badge.style.cssText = 'position:absolute;bottom:6px;right:8px;font:500 9px/1 monospace;color:#55535a;text-decoration:none;opacity:0.7;transition:opacity 0.15s;';
		badge.onmouseenter = () => badge.style.opacity = '1';
		badge.onmouseleave = () => badge.style.opacity = '0.7';
		wrapper.appendChild(badge);

		shadow.appendChild(wrapper);

		this.glState = initGL(this.canvas);
		if (!this.glState) return;

		// Handle resize
		const ro = new ResizeObserver(() => this.renderFrame());
		ro.observe(wrapper);

		// Load GDS if src is set
		const src = this.getAttribute('src');
		if (src) this.loadGds(src);
	}

	disconnectedCallback() {
		this.mounted = false;
		this.animId++;
		if (this.glState) disposeGL(this.glState);
	}

	attributeChangedCallback(name: string, _old: string | null, val: string | null) {
		if (name === 'src' && val && this.mounted) this.loadGds(val);
	}

	private async loadGds(url: string) {
		try {
			const resp = await fetch(url);
			const buf = await resp.arrayBuffer();
			const gds = readGds(new Uint8Array(buf));
			this.scene = buildInstancedScene(gds);

			// Parse config
			let layerConfig: Record<number, { color?: string; z?: number; thickness?: number }> | undefined;
			const cfgAttr = this.getAttribute('config');
			if (cfgAttr) {
				try {
					if (cfgAttr.startsWith('{')) {
						layerConfig = JSON.parse(cfgAttr)?.layers;
					} else {
						const cfgResp = await fetch(cfgAttr);
						layerConfig = (await cfgResp.json())?.layers;
					}
				} catch { /* ignore bad config */ }
			}

			this.gdsLayerInfo = assignLayerInfo(this.scene, layerConfig);
			this.layerNums = [...this.gdsLayerInfo.keys()].sort((a, b) => a - b);

			// Build meshes
			const { stack } = createEmbedStack();
			if (this.glState) {
				buildInstancedMeshes(this.glState, this.scene, stack, undefined, undefined, this.gdsLayerInfo);
			}

			// Fit camera
			this.camera = fitCamera({}, stack, this.scene);
			this.camera = { ...this.camera, phi: Math.PI / 4, theta: Math.PI / 4 };

			this.startAnimation();
		} catch (e) {
			console.error('[gds-viewer] Failed to load GDS:', e);
		}
	}

	private syncCanvas(): { w: number; h: number } {
		if (!this.canvas) return { w: 0, h: 0 };
		const rect = this.canvas.getBoundingClientRect();
		const w = Math.round(rect.width);
		const h = Math.round(rect.height);
		if (w <= 0 || h <= 0) return { w, h };
		const dpr = window.devicePixelRatio || 1;
		const bw = Math.round(w * dpr);
		const bh = Math.round(h * dpr);
		if (this.canvas.width !== bw || this.canvas.height !== bh) {
			this.canvas.width = bw;
			this.canvas.height = bh;
		}
		return { w, h };
	}

	private renderFrame(time: number = 0) {
		if (!this.glState || !this.canvas || !this.mounted) return;
		const { w, h } = this.syncCanvas();
		if (w <= 0 || h <= 0) return;

		// Rotate animation
		const doRotate = this.hasAttribute('rotate');
		const doExplode = this.hasAttribute('explode');
		const speed = parseFloat(this.getAttribute('speed') || '1');

		if (doRotate) {
			this.camera = {
				...this.camera,
				theta: this.camera.theta + 0.003 * speed,
			};
		}

		// Explode animation — sinusoidal Z offset per layer
		let layerZOffsets: Map<number, number> | null = null;
		if (doExplode && this.layerNums.length > 1) {
			layerZOffsets = new Map();
			const t = time * 0.001 * speed;
			const amplitude = 3.0; // um offset per layer step
			const period = 4.0; // seconds for full cycle
			const phase = Math.sin(2 * Math.PI * t / period);
			for (let i = 0; i < this.layerNums.length; i++) {
				const centerIdx = (this.layerNums.length - 1) / 2;
				const offset = (i - centerIdx) * amplitude * phase;
				layerZOffsets.set(this.layerNums[i], offset);
			}
		}

		render3D(this.glState, this.camera, w, h, 0, false, null, 1.0, layerZOffsets);
	}

	private startAnimation() {
		const id = ++this.animId;
		const doRotate = this.hasAttribute('rotate');
		const doExplode = this.hasAttribute('explode');

		if (!doRotate && !doExplode) {
			this.renderFrame(0);
			return;
		}

		const tick = (time: number) => {
			if (!this.mounted || id !== this.animId) return;
			this.renderFrame(time);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}
}

if (!customElements.get('gds-viewer')) {
	customElements.define('gds-viewer', GdsViewerElement);
}
