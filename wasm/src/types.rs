use serde::Serialize;
use std::collections::HashMap;

/// Output struct matching the TypeScript GdsWorkerResult interface.
/// Serialized via serde-wasm-bindgen to pass to JavaScript.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GdsResult {
    /// cellName → { gdsLayer → [x,y,x,y,...] triangulated face vertices }
    pub cell_meshes: HashMap<String, HashMap<i32, Vec<f32>>>,
    /// cellName → { gdsLayer → [x0,y0,x1,y1,...] edge pairs for side walls }
    pub cell_edges: HashMap<String, HashMap<i32, Vec<f32>>>,
    /// cellName → [a,b,c,d,tx,ty, ...] packed affine transforms (6 per instance)
    pub cell_instances: HashMap<String, Vec<f32>>,
    /// Total triangle vertex count
    pub polygon_count: u32,
}

/// A 2D polygon with separate x and y coordinate arrays.
pub struct Polygon {
    pub x: Vec<i32>,
    pub y: Vec<i32>,
}

/// Cell data extracted from GDS: polygons grouped by layer number.
pub struct CellData {
    pub polygons: HashMap<i16, Vec<Polygon>>,
}

/// An SREF (structure reference) extracted from GDS.
pub struct SRef {
    pub sname: String,
    pub xy: (i32, i32),
    pub strans: u16,
    pub mag: f64,
    pub angle: f64,
}

/// An AREF (array reference) extracted from GDS.
pub struct ARef {
    pub sname: String,
    pub xy: [(i32, i32); 3],
    pub columns: i16,
    pub rows: i16,
    pub strans: u16,
    pub mag: f64,
    pub angle: f64,
}

/// Parsed units from GDS UNITS record.
pub struct GdsUnits {
    pub user_unit: f64,
    pub meters_per_unit: f64,
}

/// Cell references (SREFs + AREFs) grouped by cell name.
pub struct CellRefs {
    pub srefs: Vec<SRef>,
    pub arefs: Vec<ARef>,
}

/// 2D affine transform: [a, b, c, d, tx, ty]
/// Maps (x,y) → (a*x + b*y + tx, c*x + d*y + ty)
pub type Affine2D = [f64; 6];

/// Scene with instanced cell data.
pub struct InstancedScene {
    pub cells: HashMap<String, CellData>,
    pub instances: HashMap<String, Vec<Affine2D>>,
    pub user_unit: f64,
}
