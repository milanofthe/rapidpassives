mod types;
mod parser;
mod hierarchy;
mod triangulate;

use wasm_bindgen::prelude::*;

/// Process a GDS-II binary file and return triangulated instanced scene data.
/// Input: raw GDS bytes
/// Output: JsValue matching GdsWorkerResult TypeScript interface
#[wasm_bindgen]
pub fn process_gds(data: &[u8]) -> Result<JsValue, JsValue> {
    let (cells, refs, units) = parser::parse_gds(data)
        .map_err(|e| JsValue::from_str(&e))?;

    let (instances, user_unit) = hierarchy::build_instanced_scene(&cells, &refs, units.user_unit);

    let result = triangulate::process_scene(&cells, &instances, user_unit);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("{e}")))
}
