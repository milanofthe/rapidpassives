use crate::types::*;
use std::collections::{HashMap, HashSet};

/// Build an instanced scene: for each cell with polygons, collect all
/// global affine transforms at which it appears in the flattened hierarchy.
pub fn build_instanced_scene(
    cells: &HashMap<String, CellData>,
    refs: &HashMap<String, CellRefs>,
    user_unit: f64,
) -> (HashMap<String, Vec<Affine2D>>, f64) {
    // Find top cell: last cell not referenced by any SREF/AREF
    let mut referenced: HashSet<&str> = HashSet::new();
    for cell_refs in refs.values() {
        for sr in &cell_refs.srefs {
            referenced.insert(&sr.sname);
        }
        for ar in &cell_refs.arefs {
            referenced.insert(&ar.sname);
        }
    }

    // Collect all cell names (from cells + refs keys)
    let mut all_names: Vec<&str> = Vec::new();
    for name in cells.keys() {
        all_names.push(name);
    }
    for name in refs.keys() {
        if !cells.contains_key(name.as_str()) {
            all_names.push(name);
        }
    }

    let top_cells: Vec<&&str> = all_names.iter().filter(|n| !referenced.contains(**n)).collect();
    let top_cell = match top_cells.last() {
        Some(&&name) => name,
        None => match all_names.last() {
            Some(&name) => name,
            None => return (HashMap::new(), user_unit),
        },
    };

    // Initialize instances map for cells that have polygons
    let mut instances: HashMap<String, Vec<Affine2D>> = HashMap::new();
    for name in cells.keys() {
        instances.insert(name.clone(), Vec::new());
    }

    // Walk hierarchy
    let mut visited: HashSet<String> = HashSet::new();
    walk(top_cell, AFFINE_IDENTITY, cells, refs, &mut instances, &mut visited);

    (instances, user_unit)
}

const AFFINE_IDENTITY: Affine2D = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

fn affine_compose(parent: &Affine2D, ox: f64, oy: f64, mag: f64, angle_deg: f64, reflect: bool) -> Affine2D {
    let rad = angle_deg * std::f64::consts::PI / 180.0;
    let cos_a = rad.cos() * mag;
    let sin_a = rad.sin() * mag;
    let (a, b, c, d) = if reflect {
        (cos_a, sin_a, sin_a, -cos_a)
    } else {
        (cos_a, -sin_a, sin_a, cos_a)
    };
    let [pa, pb, pc, pd, ptx, pty] = *parent;
    [
        pa * a + pb * c,
        pa * b + pb * d,
        pc * a + pd * c,
        pc * b + pd * d,
        pa * ox + pb * oy + ptx,
        pc * ox + pd * oy + pty,
    ]
}

fn walk(
    cell_name: &str,
    transform: Affine2D,
    cells: &HashMap<String, CellData>,
    refs: &HashMap<String, CellRefs>,
    instances: &mut HashMap<String, Vec<Affine2D>>,
    visited: &mut HashSet<String>,
) {
    // Record transform for this cell if it has polygons
    if cells.contains_key(cell_name) {
        instances.get_mut(cell_name).unwrap().push(transform);
    }

    // Get references for this cell
    let cell_refs = match refs.get(cell_name) {
        Some(r) => r,
        None => return,
    };

    // SREFs
    for sr in &cell_refs.srefs {
        let key = format!("{}@{},{}", sr.sname, transform[4] as i64 + sr.xy.0 as i64, transform[5] as i64 + sr.xy.1 as i64);
        if visited.contains(&key) {
            continue;
        }
        visited.insert(key.clone());

        let reflect = (sr.strans & 0x8000) != 0;
        let child_transform = affine_compose(&transform, sr.xy.0 as f64, sr.xy.1 as f64, sr.mag, sr.angle, reflect);
        walk(&sr.sname, child_transform, cells, refs, instances, visited);

        visited.remove(&key);
    }

    // AREFs
    for ar in &cell_refs.arefs {
        let (ref_x, ref_y) = (ar.xy[0].0 as f64, ar.xy[0].1 as f64);
        let col_dx = (ar.xy[1].0 as f64 - ref_x) / ar.columns as f64;
        let col_dy = (ar.xy[1].1 as f64 - ref_y) / ar.columns as f64;
        let row_dx = (ar.xy[2].0 as f64 - ref_x) / ar.rows as f64;
        let row_dy = (ar.xy[2].1 as f64 - ref_y) / ar.rows as f64;
        let reflect = (ar.strans & 0x8000) != 0;

        for col in 0..ar.columns {
            for row in 0..ar.rows {
                let ex = ref_x + col as f64 * col_dx + row as f64 * row_dx;
                let ey = ref_y + col as f64 * col_dy + row as f64 * row_dy;
                let child_transform = affine_compose(&transform, ex, ey, ar.mag, ar.angle, reflect);
                walk(&ar.sname, child_transform, cells, refs, instances, visited);
            }
        }
    }
}
