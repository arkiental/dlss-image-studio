//! Scene-linear source and deterministic render finishing. No generative filters.
use image::{ImageDecoder, ImageEncoder};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

#[derive(Clone, Debug)]
pub struct Frame {
    pub w: u32,
    pub h: u32,
    pub px: Vec<f32>,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub width: u32,
    pub height: u32,
    pub bit_depth: u16,
    pub space: String,
    pub hdr: bool,
    pub passes: Vec<String>,
    pub path: String,
    pub icc: bool,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
pub struct Area {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Mask {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub invert: bool,
    pub operation: String,
    pub opacity: f32,
    pub feather: f32,
    pub radius: f32,
    pub hardness: f32,
    pub flow: f32,
    pub rect: Area,
    pub points: Vec<Point>,
    pub low: f32,
    pub high: f32,
    pub color: Vec<f32>,
    pub pass: String,
    pub exposure: f32,
    #[serde(default)]
    pub stroke_ops: Vec<bool>,
    #[serde(default)]
    pub expand: f32,
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub dodge_mode: String,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Finish {
    pub exposure: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub temperature: f32,
    pub tint: f32,
    pub denoise: f32,
    pub chroma_denoise: f32,
    pub preserve_detail: f32,
    pub sharpen: f32,
    pub sharpen_radius: f32,
    pub sharpen_threshold: f32,
    pub clarity: f32,
    pub texture: f32,
    pub dehaze: f32,
    pub bloom: f32,
    pub bloom_threshold: f32,
    pub bloom_radius: f32,
    pub vignette: f32,
    pub vignette_midpoint: f32,
    pub grain: f32,
    pub grade: Vec<Vec<f32>>,
    pub grade_strength: f32,
    pub grade_balance: f32,
    pub lift: f32,
    pub gain: f32,
    pub curves: Vec<Vec<Point>>,
    pub crop: Area,
    pub rotation: f32,
    pub flip_x: bool,
    pub flip_y: bool,
    pub masks: Vec<Mask>,
    pub masked: bool,
    pub depth_pass: String,
    pub focus: f32,
    pub dof: f32,
    pub fog: f32,
    pub solo_pass: String,
    pub pass_low: f32,
    pub pass_high: f32,
    pub pass_invert: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub format: String,
    pub bit_depth: u8,
    pub quality: u8,
    pub scale: f32,
    pub width: u32,
    pub height: u32,
    pub resize: String,
    pub filter: String,
    pub space: String,
    pub suffix: String,
}
pub fn lin(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}
pub fn enc(v: f32) -> f32 {
    if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * v.powf(1. / 2.4) - 0.055
    }
}
fn lum(v: &[f32]) -> f32 {
    v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722
}
fn smooth(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a).max(0.000001)).clamp(0., 1.);
    t * t * (3. - 2. * t)
}
pub fn valid_size(w: u32, h: u32) -> Result<(), String> {
    if w == 0 || h == 0 || w > 16384 || h > 16384 || w as u64 * h as u64 > 64_000_000 {
        Err("Image exceeds 64 MP / 16384 pixels per side".into())
    } else {
        Ok(())
    }
}
impl Frame {
    pub fn rgba8(w: u32, h: u32, bytes: &[u8]) -> Self {
        Self {
            w,
            h,
            px: bytes
                .chunks_exact(4)
                .flat_map(|p| {
                    [
                        lin(p[0] as f32 / 255.),
                        lin(p[1] as f32 / 255.),
                        lin(p[2] as f32 / 255.),
                        p[3] as f32 / 255.,
                    ]
                })
                .collect(),
        }
    }
    pub fn display(&self) -> Vec<u8> {
        self.px
            .par_chunks(4)
            .flat_map_iter(|p| {
                [
                    enc(p[0]).clamp(0., 1.) * 255.,
                    enc(p[1]).clamp(0., 1.) * 255.,
                    enc(p[2]).clamp(0., 1.) * 255.,
                    p[3].clamp(0., 1.) * 255.,
                ]
                .map(|x| x.round() as u8)
            })
            .collect()
    }
    pub fn packed(&self) -> Vec<u8> {
        let mut b = Vec::with_capacity(8 + self.px.len());
        b.extend(self.w.to_le_bytes());
        b.extend(self.h.to_le_bytes());
        b.extend(self.display());
        b
    }
    pub fn resize(&self, w: u32, h: u32, filter: image::imageops::FilterType) -> Self {
        if (w, h) == (self.w, self.h) {
            return self.clone();
        }
        let im = image::Rgba32FImage::from_raw(self.w, self.h, self.px.clone()).unwrap();
        let out = image::imageops::resize(&im, w, h, filter);
        Self {
            w,
            h,
            px: out.into_raw(),
        }
    }
    pub fn preview(&self, max: u32) -> Self {
        if max == 0 || self.w.max(self.h) <= max {
            self.clone()
        } else {
            let r = max as f64 / self.w.max(self.h) as f64;
            self.resize(
                (self.w as f64 * r).round().max(1.) as u32,
                (self.h as f64 * r).round().max(1.) as u32,
                image::imageops::FilterType::Triangle,
            )
        }
    }
}
pub fn read(path: &Path, space: &str) -> Result<(Frame, Info, BTreeMap<String, Frame>), String> {
    let exr = path
        .extension()
        .is_some_and(|s| s.to_string_lossy().eq_ignore_ascii_case("exr"));
    let mut passes = BTreeMap::new();
    let mut has_icc = false;
    let mut exr_space = "linear";
    let (mut frame, bits) = if exr {
        use exr::prelude::*;
        let meta = MetaData::read_from_file(path, false).map_err(|e| e.to_string())?;
        if space == "auto" {
            if let Some(c) = meta
                .headers
                .first()
                .and_then(|h| h.shared_attributes.chromaticities.as_ref())
            {
                let near = |x: f32, y: f32| (x - y).abs() < 0.002;
                if near(c.red.0, 0.713) && near(c.green.0, 0.165) && near(c.blue.1, 0.044) {
                    exr_space = "acescg";
                } else if !(near(c.red.0, 0.64) && near(c.green.0, 0.30) && near(c.blue.1, 0.06)) {
                    return Err("EXR has unrecognized primaries. Choose an explicit input interpretation in Settings before opening it.".into());
                }
            }
        }
        let count: usize = meta
            .headers
            .iter()
            .map(|h| h.layer_size.area() * h.channels.list.len())
            .sum();
        if count > 128_000_000 {
            return Err(
                "EXR channel data exceeds the 512 MB import budget. Export fewer layers.".into(),
            );
        }
        for h in &meta.headers {
            if h.own_attributes.layer_position != h.shared_attributes.display_window.position
                || h.layer_size != h.shared_attributes.display_window.size
            {
                return Err("Cropped/offset EXR data windows are not supported yet. Export full-frame EXR layers with matching data/display windows.".into());
            }
            valid_size(h.layer_size.width() as u32, h.layer_size.height() as u32)?;
        }
        let file = read()
            .no_deep_data()
            .largest_resolution_level()
            .all_channels()
            .all_layers()
            .all_attributes()
            .from_file(path)
            .map_err(|e| format!("EXR: {e}"))?;
        let mut beauty = None;
        let mut source_bits = 16;
        for (n, layer) in file.layer_data.into_iter().enumerate() {
            let w = layer.size.width() as u32;
            let h = layer.size.height() as u32;
            let layer_name = layer
                .attributes
                .layer_name
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or(format!("Layer {n}"));
            let mut groups: BTreeMap<String, BTreeMap<String, Vec<f32>>> = BTreeMap::new();
            for c in layer.channel_data.list {
                if !matches!(c.sample_data, FlatSamples::F16(_)) {
                    source_bits = 32;
                }
                let name = c.name.to_string();
                let (group, channel) = name.rsplit_once('.').unwrap_or((&layer_name, &name));
                let samples: Vec<f32> = c
                    .sample_data
                    .values_as_f32()
                    .map(|v| if v.is_finite() { v } else { 0. })
                    .collect();
                groups
                    .entry(group.to_string())
                    .or_default()
                    .insert(channel.to_string(), samples);
            }
            for (group, channels) in groups {
                let red = channels.get("R").or_else(|| channels.get("X"));
                let green = channels.get("G").or_else(|| channels.get("Y"));
                let blue = channels.get("B").or_else(|| channels.get("Z"));
                if let (Some(r), Some(g), Some(b)) = (red, green, blue) {
                    let a = channels.get("A");
                    let px = (0..w as usize * h as usize)
                        .flat_map(|i| [r[i], g[i], b[i], a.map(|v| v[i]).unwrap_or(1.)])
                        .collect();
                    let f = Frame { w, h, px };
                    if beauty.is_none()
                        || group.to_lowercase().contains("beauty")
                        || group.to_lowercase().contains("combined")
                    {
                        beauty = Some(f.clone())
                    }
                    passes.insert(format!("{layer_name}/{group}"), f);
                } else {
                    for (c, v) in channels {
                        passes.insert(
                            format!("{layer_name}/{group}.{c}"),
                            Frame {
                                w,
                                h,
                                px: v.into_iter().flat_map(|v| [v, v, v, 1.]).collect(),
                            },
                        );
                    }
                }
            }
        }
        (
            beauty
                .or_else(|| passes.values().next().cloned())
                .ok_or("EXR contains no supported flat channels")?,
            source_bits,
        )
    } else {
        let reader = image::ImageReader::open(path)
            .map_err(|e| e.to_string())?
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
        let (w, h) = decoder.dimensions();
        valid_size(w, h)?;
        let bits =
            decoder.color_type().bits_per_pixel() / decoder.color_type().channel_count() as u16;
        let mut icc = decoder.icc_profile().map_err(|e| e.to_string())?;
        // Read TIFF's byte tag directly: image's legacy get_tag_u8_vec drops
        // profiles represented by tiff 0.11 as unsigned tag values.
        if icc.is_none()
            && path.extension().is_some_and(|v| {
                ["tif", "tiff"].contains(&v.to_string_lossy().to_lowercase().as_str())
            })
        {
            let mut t = tiff::decoder::Decoder::new(std::io::BufReader::new(
                std::fs::File::open(path).map_err(|e| e.to_string())?,
            ))
            .map_err(|e| e.to_string())?;
            icc = t
                .find_tag_unsigned_vec::<u8>(tiff::tags::Tag::IccProfile)
                .map_err(|e| format!("TIFF ICC: {e}"))?;
        }
        has_icc = icc.is_some();
        let mut px = image::DynamicImage::from_decoder(decoder)
            .map_err(|e| e.to_string())?
            .to_rgba32f()
            .into_raw();
        if let Some(icc) = icc.filter(|_| space == "auto") {
            let profile = moxcms::ColorProfile::new_from_slice(&icc)
                .map_err(|e| format!("Invalid ICC profile: {e}"))?;
            if profile.color_space != moxcms::DataColorSpace::Rgb {
                return Err(
                    "Only RGB ICC inputs are supported; convert this render to RGB first.".into(),
                );
            }
            let tr = profile
                .create_transform_f32(
                    moxcms::Layout::Rgba,
                    &moxcms::ColorProfile::new_srgb(),
                    moxcms::Layout::Rgba,
                    Default::default(),
                )
                .map_err(|e| e.to_string())?;
            let mut dst = vec![0.; px.len()];
            tr.transform(&px, &mut dst).map_err(|e| e.to_string())?;
            px = dst;
        }
        (Frame { w, h, px }, bits)
    };
    let input = if space == "auto" {
        if exr {
            exr_space
        } else if bits > 16 {
            "linear"
        } else {
            "srgb"
        }
    } else {
        space
    };
    if !["linear", "srgb", "p3", "acescg", "rec709"].contains(&input) {
        return Err("Unsupported input color space".into());
    }
    frame.px.par_chunks_mut(4).for_each(|p| {
        for v in &mut p[..3] {
            if !v.is_finite() {
                *v = 0.;
            }
            if input == "srgb" || input == "p3" {
                *v = lin(*v)
            } else if input == "rec709" {
                *v = if *v < 0.081 {
                    *v / 4.5
                } else {
                    ((*v + 0.099) / 1.099).powf(1. / 0.45)
                }
            }
        }
        let [r, g, b] = [p[0], p[1], p[2]];
        if input == "p3" {
            p[0] = 1.224745 * r - 0.224904 * g;
            p[1] = -0.042058 * r + 1.042081 * g;
            p[2] = -0.019642 * r - 0.078655 * g + 1.098537 * b;
        }
        if input == "acescg" {
            p[0] = 1.705051 * r - 0.621792 * g - 0.083259 * b;
            p[1] = -0.130257 * r + 1.140805 * g - 0.010548 * b;
            p[2] = -0.024003 * r - 0.128969 * g + 1.152972 * b;
        }
    });
    let hdr = exr
        || frame
            .px
            .chunks_exact(4)
            .any(|p| p[..3].iter().any(|v| *v > 1. || *v < 0.));
    let info = Info {
        width: frame.w,
        height: frame.h,
        bit_depth: bits,
        space: if has_icc && space == "auto" {
            "ICC to linear sRGB".into()
        } else {
            input.into()
        },
        hdr,
        passes: passes.keys().cloned().collect(),
        path: path.to_string_lossy().into(),
        icc: has_icc,
    };
    Ok((frame, info, passes))
}
impl Finish {
    pub fn validate(&self) -> Result<(), String> {
        let json = serde_json::to_value(self).map_err(|e| e.to_string())?;
        fn check(v: &serde_json::Value) -> bool {
            match v {
                serde_json::Value::Number(n) => n
                    .as_f64()
                    .is_some_and(|n| n.is_finite() && n.abs() <= 1_000_000.),
                serde_json::Value::Null => false,
                serde_json::Value::Array(a) => a.iter().all(check),
                serde_json::Value::Object(o) => o.values().all(check),
                _ => true,
            }
        }
        if !check(&json)
            || self.masks.len() > 64
            || self.masks.iter().any(|m| m.points.len() > 10000)
            || self.curves.len() != 4
            || self.grade.len() != 3
            || self.grade.iter().any(|g| g.len() != 3)
        {
            return Err("Invalid finishing settings".into());
        }
        for c in &self.curves {
            if c.len() < 2
                || c.len() > 32
                || c.windows(2).any(|p| p[0].x >= p[1].x)
                || c.iter()
                    .any(|p| p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.)
            {
                return Err("Curve points must be ordered in the 0-1 range".into());
            }
        }
        let r = &self.crop;
        if r.x < 0.
            || r.y < 0.
            || r.width <= 0.
            || r.height <= 0.
            || r.x + r.width > 1.0001
            || r.y + r.height > 1.0001
        {
            return Err("Crop outside source image".into());
        }
        for (value, min, max) in [
            (self.exposure, -6., 6.),
            (self.sharpen_radius, 0.5, 8.),
            (self.bloom_radius, 1., 80.),
            (self.dof, 0., 40.),
            (self.focus, 0., 1.),
            (self.rotation, 0., 270.),
        ] {
            if value < min || value > max {
                return Err("Finishing value outside supported range".into());
            }
        }
        if self.rotation % 90. != 0. {
            return Err("Only quarter-turn rotations are currently supported".into());
        }
        for m in &self.masks {
            if ![
                "rectangle",
                "ellipse",
                "linear",
                "radial",
                "brush",
                "polygon",
                "luminance",
                "color",
                "pass",
            ]
            .contains(&m.kind.as_str())
                || !["add", "subtract", "intersect"].contains(&m.operation.as_str())
                || m.color.len() != 3
            {
                return Err("Unsupported mask".into());
            }
            if m.opacity < 0.
                || m.opacity > 100.
                || m.feather < 0.
                || m.feather > 100.
                || m.radius <= 0.
                || m.radius > 0.5
                || m.expand.abs() > 100.
                || m.blur < 0.
                || m.blur > 100.
                || m.hardness < 0.
                || m.hardness > 100.
                || m.flow < 0.
                || m.flow > 100.
                || m.exposure.abs() > 3.
                || m.stroke_ops.len() > 10000
                || !["", "exposure", "highlights", "shadows", "saturation"]
                    .contains(&m.dodge_mode.as_str())
                || m.points
                    .iter()
                    .any(|p| p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.)
            {
                return Err("Mask values outside supported range".into());
            }
        }
        Ok(())
    }
}
// Shape-preserving cubic Hermite interpolation; endpoints extrapolate linearly for HDR.
fn curve(c: &[Point], x: f32) -> f32 {
    if x < 0. || x > 1. {
        return x;
    }
    let i = c
        .windows(2)
        .position(|p| x <= p[1].x)
        .unwrap_or(c.len() - 2);
    let a = &c[i];
    let b = &c[i + 1];
    let slope = |i: usize| (c[i + 1].y - c[i].y) / (c[i + 1].x - c[i].x).max(1e-6);
    let d = slope(i);
    let tangent = |left: f32, right: f32| {
        if left * right <= 0. {
            0.
        } else {
            2. * left * right / (left + right)
        }
    };
    let m0 = if i == 0 { d } else { tangent(slope(i - 1), d) };
    let m1 = if i + 2 == c.len() {
        d
    } else {
        tangent(d, slope(i + 1))
    };
    let h = b.x - a.x;
    let t = (x - a.x) / h;
    let t2 = t * t;
    let t3 = t2 * t;
    (2. * t3 - 3. * t2 + 1.) * a.y
        + (t3 - 2. * t2 + t) * h * m0
        + (-2. * t3 + 3. * t2) * b.y
        + (t3 - t2) * h * m1
}
fn blur(f: &Frame, r: usize) -> Frame {
    let r = r.max(1).min(160);
    let w = f.w as usize;
    let h = f.h as usize;
    let mut tmp = vec![0.; f.px.len()];
    tmp.par_chunks_mut(w * 4).enumerate().for_each(|(y, row)| {
        for k in 0..4 {
            let mut sum = 0.;
            for x in 0..=r {
                sum += f.px[(y * w + x.min(w - 1)) * 4 + k];
            }
            sum += f.px[y * w * 4 + k] * r as f32;
            for x in 0..w {
                row[x * 4 + k] = sum / (2 * r + 1) as f32;
                sum += f.px[(y * w + (x + r + 1).min(w - 1)) * 4 + k]
                    - f.px[(y * w + x.saturating_sub(r)) * 4 + k];
            }
        }
    });
    let mut columns = vec![0.; f.px.len()];
    columns
        .par_chunks_mut(h * 4)
        .enumerate()
        .for_each(|(x, col)| {
            for k in 0..4 {
                let mut sum = tmp[x * 4 + k] * r as f32;
                for y in 0..=r {
                    sum += tmp[(y.min(h - 1) * w + x) * 4 + k];
                }
                for y in 0..h {
                    col[y * 4 + k] = sum / (2 * r + 1) as f32;
                    sum += tmp[((y + r + 1).min(h - 1) * w + x) * 4 + k]
                        - tmp[(y.saturating_sub(r) * w + x) * 4 + k];
                }
            }
        });
    let mut out = f.clone();
    out.px
        .par_chunks_mut(w * 4)
        .enumerate()
        .for_each(|(y, row)| {
            for x in 0..w {
                row[x * 4..x * 4 + 4]
                    .copy_from_slice(&columns[(x * h + y) * 4..(x * h + y) * 4 + 4]);
            }
        });
    out
}
fn hue_color(h: f32) -> [f32; 3] {
    let h = h.rem_euclid(360.) / 60.;
    let x = 1. - (h % 2. - 1.).abs();
    match h as u8 {
        0 => [1., x, 0.],
        1 => [x, 1., 0.],
        2 => [0., 1., x],
        3 => [0., x, 1.],
        4 => [x, 0., 1.],
        _ => [1., 0., x],
    }
}
fn polygon_weight(points: &[Point], x: f32, y: f32, feather: f32) -> f32 {
    if points.len() < 3 {
        return 0.;
    }
    let mut inside = false;
    let mut distance = f32::MAX;
    for (a, b) in points
        .iter()
        .zip(points.iter().cycle().skip(1))
        .take(points.len())
    {
        if (a.y > y) != (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x {
            inside = !inside;
        }
        let vx = b.x - a.x;
        let vy = b.y - a.y;
        let t = (((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy).max(1e-9)).clamp(0., 1.);
        distance = distance.min(((x - a.x - t * vx).powi(2) + (y - a.y - t * vy).powi(2)).sqrt());
    }
    if inside {
        smooth(0., (feather / 100. * 0.05).max(0.00001), distance)
    } else {
        0.
    }
}
pub fn mask_at(m: &Mask, x: f32, y: f32, p: &[f32], passes: &BTreeMap<String, Frame>) -> f32 {
    let r = &m.rect;
    let f = (m.feather / 100.).clamp(0.001, 1.);
    let cx = r.x + r.width / 2.;
    let cy = r.y + r.height / 2.;
    let dx = (x - cx) / (r.width / 2.).max(0.0001);
    let dy = (y - cy) / (r.height / 2.).max(0.0001);
    let a = match m.kind.as_str() {
        "rectangle" => smooth(0., f, (1. - dx.abs()).min(1. - dy.abs())),
        "ellipse" => smooth(0., f, 1. - (dx * dx + dy * dy).sqrt()),
        "radial" => (1. - (dx * dx + dy * dy).sqrt()).clamp(0., 1.),
        "linear" => ((x - r.x) / r.width.max(0.001)).clamp(0., 1.),
        "polygon" => polygon_weight(&m.points, x, y, m.feather),
        "brush" => {
            let mut a = 0.;
            for (n, q) in m.points.iter().enumerate() {
                let d = ((x - q.x).powi(2) + (y - q.y).powi(2)).sqrt() / m.radius.clamp(0.001, 0.5);
                let v = 1. - smooth(m.hardness / 100., 1., d);
                let v = v * m.flow / 100.;
                a = if m.stroke_ops.get(n).copied().unwrap_or(false) {
                    a * (1. - v)
                } else {
                    1. - (1. - a) * (1. - v)
                };
            }
            a
        }
        "luminance" => {
            smooth(m.low - f * 0.1, m.low, lum(p)) * (1. - smooth(m.high, m.high + f * 0.1, lum(p)))
        }
        "color" => {
            let d = (0..3)
                .map(|k| (enc(p[k]) - m.color.get(k).copied().unwrap_or(0.5)).powi(2))
                .sum::<f32>()
                .sqrt();
            1. - smooth(m.high, m.high + f, d)
        }
        "pass" => passes
            .get(&m.pass)
            .map(|a| {
                let i = (((y * a.h as f32) as u32).min(a.h - 1) * a.w
                    + ((x * a.w as f32) as u32).min(a.w - 1)) as usize
                    * 4;
                let v = a.px[i];
                smooth(m.low - f * 0.01, m.low, v) * (1. - smooth(m.high, m.high + f * 0.01, v))
            })
            .unwrap_or(0.),
        _ => 0.,
    };
    (if m.invert { 1. - a } else { a }) * (m.opacity / 100.).clamp(0., 1.)
}
fn raster_mask(m: &Mask, f: &Frame, passes: &BTreeMap<String, Frame>) -> Vec<f32> {
    let w = f.w as usize;
    let h = f.h as usize;
    let mut alpha = vec![0.; w * h];
    if m.kind == "brush" {
        let r = m.radius.clamp(0.001, 0.5);
        let rx = r * w.min(h) as f32 / w as f32;
        let ry = r * w.min(h) as f32 / h as f32;
        for (n, q) in m.points.iter().enumerate() {
            let x0 = ((q.x - rx).max(0.) * w as f32) as usize;
            let x1 = ((q.x + rx).min(1.) * w as f32).ceil() as usize;
            let y0 = ((q.y - ry).max(0.) * h as f32) as usize;
            let y1 = ((q.y + ry).min(1.) * h as f32).ceil() as usize;
            for y in y0..y1.min(h) {
                for x in x0..x1.min(w) {
                    let d = (((x as f32 / w as f32 - q.x) / rx).powi(2)
                        + ((y as f32 / h as f32 - q.y) / ry).powi(2))
                    .sqrt();
                    let v = (1. - smooth(m.hardness / 100., 1., d)) * m.flow / 100.;
                    let i = y * w + x;
                    alpha[i] = if m.stroke_ops.get(n).copied().unwrap_or(false) {
                        alpha[i] * (1. - v)
                    } else {
                        1. - (1. - alpha[i]) * (1. - v)
                    };
                }
            }
        }
        alpha
            .par_iter_mut()
            .for_each(|v| *v = (if m.invert { 1. - *v } else { *v }) * m.opacity / 100.);
    } else {
        alpha.par_iter_mut().enumerate().for_each(|(i, v)| {
            *v = mask_at(
                m,
                (i % w) as f32 / w as f32,
                (i / w) as f32 / h as f32,
                &f.px[i * 4..i * 4 + 4],
                passes,
            )
        });
    }
    if m.expand != 0. {
        alpha = morph_mask(
            &alpha,
            w,
            h,
            (m.expand.abs() * w.max(h) as f32 / 2000.).round().max(1.) as usize,
            m.expand > 0.,
        );
    }
    if m.blur > 0. {
        let v = Frame {
            w: f.w,
            h: f.h,
            px: alpha.iter().flat_map(|v| [*v, *v, *v, 1.]).collect(),
        };
        alpha = blur(
            &v,
            (m.blur * w.max(h) as f32 / 2000.).round().max(1.) as usize,
        )
        .px
        .chunks(4)
        .map(|v| v[0])
        .collect();
    }
    alpha
}
// Separable running extrema for expanding/contracting masks without an O(radius) kernel.
fn morph_mask(src: &[f32], w: usize, h: usize, r: usize, dilate: bool) -> Vec<f32> {
    let r = r.min(160);
    let mut rows = vec![0.; src.len()];
    let mut out = vec![0.; src.len()];
    fn line(n: usize, r: usize, dilate: bool, get: impl Fn(usize) -> f32) -> Vec<f32> {
        let mut q = std::collections::VecDeque::<(usize, f32)>::new();
        let mut out = vec![0.; n];
        let mut next = 0;
        for (i, o) in out.iter_mut().enumerate() {
            while next <= (i + r).min(n - 1) {
                let v = get(next);
                while q
                    .back()
                    .is_some_and(|(_, b)| if dilate { *b <= v } else { *b >= v })
                {
                    q.pop_back();
                }
                q.push_back((next, v));
                next += 1;
            }
            while q.front().is_some_and(|(j, _)| *j < i.saturating_sub(r)) {
                q.pop_front();
            }
            *o = q.front().unwrap().1;
        }
        out
    }
    rows.par_chunks_mut(w)
        .enumerate()
        .for_each(|(y, row)| row.copy_from_slice(&line(w, r, dilate, |x| src[y * w + x])));
    let cols: Vec<Vec<f32>> = (0..w)
        .into_par_iter()
        .map(|x| line(h, r, dilate, |y| rows[y * w + x]))
        .collect();
    out.par_chunks_mut(w).enumerate().for_each(|(y, row)| {
        for x in 0..w {
            row[x] = cols[x][y]
        }
    });
    out
}
pub fn overlay(
    original: &Frame,
    s: &crate::StudioState,
    passes: &BTreeMap<String, Frame>,
) -> Result<Vec<u8>, String> {
    let a = s.finish.as_ref().ok_or("Missing masks")?;
    a.validate()?;
    let mut alpha = vec![0.; (original.w * original.h) as usize];
    for m in a.masks.iter().filter(|m| m.enabled) {
        let weights = raster_mask(m, original, passes);
        for (v, q) in alpha.iter_mut().zip(weights) {
            *v = match m.operation.as_str() {
                "subtract" => *v * (1. - q),
                "intersect" => *v * q,
                _ => *v + (1. - *v) * q,
            }
        }
    }
    let rgba: Vec<u8> = alpha
        .into_iter()
        .flat_map(|v| [237, 188, 115, (v.clamp(0., 1.) * 255.).round() as u8])
        .collect();
    let f = transform(Frame::rgba8(original.w, original.h, &rgba), a);
    Ok(f.packed())
}
pub fn apply(
    mut f: Frame,
    original: &Frame,
    s: &crate::StudioState,
    passes: &BTreeMap<String, Frame>,
) -> Result<Frame, String> {
    let Some(a) = &s.finish else { return Ok(f) };
    a.validate()?;
    if !a.solo_pass.is_empty() {
        let p = passes.get(&a.solo_pass).ok_or("Pass no longer available")?;
        let mut p = p.clone();
        for v in p.px.chunks_mut(4) {
            for c in &mut v[..3] {
                *c = (*c - a.pass_low) / (a.pass_high - a.pass_low).max(1e-6);
                if a.pass_invert {
                    *c = 1. - *c
                }
                *c = lin(*c)
            }
        }
        return Ok(p);
    }
    if a.masked && !a.masks.iter().any(|m| m.enabled) {
        return Err("Mask scope requires an enabled mask".into());
    }
    let identity_curves = a
        .curves
        .iter()
        .all(|c| c.len() == 2 && c[0].x == 0. && c[0].y == 0. && c[1].x == 1. && c[1].y == 1.);
    let px_scale = f.w as f32 / original.w as f32;
    if a.denoise > 0. || a.chroma_denoise > 0. {
        let b = blur(&f, 1);
        f.px.par_chunks_mut(4)
            .zip(b.px.par_chunks(4))
            .for_each(|(p, q)| {
                let l = lum(p);
                let lq = lum(q);
                let keep = (1. - ((l - lq).abs() * a.preserve_detail / 10.).min(1.)).max(0.);
                for k in 0..3 {
                    p[k] += (lq - l) * a.denoise / 100. * keep
                        + ((q[k] - lq) - (p[k] - l)) * a.chroma_denoise / 100. * keep;
                }
            });
    }
    for (amount, r, threshold) in [
        (
            a.sharpen / 100.,
            a.sharpen_radius,
            a.sharpen_threshold / 100.,
        ),
        (a.texture / 100., 2., 0.),
        (a.clarity / 100., 12., 0.),
        (a.dehaze / 150., 48., 0.),
    ] {
        if amount != 0. {
            let b = blur(&f, (r * px_scale).round().max(1.) as usize);
            f.px.par_chunks_mut(4)
                .zip(b.px.par_chunks(4))
                .for_each(|(p, q)| {
                    let diff = lum(p) - lum(q);
                    if diff.abs() >= threshold {
                        for k in 0..3 {
                            p[k] += diff * amount;
                        }
                    }
                });
        }
    }
    f.px.par_chunks_mut(4).for_each(|p| {
        let l = lum(p).max(0.);
        let sh = (1. - smooth(0.0, 0.6, l)).powi(2);
        let hi = smooth(0.25, 1., l);
        let ev = a.exposure
            + a.shadows / 100. * sh
            + a.highlights / 100. * hi
            + a.whites / 100. * hi * hi;
        for (k, v) in p[..3].iter_mut().enumerate() {
            *v *= 2f32.powf(ev);
            *v += a.blacks / 500. * (1. - hi);
            *v = (*v - 0.18) * (1. + s.contrast / 100.) + 0.18;
            *v *= 2f32.powf(s.brightness / 50.);
            if s.gamma != 0. {
                *v = v.signum() * v.abs().powf(2f32.powf(-s.gamma / 100.))
            }
            *v = (*v + a.lift / 200.) * 2f32.powf(a.gain / 100.);
            *v *= match k {
                0 => 2f32.powf(a.temperature / 200. - a.tint / 400.),
                1 => 2f32.powf(a.tint / 200.),
                _ => 2f32.powf(-a.temperature / 200. - a.tint / 400.),
            };
        }
        let l = lum(p);
        let spread = p[..3].iter().copied().fold(f32::NEG_INFINITY, f32::max)
            - p[..3].iter().copied().fold(f32::INFINITY, f32::min);
        let sat = 1. + s.saturation / 100. + s.vibrance / 100. * (1. - spread.clamp(0., 1.));
        for v in &mut p[..3] {
            *v = l + (*v - l) * sat;
        }
        let angle = s.hue.to_radians();
        let c = angle.cos();
        let sn = angle.sin();
        let [r, g, b] = [p[0], p[1], p[2]];
        p[0] = (0.299 + 0.701 * c + 0.168 * sn) * r
            + (0.587 - 0.587 * c + 0.33 * sn) * g
            + (0.114 - 0.114 * c - 0.497 * sn) * b;
        p[1] = (0.299 - 0.299 * c - 0.328 * sn) * r
            + (0.587 + 0.413 * c + 0.035 * sn) * g
            + (0.114 - 0.114 * c + 0.292 * sn) * b;
        p[2] = (0.299 - 0.299 * c + 1.25 * sn) * r
            + (0.587 - 0.587 * c - 1.05 * sn) * g
            + (0.114 + 0.886 * c - 0.203 * sn) * b;
        let t = (l + a.grade_balance / 200.).clamp(0., 1.);
        let weights = [(1. - t).powi(2), 2. * t * (1. - t), t * t];
        for (j, w) in weights.iter().enumerate() {
            let g = &a.grade[j];
            let col = hue_color(g[0]);
            for k in 0..3 {
                p[k] += (col[k] - 0.5) * g[1] / 100. * w * a.grade_strength / 100. * 0.2;
                p[k] *= 2f32.powf(g[2] / 100. * w * a.grade_strength / 100.);
            }
        }
        if !identity_curves {
            for (k, v) in p[..3].iter_mut().enumerate() {
                *v = lin(curve(&a.curves[k + 1], curve(&a.curves[0], enc(*v))));
            }
        }
    });
    if a.bloom > 0. {
        let mut bright = f.clone();
        for p in bright.px.chunks_mut(4) {
            let l = lum(p);
            let w = ((l - a.bloom_threshold) / l.max(0.0001)).clamp(0., 1.);
            for v in &mut p[..3] {
                *v *= w;
            }
        }
        let b = blur(&bright, (a.bloom_radius * px_scale).max(1.) as usize);
        for (p, q) in f.px.chunks_mut(4).zip(b.px.chunks(4)) {
            for k in 0..3 {
                p[k] += q[k] * a.bloom / 100.;
            }
        }
    }
    if a.dof > 0. || a.fog > 0. {
        let depth = passes
            .get(&a.depth_pass)
            .ok_or("Load and choose a depth pass first")?;
        let b = blur(&f, (a.dof * px_scale).max(1.) as usize);
        for (i, p) in f.px.chunks_mut(4).enumerate() {
            let x = i as u32 % f.w;
            let y = i as u32 / f.w;
            let di = ((y * depth.h / f.h) * depth.w + x * depth.w / f.w) as usize * 4;
            let z = depth.px[di];
            let range = (a.pass_high - a.pass_low).max(1e-6);
            let z = ((z - a.pass_low) / range).clamp(0., 1.);
            let w = ((z - a.focus).abs() * 3.).clamp(0., 1.);
            for k in 0..3 {
                if a.dof > 0. {
                    p[k] = p[k] * (1. - w) + b.px[i * 4 + k] * w
                }
                p[k] = p[k] * (1. - z * a.fog / 100.) + z * a.fog / 100.;
            }
        }
    }
    let original = original.resize(f.w, f.h, image::imageops::FilterType::Triangle);
    let fw = f.w;
    let fh = f.h;
    let mut alpha = vec![0.; (fw * fh) as usize];
    let mut dodge = vec![0.; alpha.len()];
    let mut saturation = vec![0.; alpha.len()];
    for m in a
        .masks
        .iter()
        .filter(|m| m.enabled && (a.masked || m.exposure != 0.))
    {
        if m.kind == "pass" && !passes.contains_key(&m.pass) {
            return Err("Choose an available render pass for the mask".into());
        }
        let weights = raster_mask(m, &original, passes);
        alpha
            .par_iter_mut()
            .zip(dodge.par_iter_mut())
            .zip(saturation.par_iter_mut())
            .zip(weights.par_iter())
            .enumerate()
            .for_each(|(i, (((v, d), sat), q))| {
                if a.masked {
                    *v = match m.operation.as_str() {
                        "subtract" => *v * (1. - q),
                        "intersect" => *v * q,
                        _ => *v + (1. - *v) * q,
                    };
                }
                if m.dodge_mode == "saturation" {
                    *sat += m.exposure * q / 3.;
                } else {
                    let l = lum(&original.px[i * 4..i * 4 + 4]);
                    let w = match m.dodge_mode.as_str() {
                        "shadows" => 1. - smooth(0., 0.6, l),
                        "highlights" => smooth(0.25, 1., l),
                        _ => 1.,
                    };
                    *d += m.exposure * q * w;
                }
            });
    }
    f.px.par_chunks_mut(4).enumerate().for_each(|(i, p)| {
        let x = (i as u32 % fw) as f32 / fw as f32;
        let y = (i as u32 / fw) as f32 / fh as f32;
        let v = smooth(
            a.vignette_midpoint / 100.,
            1.,
            ((x - 0.5).powi(2) + (y - 0.5).powi(2)).sqrt() * 1.4142,
        ) * a.vignette
            / 100.;
        let hash = (i as u32).wrapping_mul(747796405).wrapping_add(2891336453);
        let noise = ((hash ^ (hash >> 16)) % 65536) as f32 / 65535. - 0.5;
        for c in &mut p[..3] {
            *c = *c * (1. - v) + noise * a.grain / 500.;
        }
        if a.masked {
            for k in 0..3 {
                p[k] = original.px[i * 4 + k] * (1. - alpha[i]) + p[k] * alpha[i];
            }
        }
        if saturation[i] != 0. {
            let l = lum(p);
            for c in &mut p[..3] {
                *c = l + (*c - l) * (1. + saturation[i]).max(0.);
            }
        }
        if dodge[i] != 0. {
            for c in &mut p[..3] {
                *c *= 2f32.powf(dodge[i]);
            }
        }
    });
    Ok(transform(f, a))
}
pub fn transform(f: Frame, a: &Finish) -> Frame {
    let r = &a.crop;
    let x = (r.x * f.w as f32).round() as u32;
    let y = (r.y * f.h as f32).round() as u32;
    let w = (r.width * f.w as f32).round().max(1.) as u32;
    let h = (r.height * f.h as f32).round().max(1.) as u32;
    let im = image::Rgba32FImage::from_raw(f.w, f.h, f.px).unwrap();
    let mut im = image::imageops::crop_imm(
        &im,
        x.min(f.w - 1),
        y.min(f.h - 1),
        w.min(f.w - x.min(f.w - 1)),
        h.min(f.h - y.min(f.h - 1)),
    )
    .to_image();
    if a.flip_x {
        image::imageops::flip_horizontal_in_place(&mut im)
    }
    if a.flip_y {
        image::imageops::flip_vertical_in_place(&mut im)
    }
    im = match ((a.rotation / 90.).round() as i32).rem_euclid(4) {
        1 => image::imageops::rotate90(&im),
        2 => image::imageops::rotate180(&im),
        3 => image::imageops::rotate270(&im),
        _ => im,
    };
    Frame {
        w: im.width(),
        h: im.height(),
        px: im.into_raw(),
    }
}
fn output_profile(space: &str) -> Result<Vec<u8>, String> {
    use moxcms::{ColorProfile, LocalizableString, ProfileText, ToneReprCurve};
    let mut profile = if space == "p3" {
        ColorProfile::new_display_p3()
    } else {
        ColorProfile::new_srgb()
    };
    if space == "linear" || space == "rec709" {
        let curve = if space == "linear" {
            ToneReprCurve::Lut(vec![])
        } else {
            ToneReprCurve::Parametric(vec![1. / 0.45, 1. / 1.099, 0.099 / 1.099, 1. / 4.5, 0.081])
        };
        profile.red_trc = Some(curve.clone());
        profile.green_trc = Some(curve.clone());
        profile.blue_trc = Some(curve);
        profile.cicp = None;
        profile.description = Some(ProfileText::Localizable(vec![LocalizableString::new(
            "en".into(),
            "US".into(),
            if space == "linear" {
                "Linear sRGB".into()
            } else {
                "Rec.709 full range".into()
            },
        )]));
    }
    profile.encode().map_err(|e| e.to_string())
}
fn output_rgb(p: &mut [f32], space: &str) {
    let [r, g, b] = [p[0], p[1], p[2]];
    if space == "p3" {
        p[0] = 0.82259287 * r + 0.17753395 * g;
        p[1] = 0.03319951 * r + 0.96678350 * g;
        p[2] = 0.01708535 * r + 0.07239573 * g + 0.91030150 * b;
    }
    if space == "acescg" {
        p[0] = 0.6130974 * r + 0.3395231 * g + 0.0473795 * b;
        p[1] = 0.0701942 * r + 0.9163539 * g + 0.0134519 * b;
        p[2] = 0.0206156 * r + 0.1095698 * g + 0.8698146 * b;
    }
    for c in &mut p[..3] {
        if space == "srgb" || space == "p3" {
            *c = enc(*c);
        } else if space == "rec709" {
            *c = if *c < 0.018 {
                *c * 4.5
            } else {
                1.099 * c.powf(0.45) - 0.099
            };
        }
    }
}
fn exr_chromaticities(space: &str) -> exr::meta::attribute::Chromaticities {
    use exr::prelude::Vec2;
    let (r, g, b, w) = if space == "acescg" {
        (
            (0.713, 0.293),
            (0.165, 0.830),
            (0.128, 0.044),
            (0.32168, 0.33767),
        )
    } else {
        ((0.64, 0.33), (0.30, 0.60), (0.15, 0.06), (0.3127, 0.3290))
    };
    exr::meta::attribute::Chromaticities {
        red: Vec2(r.0, r.1),
        green: Vec2(g.0, g.1),
        blue: Vec2(b.0, b.1),
        white: Vec2(w.0, w.1),
    }
}
pub fn write(path: &Path, f: &Frame, o: &Output) -> Result<(), String> {
    if !path.is_absolute() || !path.parent().is_some_and(Path::is_dir) {
        return Err("Choose an existing absolute output folder".into());
    }
    if !["srgb", "linear", "p3", "rec709", "acescg"].contains(&o.space.as_str()) {
        return Err("Unsupported output transform".into());
    }
    let (w, h) = match o.resize.as_str() {
        "original" => (f.w, f.h),
        "percent" => (
            ((f.w as f64 * o.scale as f64 / 100.).round().max(1.)) as u32,
            ((f.h as f64 * o.scale as f64 / 100.).round().max(1.)) as u32,
        ),
        "exact" => (o.width, o.height),
        _ => return Err("Unknown resize mode".into()),
    };
    valid_size(w, h)?;
    let filter = match o.filter.as_str() {
        "nearest" => image::imageops::FilterType::Nearest,
        "bicubic" => image::imageops::FilterType::CatmullRom,
        "lanczos" => image::imageops::FilterType::Lanczos3,
        _ => return Err("Unknown resize filter".into()),
    };
    let mut f = f.resize(w, h, filter);
    if o.format == "exr" {
        if !["linear", "acescg"].contains(&o.space.as_str()) || ![16, 32].contains(&o.bit_depth) {
            return Err("EXR requires Linear sRGB or ACEScg, half (16) or float (32)".into());
        }
    } else {
        if ![8, 16].contains(&o.bit_depth) {
            return Err("PNG/TIFF support 8 or 16 bits; JPEG/WebP 8 bits".into());
        }
        if ["jpg", "webp"].contains(&o.format.as_str()) && o.bit_depth != 8 {
            return Err("JPEG/WebP require 8-bit output".into());
        }
        if o.space == "acescg" {
            return Err("ACEScg output requires EXR".into());
        }
    }
    f.px.par_chunks_mut(4).for_each(|p| output_rgb(p, &o.space));
    let mut encoded = std::io::Cursor::new(Vec::new());
    if o.format == "exr" {
        use exr::prelude::*;
        if o.bit_depth == 16 {
            let mut im = Image::from_channels(
                (w as usize, h as usize),
                SpecificChannels::rgba(|pos: Vec2<usize>| {
                    let i = (pos.y() * w as usize + pos.x()) * 4;
                    (
                        f16::from_f32(f.px[i]),
                        f16::from_f32(f.px[i + 1]),
                        f16::from_f32(f.px[i + 2]),
                        f16::from_f32(f.px[i + 3]),
                    )
                }),
            );
            im.attributes.chromaticities = Some(exr_chromaticities(&o.space));
            im.write()
                .to_buffered(&mut encoded)
                .map_err(|e| e.to_string())?;
        } else {
            let mut im = Image::from_channels(
                (w as usize, h as usize),
                SpecificChannels::rgba(|pos: Vec2<usize>| {
                    let i = (pos.y() * w as usize + pos.x()) * 4;
                    (f.px[i], f.px[i + 1], f.px[i + 2], f.px[i + 3])
                }),
            );
            im.attributes.chromaticities = Some(exr_chromaticities(&o.space));
            im.write()
                .to_buffered(&mut encoded)
                .map_err(|e| e.to_string())?;
        }
    } else {
        let img = if o.bit_depth == 16 {
            image::DynamicImage::ImageRgba16(
                image::ImageBuffer::from_raw(
                    w,
                    h,
                    f.px.iter()
                        .map(|v| (v.clamp(0., 1.) * 65535.).round() as u16)
                        .collect(),
                )
                .unwrap(),
            )
        } else {
            image::DynamicImage::ImageRgba8(
                image::ImageBuffer::from_raw(
                    w,
                    h,
                    f.px.iter()
                        .map(|v| (v.clamp(0., 1.) * 255.).round() as u8)
                        .collect(),
                )
                .unwrap(),
            )
        };
        if o.format == "jpg" {
            let rgb = img.to_rgb8();
            let mut e = image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut encoded,
                o.quality.clamp(1, 100),
            );
            e.set_icc_profile(output_profile(&o.space)?)
                .map_err(|e| e.to_string())?;
            e.encode(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)
                .map_err(|e| e.to_string())?;
        } else if o.format == "png" {
            let mut e = image::codecs::png::PngEncoder::new(&mut encoded);
            e.set_icc_profile(output_profile(&o.space)?)
                .map_err(|e| e.to_string())?;
            e.write_image(img.as_bytes(), w, h, img.color().into())
                .map_err(|e| e.to_string())?;
        } else if o.format == "tiff" {
            let mut e = image::codecs::tiff::TiffEncoder::new(&mut encoded);
            e.set_icc_profile(output_profile(&o.space)?)
                .map_err(|e| e.to_string())?;
            e.write_image(img.as_bytes(), w, h, img.color().into())
                .map_err(|e| e.to_string())?;
        } else if o.format == "webp" {
            let mut e = image::codecs::webp::WebPEncoder::new_lossless(&mut encoded);
            e.set_icc_profile(output_profile(&o.space)?)
                .map_err(|e| e.to_string())?;
            e.write_image(img.as_bytes(), w, h, img.color().into())
                .map_err(|e| e.to_string())?;
        } else {
            return Err("Unsupported export format".into());
        }
    }
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Output exists or cannot be created: {e}"))?;
    if let Err(e) = file.write_all(encoded.get_ref()) {
        drop(file);
        let _ = std::fs::remove_file(path);
        return Err(e.to_string());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> crate::StudioState {
        serde_json::from_str(include_str!("../../tests/fixtures/finish-defaults.json")).unwrap()
    }
    fn source() -> Frame {
        Frame {
            w: 4,
            h: 2,
            px: vec![
                -0.1, 0.25, 4., 0.5, 0.1, 0.3, 0.8, 1., 1., 2., 3., 0.2, 0., 0., 0., 1., 0.4, 0.2,
                0.1, 1., 0.2, 0.4, 0.8, 1., 0.5, 0.5, 0.5, 1., 0.1, 0.2, 0.3, 0.,
            ],
        }
    }
    fn output(format: &str, bit_depth: u8) -> Output {
        Output {
            format: format.into(),
            bit_depth,
            quality: 92,
            scale: 100.,
            width: 4,
            height: 2,
            resize: "original".into(),
            filter: "lanczos".into(),
            space: if format == "exr" { "linear" } else { "srgb" }.into(),
            suffix: "_enhanced".into(),
        }
    }
    #[test]
    fn float_identity_preserves_hdr_and_alpha() {
        let f = source();
        let p = apply(f.clone(), &f, &state(), &BTreeMap::new()).unwrap();
        for (a, b) in p.px.iter().zip(f.px.iter()) {
            assert!((a - b).abs() < 0.000002, "{a} != {b}")
        }
        assert!(p.px[2] > 1.);
        assert!(p.px[0] < 0.);
    }
    #[test]
    fn exposure_is_scene_linear_and_masks_keep_outside() {
        let f = source();
        let mut s = state();
        s.finish.as_mut().unwrap().exposure = 1.;
        let p = apply(f.clone(), &f, &s, &BTreeMap::new()).unwrap();
        assert!((p.px[2] - 8.).abs() < 0.00001);
        assert_eq!(p.px[3], 0.5);
        let mask:Mask=serde_json::from_value(serde_json::json!({"id":"test","name":"Test","kind":"rectangle","enabled":true,"invert":false,"operation":"add","opacity":100,"feather":1,"radius":0.04,"hardness":60,"flow":100,"rect":{"x":0.2,"y":0.,"width":0.6,"height":1.},"points":[],"low":0.,"high":1.,"color":[0.5,0.5,0.5],"pass":"","exposure":0.})).unwrap();
        s.finish.as_mut().unwrap().masks = vec![mask];
        s.finish.as_mut().unwrap().masked = true;
        let p = apply(f.clone(), &f, &s, &BTreeMap::new()).unwrap();
        assert_eq!(&p.px[..4], &f.px[..4]);
        assert!(p.px[20] > f.px[20]);
    }
    #[test]
    fn separable_blur_preserves_constants_even_small_images() {
        let f = Frame {
            w: 3,
            h: 2,
            px: vec![0.3; 24],
        };
        for r in [1, 2, 12, 80] {
            assert!(blur(&f, r).px.iter().all(|v| (v - 0.3).abs() < 0.00001));
        }
    }
    #[test]
    fn curves_do_not_clip_hdr_and_are_smooth() {
        let c = vec![
            Point { x: 0., y: 0. },
            Point { x: 0.25, y: 0.15 },
            Point { x: 0.75, y: 0.85 },
            Point { x: 1., y: 1. },
        ];
        assert_eq!(curve(&c, 4.), 4.);
        let v: Vec<_> = (0..100).map(|i| curve(&c, i as f32 / 100.)).collect();
        assert!(v.windows(2).all(|v| v[1] >= v[0]));
        assert!((curve(&c, 0.5) - 0.5).abs() < 0.00001);
    }
    #[test]
    fn crop_rotate_preserves_pixel_order() {
        let f = source();
        let mut a = state().finish.unwrap();
        a.crop = Area {
            x: 0.25,
            y: 0.,
            width: 0.5,
            height: 1.,
        };
        a.rotation = 90.;
        let p = transform(f.clone(), &a);
        assert_eq!((p.w, p.h), (2, 2));
        assert_eq!(&p.px[..4], &f.px[20..24]);
    }
    #[test]
    fn exr_half_float_roundtrip_and_png16_precision() {
        let root = std::env::temp_dir().join(format!("studio-float-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let f = source();
        for bits in [16, 32] {
            let path = root.join(format!("hdr-{bits}.exr"));
            let _ = std::fs::remove_file(&path);
            write(&path, &f, &output("exr", bits)).unwrap();
            let (decoded, info, _) = read(&path, "linear").unwrap();
            assert!(info.hdr);
            assert_eq!(info.bit_depth, bits as u16);
            for (a, b) in f.px.iter().zip(decoded.px.iter()) {
                assert!((a - b).abs() < if bits == 16 { 0.002 } else { 0.000001 });
            }
            assert!(write(&path, &f, &output("exr", bits)).is_err());
            std::fs::remove_file(path).unwrap();
        }
        let ramp = Frame {
            w: 2048,
            h: 1,
            px: (0..2048)
                .flat_map(|i| {
                    let v = i as f32 / 2047.;
                    [v, v, v, 1.]
                })
                .collect(),
        };
        let path = root.join("precision.png");
        let _ = std::fs::remove_file(&path);
        write(&path, &ramp, &output("png", 16)).unwrap();
        let decoded = image::open(&path).unwrap().to_rgba16();
        let unique: std::collections::BTreeSet<_> = decoded.pixels().map(|p| p[0]).collect();
        assert!(unique.len() > 2000);
        assert_eq!(decoded.width(), 2048);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn tagged_export_color_roundtrips() {
        let root = std::env::temp_dir().join(format!("studio-color-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let f = Frame {
            w: 16,
            h: 16,
            px: vec![0.15, 0.25, 0.35, 1.].repeat(256),
        };
        for format in ["png", "tiff", "webp", "jpg"] {
            for space in ["srgb", "p3", "rec709", "linear"] {
                let mut o = output(
                    format,
                    if format == "png" || format == "tiff" {
                        16
                    } else {
                        8
                    },
                );
                o.space = space.into();
                o.quality = 100;
                let path = root.join(format!("{space}.{format}"));
                let _ = std::fs::remove_file(&path);
                write(&path, &f, &o).unwrap();
                let (back, info, _) = read(&path, "auto").unwrap();
                assert!(info.icc, "Missing ICC in {format}/{space}");
                for (a, b) in f.px.iter().zip(back.px.iter()) {
                    assert!((a - b).abs() < 0.018, "{format}/{space}: {a} != {b}");
                }
                std::fs::remove_file(path).unwrap();
            }
        }
        let path = root.join("acescg.exr");
        let _ = std::fs::remove_file(&path);
        let mut o = output("exr", 32);
        o.space = "acescg".into();
        write(&path, &source(), &o).unwrap();
        let (back, info, _) = read(&path, "auto").unwrap();
        assert_eq!(info.space, "acescg");
        for (a, b) in source().px.iter().zip(back.px.iter()) {
            assert!((a - b).abs() < 0.001, "ACEScg: {a} != {b}");
        }
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn mask_strokes_eraser_morphology_and_overlay_match() {
        let f = Frame {
            w: 80,
            h: 40,
            px: vec![0.2, 0.3, 0.4, 1.].repeat(3200),
        };
        let mut s = state();
        let m:Mask=serde_json::from_value(serde_json::json!({"id":"brush","name":"Brush","kind":"brush","enabled":true,"invert":false,"operation":"add","opacity":100,"feather":0,"radius":0.2,"hardness":90,"flow":100,"rect":{"x":0.25,"y":0.25,"width":0.5,"height":0.5},"points":[{"x":0.5,"y":0.5}],"low":0.,"high":1.,"color":[0.5,0.5,0.5],"pass":"","exposure":0.})).unwrap();
        let a = raster_mask(&m, &f, &BTreeMap::new());
        assert_eq!(a[20 * 80 + 40], 1.);
        assert_eq!(a[20 * 80 + 47], a[27 * 80 + 40]);
        let mut erased = m.clone();
        erased.points.push(Point { x: 0.5, y: 0.5 });
        erased.stroke_ops = vec![false, true];
        assert_eq!(raster_mask(&erased, &f, &BTreeMap::new())[20 * 80 + 40], 0.);
        erased.points.push(Point { x: 0.5, y: 0.5 });
        erased.stroke_ops.push(false);
        assert_eq!(raster_mask(&erased, &f, &BTreeMap::new())[20 * 80 + 40], 1.);
        let expanded = morph_mask(&a, 80, 40, 3, true);
        let contracted = morph_mask(&a, 80, 40, 3, false);
        assert!(expanded.iter().sum::<f32>() > a.iter().sum::<f32>());
        assert!(contracted.iter().sum::<f32>() < a.iter().sum::<f32>());
        s.finish.as_mut().unwrap().masks = vec![m];
        s.finish.as_mut().unwrap().masked = true;
        s.finish.as_mut().unwrap().exposure = 1.;
        let out = apply(f.clone(), &f, &s, &BTreeMap::new()).unwrap();
        let overlay = overlay(&f, &s, &BTreeMap::new()).unwrap();
        for (i, p) in out.px.chunks(4).enumerate() {
            let weight = overlay[8 + i * 4 + 3] as f32 / 255.;
            assert!((p[0] - f.px[i * 4] * (1. + weight)).abs() < 0.002);
        }
        let polygon = vec![
            Point { x: 0.1, y: 0.1 },
            Point { x: 0.9, y: 0.1 },
            Point { x: 0.9, y: 0.9 },
            Point { x: 0.1, y: 0.9 },
        ];
        assert_eq!(polygon_weight(&polygon, 0.5, 0.5, 0.), 1.);
        assert_eq!(polygon_weight(&polygon, 0., 0., 0.), 0.);
    }
    #[test]
    fn invalid_depth_and_mask_fail_without_fallback() {
        let f = source();
        let mut s = state();
        s.finish.as_mut().unwrap().dof = 10.;
        assert!(apply(f.clone(), &f, &s, &BTreeMap::new())
            .unwrap_err()
            .contains("depth"));
        s.finish.as_mut().unwrap().dof = 0.;
        s.finish.as_mut().unwrap().masked = true;
        assert!(apply(f.clone(), &f, &s, &BTreeMap::new()).is_err());
    }
    #[test]
    fn multicontent_exr_lists_layers() {
        use exr::prelude::*;
        let path = std::env::temp_dir().join(format!("studio-passes-{}.exr", std::process::id()));
        let beauty = Layer::new(
            (4, 3),
            LayerAttributes::named("Beauty"),
            Encoding::FAST_LOSSLESS,
            SpecificChannels::rgb(|_| (0.5f32, 0.25f32, 2f32)),
        );
        let depth = Layer::new(
            (4, 3),
            LayerAttributes::named("Depth"),
            Encoding::FAST_LOSSLESS,
            SpecificChannels::rgb(|_| (0.7f32, 0.7f32, 0.7f32)),
        );
        Image::empty(ImageAttributes::new(IntegerBounds::from_dimensions((4, 3))))
            .with_layer(beauty)
            .with_layer(depth)
            .write()
            .to_file(&path)
            .unwrap();
        let (f, info, passes) = super::read(&path, "linear").unwrap();
        assert_eq!(f.px[2], 2.);
        assert_eq!(info.passes.len(), 2);
        assert!(passes.keys().any(|s| s.contains("Depth")));
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "Requires RTX GPU and the separately installed neural runtime"]
    fn professional_pipeline_rtx() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let (f, info, passes) = read(&root.join("public/sample-car.png"), "auto").unwrap();
        let mut b = crate::BACKEND.lock().unwrap();
        b.source = f.display();
        b.width = f.w;
        b.height = f.h;
        b.source_id = 9876;
        b.float_source = Some(f.clone());
        b.info = Some(info);
        b.passes = passes;
        b.neural_cache = None;
        let mut s = state();
        s.neural.enabled = true;
        let cold = std::time::Instant::now();
        let first = b.render(&s, 0).unwrap();
        println!("Cold float+NGX: {:?}", cold.elapsed());
        let start = std::time::Instant::now();
        s.finish.as_mut().unwrap().exposure = 0.2;
        s.finish.as_mut().unwrap().clarity = 10.;
        let edited = b.render(&s, 0).unwrap();
        println!("Warm cached neural+float: {:?}", start.elapsed());
        assert!(!b.diagnostics.is_null());
        assert_ne!(f.display(), first.display());
        assert_ne!(first.display(), edited.display());
        let folder = root.join("verification/professional");
        std::fs::create_dir_all(&folder).unwrap();
        for (name, frame) in [
            ("before", f),
            ("neural", first),
            ("finished", edited.clone()),
        ] {
            let path = folder.join(format!("{name}.png"));
            let _ = std::fs::remove_file(&path);
            write(&path, &frame, &output("png", 16)).unwrap();
        }
        let decoded = image::open(folder.join("finished.png")).unwrap().to_rgba8();
        assert_eq!((decoded.width(), decoded.height()), (edited.w, edited.h));
        let mae = decoded
            .as_raw()
            .iter()
            .zip(edited.display())
            .map(|(a, b)| (*a as f32 - b as f32).abs())
            .sum::<f32>()
            / decoded.as_raw().len() as f32;
        assert!(mae <= 1., "Preview/export mean error {mae}");
        println!("NGX diagnostics: {}", b.diagnostics);
        b.worker = None;
    }
}
