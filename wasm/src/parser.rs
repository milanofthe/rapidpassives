use crate::types::*;
use gds21::{GdsElement, GdsLibrary, GdsPoint, GdsStrans};
use std::collections::HashMap;

/// Parse a GDS-II binary file into cell data, references, and units.
pub fn parse_gds(
    data: &[u8],
) -> Result<(HashMap<String, CellData>, HashMap<String, CellRefs>, GdsUnits), String> {
    let lib = GdsLibrary::from_bytes(data.to_vec())
        .map_err(|e| format!("GDS parse error: {e}"))?;

    // gds21's user_unit() = first GDSII real from UNITS record = our JS userUnit
    let units = GdsUnits {
        user_unit: lib.units.user_unit(),
        meters_per_unit: lib.units.db_unit(),
    };

    let mut cells: HashMap<String, CellData> = HashMap::new();
    let mut refs: HashMap<String, CellRefs> = HashMap::new();

    for strct in &lib.structs {
        let name = strct.name.clone();
        let mut polygons: HashMap<i16, Vec<Polygon>> = HashMap::new();
        let mut srefs: Vec<SRef> = Vec::new();
        let mut arefs: Vec<ARef> = Vec::new();

        for elem in &strct.elems {
            match elem {
                GdsElement::GdsBoundary(b) => {
                    if let Some(poly) = points_to_polygon(&b.xy) {
                        polygons.entry(b.layer).or_default().push(poly);
                    }
                }
                GdsElement::GdsBox(b) => {
                    if let Some(poly) = points_to_polygon(&b.xy) {
                        polygons.entry(b.layer).or_default().push(poly);
                    }
                }
                GdsElement::GdsPath(p) => {
                    let width = p.width.unwrap_or(0);
                    let pathtype = p.path_type.unwrap_or(0);
                    if width > 0 {
                        for poly in path_to_polygons(&p.xy, width, pathtype) {
                            polygons.entry(p.layer).or_default().push(poly);
                        }
                    }
                }
                GdsElement::GdsStructRef(sr) => {
                    let (strans, mag, angle) = extract_strans(&sr.strans);
                    srefs.push(SRef {
                        sname: sr.name.clone(),
                        xy: (sr.xy.x, sr.xy.y),
                        strans,
                        mag,
                        angle,
                    });
                }
                GdsElement::GdsArrayRef(ar) => {
                    let (strans, mag, angle) = extract_strans(&ar.strans);
                    arefs.push(ARef {
                        sname: ar.name.clone(),
                        xy: [
                            (ar.xy[0].x, ar.xy[0].y),
                            (ar.xy[1].x, ar.xy[1].y),
                            (ar.xy[2].x, ar.xy[2].y),
                        ],
                        columns: ar.cols,
                        rows: ar.rows,
                        strans,
                        mag,
                        angle,
                    });
                }
                _ => {} // Skip text, node, etc.
            }
        }

        if !polygons.is_empty() {
            cells.insert(name.clone(), CellData { polygons });
        }
        if !srefs.is_empty() || !arefs.is_empty() {
            refs.insert(name, CellRefs { srefs, arefs });
        }
    }

    Ok((cells, refs, units))
}

fn extract_strans(strans: &Option<GdsStrans>) -> (u16, f64, f64) {
    match strans {
        Some(st) => {
            let flags = if st.reflected { 0x8000u16 } else { 0 };
            let mag = st.mag.unwrap_or(1.0);
            let angle = st.angle.unwrap_or(0.0);
            (flags, mag, angle)
        }
        None => (0, 1.0, 0.0),
    }
}

/// Convert GDS points to a polygon, dropping the closing point if present.
fn points_to_polygon(points: &[GdsPoint]) -> Option<Polygon> {
    if points.len() < 3 {
        return None;
    }
    let n = points.len();
    let closed = points[0].x == points[n - 1].x && points[0].y == points[n - 1].y;
    let count = if closed { n - 1 } else { n };
    if count < 3 {
        return None;
    }
    Some(Polygon {
        x: points[..count].iter().map(|p| p.x).collect(),
        y: points[..count].iter().map(|p| p.y).collect(),
    })
}

/// Expand a GDS PATH element into rectangles (one per segment).
fn path_to_polygons(xy: &[GdsPoint], width: i32, pathtype: i16) -> Vec<Polygon> {
    if xy.len() < 2 || width <= 0 {
        return Vec::new();
    }
    let hw = (width.abs() as f64) / 2.0;
    let mut polys = Vec::new();

    for i in 0..xy.len() - 1 {
        let (x0, y0) = (xy[i].x as f64, xy[i].y as f64);
        let (x1, y1) = (xy[i + 1].x as f64, xy[i + 1].y as f64);
        let dx = x1 - x0;
        let dy = y1 - y0;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-10 {
            continue;
        }
        let nx = -dy / len * hw;
        let ny = dx / len * hw;

        let (mut ex, mut ey) = (0.0, 0.0);
        if pathtype == 2 {
            ex = dx / len * hw;
            ey = dy / len * hw;
        }

        polys.push(Polygon {
            x: vec![
                (x0 - nx - ex) as i32,
                (x1 - nx + ex) as i32,
                (x1 + nx + ex) as i32,
                (x0 + nx - ex) as i32,
            ],
            y: vec![
                (y0 - ny - ey) as i32,
                (y1 - ny + ey) as i32,
                (y1 + ny + ey) as i32,
                (y0 + ny - ey) as i32,
            ],
        });
    }
    polys
}
