mod types;
mod parser;
mod hierarchy;
mod triangulate;

use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Process a GDS-II binary file and return triangulated instanced scene data.
/// Returns a JS object matching the GdsWorkerResult TypeScript interface,
/// with Float32Array values for zero-copy transfer.
#[wasm_bindgen]
pub fn process_gds(data: &[u8]) -> Result<JsValue, JsValue> {
    let (cells, refs, units) = parser::parse_gds(data)
        .map_err(|e| JsValue::from_str(&e))?;

    let (instances, user_unit) = hierarchy::build_instanced_scene(&cells, &refs, units.user_unit);

    let result = triangulate::process_scene(&cells, &instances, user_unit);

    // Build JS object manually with Float32Array values (bypasses serde overhead)
    let obj = js_sys::Object::new();

    // cellMeshes: { cellName: { layerNum: Float32Array } }
    let meshes_obj = js_sys::Object::new();
    for (cell_name, layers) in &result.cell_meshes {
        let layers_obj = js_sys::Object::new();
        for (layer_key, verts) in layers {
            let arr = js_sys::Float32Array::from(verts.as_slice());
            js_sys::Reflect::set(&layers_obj, &JsValue::from_str(layer_key), &arr)?;
        }
        js_sys::Reflect::set(&meshes_obj, &JsValue::from_str(cell_name), &layers_obj)?;
    }
    js_sys::Reflect::set(&obj, &JsValue::from_str("cellMeshes"), &meshes_obj)?;

    // cellEdges: { cellName: { layerNum: Float32Array } }
    let edges_obj = js_sys::Object::new();
    for (cell_name, layers) in &result.cell_edges {
        let layers_obj = js_sys::Object::new();
        for (layer_key, verts) in layers {
            let arr = js_sys::Float32Array::from(verts.as_slice());
            js_sys::Reflect::set(&layers_obj, &JsValue::from_str(layer_key), &arr)?;
        }
        js_sys::Reflect::set(&edges_obj, &JsValue::from_str(cell_name), &layers_obj)?;
    }
    js_sys::Reflect::set(&obj, &JsValue::from_str("cellEdges"), &edges_obj)?;

    // cellInstances: { cellName: Float32Array }
    let instances_obj = js_sys::Object::new();
    for (cell_name, transforms) in &result.cell_instances {
        let arr = js_sys::Float32Array::from(transforms.as_slice());
        js_sys::Reflect::set(&instances_obj, &JsValue::from_str(cell_name), &arr)?;
    }
    js_sys::Reflect::set(&obj, &JsValue::from_str("cellInstances"), &instances_obj)?;

    // polygonCount
    js_sys::Reflect::set(&obj, &JsValue::from_str("polygonCount"), &JsValue::from(result.polygon_count))?;

    Ok(obj.into())
}
