mod types;
mod parser;
mod hierarchy;
mod triangulate;

use wasm_bindgen::prelude::*;

macro_rules! log {
    ($($t:tt)*) => (web_sys::console::log_1(&format!($($t)*).into()))
}

/// Process a GDS-II binary file and return triangulated instanced scene data.
#[wasm_bindgen]
pub fn process_gds(data: &[u8]) -> Result<JsValue, JsValue> {
    log!("WASM: parsing {} bytes", data.len());

    let (cells, refs, units) = parser::parse_gds(data)
        .map_err(|e| JsValue::from_str(&e))?;

    log!("WASM: parsed {} cells with polygons, {} cells with refs, userUnit={}, metersPerUnit={}",
        cells.len(), refs.len(), units.user_unit, units.meters_per_unit);

    // Log cell details
    for (name, cell) in &cells {
        let poly_count: usize = cell.polygons.values().map(|v| v.len()).sum();
        log!("WASM:   cell '{}': {} layers, {} polygons", name, cell.polygons.len(), poly_count);
    }

    let (instances, user_unit) = hierarchy::build_instanced_scene(&cells, &refs, units.user_unit);

    let total_instances: usize = instances.values().map(|v| v.len()).sum();
    log!("WASM: hierarchy walk done, {} cells with instances, {} total instances, userUnit={}",
        instances.len(), total_instances, user_unit);

    let result = triangulate::process_scene(&cells, &instances, user_unit);

    log!("WASM: triangulation done, {} cell meshes, {} polygon_count",
        result.cell_meshes.len(), result.polygon_count);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("{e}")))
}
