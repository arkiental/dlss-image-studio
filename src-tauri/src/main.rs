#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Deserialize;
use std::{
    borrow::Cow,
    ffi::{c_char, CStr},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::Manager;
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Params {
    contrast: f32,
    gamma: f32,
    vibrance: f32,
    brightness: f32,
    saturation: f32,
    hue: f32,
    intensity: f32,
    tone: f32,
    structure: f32,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    whole_image: f32,
}
extern "C" {
    fn studio_initialize() -> i32;
    fn studio_capabilities() -> *const c_char;
    fn studio_error() -> *const c_char;
    fn studio_load(data: *const u8, w: u32, h: u32) -> i32;
    fn studio_process(p: *const Params, out: *mut u8, size: u64) -> i32;
    fn studio_shutdown();
}
struct Backend {
    width: u32,
    height: u32,
    initialized: bool,
}
static BACKEND: Mutex<Backend> = Mutex::new(Backend {
    width: 0,
    height: 0,
    initialized: false,
});
static REQUEST: AtomicU64 = AtomicU64::new(0);
static SOURCE_REQUEST: AtomicU64 = AtomicU64::new(0);
fn native_error() -> String {
    unsafe {
        CStr::from_ptr(studio_error())
            .to_string_lossy()
            .into_owned()
    }
}
fn app_log(message: &str) {
    use std::io::Write;
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let folder = PathBuf::from(local).join("DLSS Image Studio").join("logs");
        let _ = std::fs::create_dir_all(&folder);
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(folder.join("studio.log"))
        {
            let _ = writeln!(file, "{message}");
        }
    }
}
impl Backend {
    fn init(&mut self) -> Result<(), String> {
        if !self.initialized {
            if unsafe { studio_initialize() } != 0 {
                return Err(native_error());
            }
            self.initialized = true;
        }
        Ok(())
    }
    fn process(&mut self, s: &StudioState) -> Result<Vec<u8>, String> {
        self.init()?;
        if self.width == 0 {
            return Err("Open an image first.".into());
        }
        let p = s.params()?;
        let mut bytes = vec![0; self.width as usize * self.height as usize * 4];
        if unsafe { studio_process(&p, bytes.as_mut_ptr(), bytes.len() as u64) } != 0 {
            return Err(native_error());
        }
        Ok(bytes)
    }
}
#[derive(Clone, Deserialize)]
struct Rect {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}
#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
enum AdjustmentScope {
    Image,
    #[default]
    Region,
}
#[derive(Clone, Deserialize)]
struct Local {
    #[serde(default)]
    scope: AdjustmentScope,
    intensity: f32,
    tone: f32,
    structure: f32,
    region: Rect,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StudioState {
    style: String,
    processing_resolution: f32,
    contrast: f32,
    gamma: f32,
    vibrance: f32,
    brightness: f32,
    saturation: f32,
    hue: f32,
    local: Local,
}
fn bounded(v: f32, min: f32, max: f32) -> Result<f32, String> {
    if v.is_finite() && v >= min && v <= max {
        Ok(v)
    } else {
        Err("Adjustment outside its supported range.".into())
    }
}
impl StudioState {
    fn params(&self) -> Result<Params, String> {
        if !["neutral", "cinematic", "natural"].contains(&self.style.as_str()) {
            return Err("Unknown style".into());
        }
        bounded(self.processing_resolution, 1., 100.)?;
        let r = &self.local.region;
        let p = Params {
            contrast: bounded(self.contrast, -100., 100.)?,
            gamma: bounded(self.gamma, -100., 100.)?,
            vibrance: bounded(self.vibrance, -100., 100.)?,
            brightness: bounded(self.brightness, -100., 100.)?,
            saturation: bounded(self.saturation, -100., 100.)?,
            hue: bounded(self.hue, -180., 180.)?,
            intensity: bounded(self.local.intensity, 0., 2.6)?,
            tone: bounded(self.local.tone, -1., 1.)?,
            structure: bounded(self.local.structure, 0., 1.6)?,
            x: bounded(r.x, 0., 1.)?,
            y: bounded(r.y, 0., 1.)?,
            width: bounded(r.width, 0.00001, 1.)?,
            height: bounded(r.height, 0.00001, 1.)?,
            whole_image: if matches!(self.local.scope, AdjustmentScope::Image) { 1. } else { 0. },
        };
        if p.x + p.width > 1.00001 || p.y + p.height > 1.00001 {
            return Err("Local region is outside the image".into());
        }
        Ok(p)
    }
    fn preset(&mut self, style: &str) {
        self.style = style.into();
        let p = match style {
            "cinematic" => [16., -5., 8., -3., -8., -3.],
            "natural" => [4., 2., 14., 2., 3., 0.],
            _ => [0.; 6],
        };
        [
            self.contrast,
            self.gamma,
            self.vibrance,
            self.brightness,
            self.saturation,
            self.hue,
        ] = p;
    }
}
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| "Background processing failed.".to_string())?
}
#[tauri::command]
async fn capabilities() -> Result<serde_json::Value, String> {
    blocking(||{let mut b=BACKEND.lock().map_err(|_|"Backend lock failed")?;if let Err(e)=b.init(){return Ok(serde_json::json!({"gpu":"Unavailable","driver":"Unknown","vram_mb":0,"d3d12":false,"streamline":"Not initialized","neural_rendering":"Unavailable","detail":e}));}serde_json::from_str(unsafe{CStr::from_ptr(studio_capabilities())}.to_str().map_err(|_|"Invalid native diagnostics")?).map_err(|e|e.to_string())}).await
}
#[tauri::command]
async fn load_source(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let header = |name: &str| -> Result<u64, String> {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .ok_or_else(|| format!("Missing or invalid image header: {name}"))
    };
    let width = u32::try_from(header("x-image-width")?).map_err(|_| "Invalid image width")?;
    let height = u32::try_from(header("x-image-height")?).map_err(|_| "Invalid image height")?;
    let source_id = header("x-source-id")?;
    let rgba = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Expected binary RGBA pixels".into()),
    };
    SOURCE_REQUEST.fetch_max(source_id, Ordering::SeqCst);
    REQUEST.fetch_add(1, Ordering::SeqCst);
    blocking(move || {
        if width == 0
            || height == 0
            || width > 16384
            || height > 16384
            || width as u64 * height as u64 > 64_000_000
            || rgba.len() as u64 != width as u64 * height as u64 * 4
        {
            return Err("Invalid image dimensions or pixel data".into());
        }
        let mut b = BACKEND.lock().map_err(|_| "Backend lock failed")?;
        if SOURCE_REQUEST.load(Ordering::SeqCst) != source_id {
            return Err("Superseded source".into());
        }
        b.init()?;
        if unsafe { studio_load(rgba.as_ptr(), width, height) } != 0 {
            return Err(native_error());
        }
        b.width = width;
        b.height = height;
        Ok(())
    })
    .await
}
#[tauri::command]
async fn process_image(state: StudioState) -> Result<tauri::ipc::Response, String> {
    let id = REQUEST.fetch_add(1, Ordering::SeqCst) + 1;
    blocking(move || {
        let mut b = BACKEND.lock().map_err(|_| "Backend lock failed")?;
        if REQUEST.load(Ordering::SeqCst) != id {
            return Err("Superseded preview".into());
        }
        b.process(&state).map(tauri::ipc::Response::new)
    })
    .await
}
fn format(path: &Path) -> Result<image::ImageFormat, String> {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Ok(image::ImageFormat::Png),
        "jpg" | "jpeg" => Ok(image::ImageFormat::Jpeg),
        "tif" | "tiff" => Ok(image::ImageFormat::Tiff),
        _ => Err("Choose PNG, JPEG or TIFF.".into()),
    }
}
fn write_image(path: &Path, bytes: Vec<u8>, w: u32, h: u32) -> Result<(), String> {
    if !path.is_absolute() || !path.parent().is_some_and(Path::is_dir) {
        return Err("Choose an existing absolute output location.".into());
    }
    let fmt = format(path)?;
    let rgba = image::RgbaImage::from_raw(w, h, bytes).ok_or("Invalid output buffer")?;
    let img = image::DynamicImage::ImageRgba8(rgba);
    let img = if fmt == image::ImageFormat::Jpeg {
        image::DynamicImage::ImageRgb8(img.to_rgb8())
    } else {
        img
    };
    let mut encoded = std::io::Cursor::new(Vec::new());
    img.write_to(&mut encoded, fmt)
        .map_err(|e| format!("Image encoding failed: {e}"))?;
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("Cannot create output (existing files are never overwritten): {e}"))?;
    if let Err(e) = f.write_all(encoded.get_ref()) {
        drop(f);
        let _ = std::fs::remove_file(path);
        return Err(format!("Export failed: {e}"));
    }
    app_log(&format!(
        "[EXPORT] Saved {w}x{h} {fmt:?}; original dimensions retained"
    ));
    Ok(())
}
#[tauri::command]
async fn export_image(
    app: tauri::AppHandle,
    path: PathBuf,
    state: StudioState,
) -> Result<(), String> {
    if !app.asset_protocol_scope().is_allowed(&path) {
        return Err("Choose the output using the save dialog.".into());
    }
    blocking(move || {
        let mut b = BACKEND.lock().map_err(|_| "Backend lock failed")?;
        let bytes = b.process(&state)?;
        write_image(&path, bytes, b.width, b.height)
    })
    .await
}
#[tauri::command]
async fn copy_image(state: StudioState) -> Result<(), String> {
    blocking(move || {
        let mut b = BACKEND.lock().map_err(|_| "Backend lock failed")?;
        let bytes = b.process(&state)?;
        arboard::Clipboard::new()
            .and_then(|mut c| {
                c.set_image(arboard::ImageData {
                    width: b.width as usize,
                    height: b.height as usize,
                    bytes: Cow::Owned(bytes),
                })
            })
            .map_err(|e| format!("Clipboard unavailable: {e}"))?;
        app_log(&format!(
            "[EXPORT] Copied {}x{} RGBA to Windows clipboard",
            b.width, b.height
        ));
        Ok(())
    })
    .await
}
fn filename(stem: &str, style: &str) -> String {
    let clean: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(120)
        .collect();
    let clean = clean.trim_end_matches(['.', ' ']);
    format!(
        "{}-{style}.png",
        if clean.is_empty() { "image" } else { clean }
    )
}
#[tauri::command]
async fn export_presets(
    app: tauri::AppHandle,
    folder: PathBuf,
    stem: String,
    mut state: StudioState,
) -> Result<Vec<String>, String> {
    if !app.asset_protocol_scope().is_allowed(&folder) {
        return Err("Choose the output folder using the dialog.".into());
    }
    blocking(move||{if !folder.is_absolute()||!folder.is_dir(){return Err("Choose an existing export folder".into());}let styles=["cinematic","neutral","natural"];let paths:Vec<_>=styles.iter().map(|s|folder.join(filename(&stem,s))).collect();if paths.iter().any(|p|p.exists()){return Err("A preset output already exists. Choose an empty folder or rename the existing files.".into());}let mut b=BACKEND.lock().map_err(|_|"Backend lock failed")?;let mut done=Vec::new();for(style,path)in styles.iter().zip(paths.iter()){state.preset(style);let bytes=b.process(&state)?;write_image(path,bytes,b.width,b.height)?;done.push(path.to_string_lossy().into_owned());}Ok(done)}).await
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            capabilities,
            load_source,
            process_image,
            export_image,
            copy_image,
            export_presets
        ])
        .build(tauri::generate_context!())
        .expect("Unable to initialize application")
        .run(|_, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(_guard) = BACKEND.lock() {
                    unsafe { studio_shutdown() };
                }
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_adjustment_scope_and_rejects_unknown_values() {
        let mut value = serde_json::json!({
            "style":"neutral", "processingResolution":100,
            "contrast":0,"gamma":0,"vibrance":0,"brightness":0,"saturation":0,"hue":0,
            "local":{"intensity":1.3,"tone":0.5,"structure":0.8,
                "region":{"x":0.1,"y":0.2,"width":0.2,"height":0.3}}
        });
        let legacy: StudioState = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(legacy.params().unwrap().whole_image, 0.);
        value["local"]["scope"] = "image".into();
        let whole: StudioState = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(whole.params().unwrap().whole_image, 1.);
        value["local"]["scope"] = "region".into();
        let local: StudioState = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(local.params().unwrap().whole_image, 0.);
        value["local"]["scope"] = "invalid".into();
        assert!(serde_json::from_value::<StudioState>(value).is_err());
        assert_eq!(std::mem::size_of::<Params>(), 56);
    }
    #[test]
    fn export_names() {
        assert_eq!(filename("car:front", "neutral"), "car_front-neutral.png");
        assert_eq!(filename("..", "natural"), "image-natural.png");
    }
    #[test]
    fn validates_ranges() {
        assert!(bounded(f32::NAN, 0., 1.).is_err());
        assert!(bounded(101., -100., 100.).is_err());
        assert_eq!(bounded(1., 0., 1.).unwrap(), 1.);
    }
    #[test]
    fn unsupported_formats() {
        assert!(format(Path::new("photo.exe")).is_err());
        assert_eq!(
            format(Path::new("photo.PNG")).unwrap(),
            image::ImageFormat::Png
        );
    }
    #[test]
    fn encodes_original_dimensions_and_refuses_overwrite() {
        let folder =
            std::env::temp_dir().join(format!("studio-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        for extension in ["png", "jpg", "tiff"] {
            let path = folder.join(format!("result.{extension}"));
            let bytes = vec![180u8; 17 * 9 * 4];
            write_image(&path, bytes.clone(), 17, 9).unwrap();
            let decoded = image::open(&path).unwrap();
            assert_eq!((decoded.width(), decoded.height()), (17, 9));
            assert!(write_image(&path, bytes, 17, 9).is_err());
            std::fs::remove_file(path).unwrap();
        }
        std::fs::remove_dir(folder).unwrap();
    }
}
