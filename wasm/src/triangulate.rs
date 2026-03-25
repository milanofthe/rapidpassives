use crate::types::*;
use std::collections::HashMap;

/// Process the instanced scene: triangulate each cell's polygons,
/// extract edges, and pack instance transforms.
pub fn process_scene(
    cells: &HashMap<String, CellData>,
    instances: &HashMap<String, Vec<Affine2D>>,
    user_unit: f64,
) -> GdsResult {
    let mut result = GdsResult::default();
    let scale = user_unit;

    for (cell_name, cell_data) in cells {
        let cell_instances = match instances.get(cell_name) {
            Some(inst) if !inst.is_empty() => inst,
            _ => continue,
        };

        let mut meshes: HashMap<String, Vec<f32>> = HashMap::new();
        let mut edges: HashMap<String, Vec<f32>> = HashMap::new();

        for (&layer_num, polys) in &cell_data.polygons {
            let layer_key = layer_num.to_string();

            // Triangulate polygons
            let tri_verts = triangulate_polygons(polys, scale);
            if !tri_verts.is_empty() {
                result.polygon_count += (tri_verts.len() / 2) as u32;
                meshes.insert(layer_key.clone(), tri_verts);
            }

            // Extract edges for side walls
            let edge_verts = extract_edges(polys, scale);
            if !edge_verts.is_empty() {
                edges.insert(layer_key, edge_verts);
            }
        }

        if !meshes.is_empty() {
            result.cell_meshes.insert(cell_name.clone(), meshes);
            result.cell_edges.insert(cell_name.clone(), edges);

            // Pack instance transforms
            let mut packed = Vec::with_capacity(cell_instances.len() * 6);
            for t in cell_instances {
                packed.push(t[0] as f32);
                packed.push(t[1] as f32);
                packed.push(t[2] as f32);
                packed.push(t[3] as f32);
                packed.push((t[4] * scale) as f32);
                packed.push((t[5] * scale) as f32);
            }
            result.cell_instances.insert(cell_name.clone(), packed);
        }
    }

    result
}

/// Check if polygon is an axis-aligned rectangle.
fn is_rect(x: &[i32], y: &[i32]) -> bool {
    if x.len() != 4 {
        return false;
    }
    for i in 0..4 {
        let j = (i + 1) % 4;
        let dx = (x[j] - x[i]).abs();
        let dy = (y[j] - y[i]).abs();
        if dx > 0 && dy > 0 {
            return false;
        }
    }
    true
}

/// Triangulate polygons with rectangle fast-path.
fn triangulate_polygons(polys: &[Polygon], scale: f64) -> Vec<f32> {
    let mut verts: Vec<f32> = Vec::new();

    for poly in polys {
        if poly.x.len() < 3 {
            continue;
        }

        if is_rect(&poly.x, &poly.y) {
            // Rectangle fast-path: 2 triangles = 6 vertices
            let x = &poly.x;
            let y = &poly.y;
            // Triangle 0-1-2
            verts.push(x[0] as f32 * scale as f32);
            verts.push(y[0] as f32 * scale as f32);
            verts.push(x[1] as f32 * scale as f32);
            verts.push(y[1] as f32 * scale as f32);
            verts.push(x[2] as f32 * scale as f32);
            verts.push(y[2] as f32 * scale as f32);
            // Triangle 0-2-3
            verts.push(x[0] as f32 * scale as f32);
            verts.push(y[0] as f32 * scale as f32);
            verts.push(x[2] as f32 * scale as f32);
            verts.push(y[2] as f32 * scale as f32);
            verts.push(x[3] as f32 * scale as f32);
            verts.push(y[3] as f32 * scale as f32);
        } else {
            // General earcut triangulation
            // Remove duplicate consecutive vertices
            let mut cx: Vec<f64> = Vec::new();
            let mut cy: Vec<f64> = Vec::new();
            let mut idx_map: Vec<usize> = Vec::new();

            for i in 0..poly.x.len() {
                let px = poly.x[i] as f64;
                let py = poly.y[i] as f64;
                if !cx.is_empty()
                    && (px - cx[cx.len() - 1]).abs() < 1e-10
                    && (py - cy[cy.len() - 1]).abs() < 1e-10
                {
                    continue;
                }
                cx.push(px);
                cy.push(py);
                idx_map.push(i);
            }

            // Check first vs last
            if cx.len() > 1
                && (cx[0] - cx[cx.len() - 1]).abs() < 1e-10
                && (cy[0] - cy[cy.len() - 1]).abs() < 1e-10
            {
                cx.pop();
                cy.pop();
                idx_map.pop();
            }

            if cx.len() < 3 {
                continue;
            }

            // Check nonzero area
            let mut area = 0.0;
            for i in 0..cx.len() {
                let j = (i + 1) % cx.len();
                area += cx[i] * cy[j] - cx[j] * cy[i];
            }
            if area.abs() < 1e-20 {
                continue;
            }

            // Pack into flat coords for earcut
            let mut coords: Vec<f64> = Vec::with_capacity(cx.len() * 2);
            for i in 0..cx.len() {
                coords.push(cx[i]);
                coords.push(cy[i]);
            }

            let hole_indices: Vec<usize> = Vec::new();
            match earcutr::earcut(&coords, &hole_indices, 2) {
                Ok(tris) => {
                    for &tri_idx in &tris {
                        let orig_idx = idx_map[tri_idx];
                        verts.push(poly.x[orig_idx] as f32 * scale as f32);
                        verts.push(poly.y[orig_idx] as f32 * scale as f32);
                    }
                }
                Err(_) => continue,
            }
        }
    }

    verts
}

/// Extract polygon edges for side wall generation.
fn extract_edges(polys: &[Polygon], scale: f64) -> Vec<f32> {
    let mut edges: Vec<f32> = Vec::new();
    let s = scale as f32;

    for poly in polys {
        let n = poly.x.len();
        if n < 3 {
            continue;
        }
        for i in 0..n {
            let j = (i + 1) % n;
            edges.push(poly.x[i] as f32 * s);
            edges.push(poly.y[i] as f32 * s);
            edges.push(poly.x[j] as f32 * s);
            edges.push(poly.y[j] as f32 * s);
        }
    }

    edges
}
