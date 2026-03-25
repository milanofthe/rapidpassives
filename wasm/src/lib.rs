mod types;
mod parser;
mod hierarchy;
mod triangulate;

use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Process a GDS-II binary file and return triangulated instanced scene data.
#[wasm_bindgen]
pub fn process_gds(data: &[u8]) -> Result<JsValue, JsValue> {
    let (cells, refs, units) = parser::parse_gds(data)
        .map_err(|e| JsValue::from_str(&e))?;

    let (instances, user_unit) = hierarchy::build_instanced_scene(&cells, &refs, units.user_unit);

    let result = triangulate::process_scene(&cells, &instances, user_unit);

    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    result.serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("{e}")))
}
