//! Content-addressed CUBE tables. Preview, export and batch share this evaluator.
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Mutex},
};

pub const MAX_BYTES: usize = 16_000_000;
#[derive(Clone, Debug)]
pub struct Lut {
    pub size: usize,
    pub dimensions: usize,
    pub min: [f32; 3],
    pub max: [f32; 3],
    pub data: Vec<f32>,
}
static TABLES: Mutex<BTreeMap<String, Arc<Lut>>> = Mutex::new(BTreeMap::new());
pub fn digest(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub fn parse(text: &str) -> Result<Lut, String> {
    if text.len() > MAX_BYTES {
        return Err("CUBE exceeds 16 MB".into());
    }
    let mut lut = Lut {
        size: 0,
        dimensions: 3,
        min: [0.; 3],
        max: [1.; 3],
        data: Vec::new(),
    };
    let mut headers = BTreeSet::new();
    fn number(s: &str) -> Result<f32, String> {
        let n = s.parse::<f32>().map_err(|_| "Invalid CUBE number")?;
        if !n.is_finite() || n.abs() > 1_000_000. {
            return Err("Invalid CUBE number".into());
        }
        Ok(n)
    }
    for (i, source) in text.trim_start_matches('\u{feff}').lines().enumerate() {
        let line = source.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let key = tokens[0];
        let args = &tokens[1..];
        let result = (|| -> Result<(), String> {
            if key == "TITLE" {
                return Ok(());
            }
            if key.starts_with(|c: char| c.is_ascii_digit() || c == '-' || c == '+' || c == '.') {
                if lut.size == 0 || tokens.len() != 3 {
                    return Err("Expected size followed by RGB rows".into());
                }
                for token in &tokens {
                    lut.data.push(number(token)?);
                }
                if lut.data.len() > lut.size.pow(lut.dimensions as u32) * 3 {
                    return Err("Too many CUBE rows".into());
                }
                return Ok(());
            }
            if !lut.data.is_empty() {
                return Err("CUBE headers must precede data".into());
            }
            if !headers.insert(key) {
                return Err("Duplicate CUBE header".into());
            }
            match key {
                "LUT_3D_SIZE" | "LUT_1D_SIZE" => {
                    if lut.size != 0 || args.len() != 1 {
                        return Err("Combined shaper/3D CUBEs are not supported".into());
                    }
                    let size = number(args[0])?;
                    lut.dimensions = if key == "LUT_3D_SIZE" { 3 } else { 1 };
                    if size.fract() != 0.
                        || size < 2.
                        || size > if lut.dimensions == 3 { 65. } else { 65536. }
                    {
                        return Err("Supported sizes: 3D 2-65; 1D 2-65536".into());
                    }
                    lut.size = size as usize;
                }
                "DOMAIN_MIN" | "DOMAIN_MAX" => {
                    if args.len() != 3
                        || headers.contains("LUT_3D_INPUT_RANGE")
                        || headers.contains("LUT_1D_INPUT_RANGE")
                    {
                        return Err("Invalid or conflicting CUBE domain".into());
                    }
                    let v = [number(args[0])?, number(args[1])?, number(args[2])?];
                    if key == "DOMAIN_MIN" {
                        lut.min = v;
                    } else {
                        lut.max = v;
                    }
                }
                "LUT_3D_INPUT_RANGE" | "LUT_1D_INPUT_RANGE" => {
                    if args.len() != 2
                        || headers.contains("DOMAIN_MIN")
                        || headers.contains("DOMAIN_MAX")
                        || lut.size == 0
                        || key != format!("LUT_{}D_INPUT_RANGE", lut.dimensions)
                    {
                        return Err("Invalid or conflicting CUBE input range".into());
                    }
                    lut.min = [number(args[0])?; 3];
                    lut.max = [number(args[1])?; 3];
                }
                _ => return Err(format!("Unsupported CUBE directive: {key}")),
            }
            Ok(())
        })();
        result.map_err(|e| format!("Line {}: {e}", i + 1))?;
    }
    if lut.size == 0 || lut.data.len() != lut.size.pow(lut.dimensions as u32) * 3 {
        return Err("CUBE row count does not match its size".into());
    }
    if (0..3).any(|k| lut.min[k] >= lut.max[k]) {
        return Err("CUBE domain maximum must exceed minimum".into());
    }
    Ok(lut)
}
pub fn register(text: &str) -> Result<String, String> {
    if text.len() > MAX_BYTES {
        return Err("CUBE exceeds 16 MB".into());
    }
    let id = digest(text);
    if TABLES
        .lock()
        .map_err(|_| "LUT cache unavailable")?
        .contains_key(&id)
    {
        return Ok(id);
    }
    let lut = Arc::new(parse(text)?);
    let mut tables = TABLES.lock().map_err(|_| "LUT cache unavailable")?;
    if tables.values().map(|l| l.data.len() * 4).sum::<usize>() + lut.data.len() * 4 > 256_000_000 {
        return Err("LUT cache exceeds 256 MB; restart the app before loading more LUTs".into());
    }
    tables.insert(id.clone(), lut);
    Ok(id)
}
#[tauri::command]
pub async fn register_lut(text: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || register(&text))
        .await
        .map_err(|e| e.to_string())?
}
pub fn get(id: &str) -> Result<Arc<Lut>, String> {
    TABLES
        .lock()
        .map_err(|_| "LUT cache unavailable")?
        .get(id)
        .cloned()
        .ok_or_else(|| {
            "Selected LUT is unavailable. Import it again or disable LUT grading.".into()
        })
}
impl Lut {
    pub fn sample(&self, rgb: [f32; 3]) -> [f32; 3] {
        let n = self.size;
        let p: [f32; 3] = std::array::from_fn(|k| {
            ((rgb[k] - self.min[k]) / (self.max[k] - self.min[k])).clamp(0., 1.) * (n - 1) as f32
        });
        let lo: [usize; 3] = p.map(|v| (v.floor() as usize).min(n - 2));
        let t: [f32; 3] = std::array::from_fn(|k| p[k] - lo[k] as f32);
        if self.dimensions == 1 {
            return std::array::from_fn(|k| {
                self.data[lo[k] * 3 + k] * (1. - t[k]) + self.data[(lo[k] + 1) * 3 + k] * t[k]
            });
        }
        let mut out = [0.; 3];
        for b in 0..2 {
            for g in 0..2 {
                for r in 0..2 {
                    let weight = if r == 1 { t[0] } else { 1. - t[0] }
                        * if g == 1 { t[1] } else { 1. - t[1] }
                        * if b == 1 { t[2] } else { 1. - t[2] };
                    let i = ((lo[2] + b) * n * n + (lo[1] + g) * n + lo[0] + r) * 3;
                    for k in 0..3 {
                        out[k] += self.data[i + k] * weight;
                    }
                }
            }
        }
        out
    }
    pub fn apply(&self, p: &mut [f32], strength: f32, space: &str, outside: &str) {
        if strength == 0. {
            return;
        }
        let input = std::array::from_fn(|k| match space {
            "linear" => p[k],
            "rec709" => {
                if p[k] < 0.018 {
                    p[k] * 4.5
                } else {
                    1.099 * p[k].powf(0.45) - 0.099
                }
            }
            _ => crate::finish::enc(p[k]),
        });
        if outside == "preserve"
            && (0..3).any(|k| input[k] < self.min[k] - 1e-7 || input[k] > self.max[k] + 1e-7)
        {
            return;
        }
        let mapped = self.sample(input);
        for k in 0..3 {
            let v = match space {
                "linear" => mapped[k],
                "rec709" => {
                    if mapped[k] < 0.081 {
                        mapped[k] / 4.5
                    } else {
                        ((mapped[k] + 0.099) / 1.099).powf(1. / 0.45)
                    }
                }
                _ => crate::finish::lin(mapped[k]),
            };
            p[k] += (v - p[k]) * strength / 100.;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../tests/fixtures/lut-conformance.json")).unwrap()
    }
    #[test]
    fn matches_shared_interpolation_vectors() {
        let f = fixture();
        let lut = parse(f["cube"].as_str().unwrap()).unwrap();
        for sample in f["samples"].as_array().unwrap() {
            let input = std::array::from_fn(|k| sample["input"][k].as_f64().unwrap() as f32);
            for (k, v) in lut.sample(input).iter().enumerate() {
                assert!((v - sample["output"][k].as_f64().unwrap() as f32).abs() < 1e-6);
            }
        }
    }
    #[test]
    fn one_dimensional_domains_and_rejection() {
        let lut=parse("\u{feff}TITLE \"Ramp\"\r\nLUT_1D_SIZE 3\nDOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 1 1 1\n0 0 0\n2.5e-1 .5 .75\n1 1 1").unwrap();
        assert_eq!(lut.sample([-0.5, 0., 0.5]), [0.125, 0.5, 0.875]);
        for text in [
            "LUT_3D_SIZE 1",
            "LUT_3D_SIZE 66",
            "LUT_3D_SIZE 2\n0 0 0",
            "LUT_1D_SIZE 2\n0 0 0\nNaN 1 1",
            "LUT_1D_SIZE 2\nLUT_3D_SIZE 2",
            "LUT_1D_SIZE 2\nDOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1\n0 0 0\n1 1 1",
        ] {
            assert!(parse(text).is_err(), "{text}");
        }
    }
    #[test]
    fn preserves_hdr_alpha_and_strength_zero() {
        let f = fixture();
        let lut = parse(f["cube"].as_str().unwrap()).unwrap();
        for rgb in [[-0.2, 0.5, 0.5, 0.25], [4., 0.5, 0.5, 0.75]] {
            let mut p = rgb;
            lut.apply(&mut p, 100., "srgb", "preserve");
            assert_eq!(p, rgb);
        }
        let original = [0.2, 0.4, 0.6, 0.5];
        let mut p = original;
        lut.apply(&mut p, 0., "linear", "clamp");
        assert_eq!(p, original);
        lut.apply(&mut p, 50., "linear", "preserve");
        for k in 0..3 {
            assert!((p[k] - (original[k] + [0.34, 0.47, 0.3][k]) / 2.).abs() < 1e-6);
        }
        assert_eq!(p[3], 0.5);
        let identity = parse("LUT_1D_SIZE 2\n0 0 0\n1 1 1").unwrap();
        for space in ["srgb", "rec709", "linear"] {
            let mut p = original;
            identity.apply(&mut p, 100., space, "preserve");
            for k in 0..4 {
                assert!((p[k] - original[k]).abs() < 1e-6);
            }
        }
    }
    #[test]
    fn registered_table_is_content_addressed_and_missing_is_an_error() {
        let id = register(fixture()["cube"].as_str().unwrap()).unwrap();
        assert_eq!(id.len(), 64);
        assert_eq!(get(&id).unwrap().size, 2);
        assert!(get(&"f".repeat(64)).is_err());
    }
}
