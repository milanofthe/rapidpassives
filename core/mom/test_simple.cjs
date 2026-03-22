/**
 * Minimal test: 2-triangle strip with 1 shared edge = 1 DOF.
 * This is the simplest possible MoM problem.
 */
const fs = require('fs');
const path = require('path');

const wasmDir = path.join(__dirname, '../../web/static/wasm');
const wasmBinary = fs.readFileSync(path.join(wasmDir, 'mom.wasm'));
const code = fs.readFileSync(path.join(wasmDir, 'mom.js'), 'utf8');
globalThis.window = globalThis;
globalThis.document = { currentScript: { src: '' } };
const fn = new Function('require', '__dirname', '__filename', code + '\nreturn MoMModule;');
const MoMModule = fn(require, wasmDir, path.join(wasmDir, 'mom.js'));

async function main() {
  const M = await MoMModule({
    print: t => console.log('[mom]', t),
    printErr: t => console.error('[err]', t),
    wasmBinary,
  });

  const init = M.cwrap('mom_init', 'number', []);
  const setMesh = M.cwrap('mom_set_mesh', 'number', ['number','number','number','number']);
  const findEdge = M.cwrap('mom_find_edge', 'number', ['number','number']);
  const addPort = M.cwrap('mom_add_port', 'number', ['number','number']);
  const solve = M.cwrap('mom_solve', 'number', ['number','number']);
  const cleanup = M.cwrap('mom_cleanup', null, []);

  init();

  // 2 triangles forming a rectangle: 100um x 10um
  const um = 1e-6;
  const nodes = [
    0, 0, 0,          // v0
    100*um, 0, 0,      // v1
    100*um, 10*um, 0,  // v2
    0, 10*um, 0,       // v3
  ];
  const tris = [
    0, 1, 2,  // tri0
    0, 2, 3,  // tri1
  ];

  const np = M._malloc(nodes.length * 8);
  const tp = M._malloc(tris.length * 4);
  new Float64Array(M.HEAPF64.buffer, np, nodes.length).set(nodes);
  new Int32Array(M.HEAP32.buffer, tp, tris.length).set(tris);
  const ndof = setMesh(np, 4, tp, 2);
  M._free(np); M._free(tp);
  console.log('DOFs:', ndof); // Should be 1 (one shared edge v0-v2 diagonal)

  // The shared edge is the diagonal v0(0,0)-v2(100um,10um) or one of the other internal edges
  // With 4 nodes, 2 triangles, the shared edges are:
  // tri0=(0,1,2) and tri1=(0,2,3) share edge (0,2)
  const ei = findEdge(0, 2);
  console.log('Shared edge 0-2:', ei);
  const ei2 = findEdge(1, 2);
  console.log('Edge 1-2:', ei2, '(boundary)');

  if (ei >= 0) {
    const pp = M._malloc(4);
    new Int32Array(M.HEAP32.buffer, pp, 1).set([ei]);
    addPort(pp, 1);
    M._free(pp);
  }

  console.log('\n--- Solving at various frequencies ---');
  for (const freq of [1e8, 1e9, 1e10]) {
    solve(freq, 50.0);
  }

  // Also test with L = lambda/2 strip at resonance
  console.log('\n--- Test at f=1.5GHz (lambda=20cm, strip=0.05% lambda) ---');
  solve(1.5e9, 50.0);

  cleanup();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
