use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Controls {
    pub enabled: bool,
    pub style: String,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Key {
    pub root: PathBuf,
    pub style: String,
    pub intensity: f32,
    pub tone: f32,
    pub structure: f32,
}
pub fn config_path() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("DLSS Image Studio")
        .join("neural-runtime.txt")
}
pub fn configured_root() -> Option<PathBuf> {
    std::env::var_os("STUDIO_NEURAL_RUNTIME")
        .map(PathBuf::from)
        .or_else(|| {
            std::fs::read_to_string(config_path())
                .ok()
                .map(|s| PathBuf::from(s.trim()))
        })
}
pub fn interpreter(root: &Path) -> Result<PathBuf, String> {
    for file in [
        "src/neural_rendering/image/__init__.py",
        "bin/runtime/dlssnr/neuroframe_engine_neural_rendering.dll",
        "bin/runtime/dlssnr/neuroframe_caller.dll",
        "bin/runtime/dlssnr/nvngx_dlssnr.dll",
    ] {
        if !root.join(file).is_file() {
            return Err(format!("Neural runtime incomplete: missing {file}. Select the extracted Visual Enhancer v13.2 folder in Settings."));
        }
    }
    // This adapter targets the verified v13.2 distribution, not arbitrary system Python.
    let python = root.join("bin/python-3.14.7-embed-amd64/python.exe");
    if !python.is_file() {
        return Err("Visual Enhancer v13.2 embedded Python is missing.".into());
    }
    Ok(python)
}
pub fn validate_status(value: &serde_json::Value) -> Result<(), String> {
    let status = &value["bridge_status"];
    if status["feature_evaluations"].as_u64().unwrap_or(0) == 0
        || status["ngx"]["create_result"] != "0x00000001"
        || status["ngx"]["evaluate_result"] != "0x00000001"
    {
        return Err("Neural runtime did not report a successful NGX feature evaluation. No substitute was applied.".into());
    }
    Ok(())
}
struct Job(PathBuf);
impl Drop for Job {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub fn render(
    key: &Key,
    source: &[u8],
    width: u32,
    height: u32,
) -> Result<(Vec<u8>, serde_json::Value), String> {
    let python = interpreter(&key.root)?;
    let root = key.root.canonicalize().map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let job =
        Job(std::env::temp_dir().join(format!("studio-neural-{}-{stamp}", std::process::id())));
    std::fs::create_dir(&job.0).map_err(|e| e.to_string())?;
    let io = |e: std::io::Error| format!("Neural runtime I/O failed: {e}");
    std::fs::write(job.0.join("adapter.py"), include_str!("neural_adapter.py")).map_err(io)?;
    std::fs::write(
        job.0.join("request.json"),
        serde_json::to_vec(key).map_err(|e| e.to_string())?,
    )
    .map_err(io)?;
    // Edge-pad small/odd images for the provider; crop back without resampling.
    let pw = width.max(64).next_multiple_of(2);
    let ph = height.max(64).next_multiple_of(2);
    let padded = image::RgbaImage::from_fn(pw, ph, |x, y| {
        let i = (y.min(height - 1) as usize * width as usize + x.min(width - 1) as usize) * 4;
        image::Rgba(source[i..i + 4].try_into().unwrap())
    });
    padded
        .save(job.0.join("input.png"))
        .map_err(|e| e.to_string())?;
    let stderr = std::fs::File::create(job.0.join("stderr.txt")).map_err(io)?;
    let mut command = Command::new(python);
    command
        .arg(job.0.join("adapter.py"))
        .arg(&root)
        .arg(&job.0)
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(stderr);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start neural runtime: {e}"))?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    let error =
                        std::fs::read_to_string(job.0.join("stderr.txt")).unwrap_or_default();
                    return Err(format!(
                        "Neural evaluation failed ({status}): {}",
                        error
                            .chars()
                            .rev()
                            .take(1600)
                            .collect::<String>()
                            .chars()
                            .rev()
                            .collect::<String>()
                    ));
                }
                break;
            }
            Ok(None) if start.elapsed() < Duration::from_secs(120) => {
                std::thread::sleep(Duration::from_millis(50))
            }
            other => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Neural runtime timed out or could not be monitored: {other:?}"
                ));
            }
        }
    }
    let result: serde_json::Value =
        serde_json::from_slice(&std::fs::read(job.0.join("result.json")).map_err(io)?)
            .map_err(|e| format!("Invalid neural diagnostics: {e}"))?;
    validate_status(&result)?;
    let path = PathBuf::from(
        result["output_path"]
            .as_str()
            .ok_or("Missing neural output")?,
    )
    .canonicalize()
    .map_err(io)?;
    if !path.starts_with(job.0.canonicalize().map_err(io)?) {
        return Err("Runtime output escaped the processing directory".into());
    }
    let output = image::open(path).map_err(|e| e.to_string())?.to_rgba8();
    if output.dimensions() != (pw, ph) {
        return Err("Neural runtime returned unexpected dimensions".into());
    }
    let mut cropped = image::imageops::crop_imm(&output, 0, 0, width, height)
        .to_image()
        .into_raw();
    for (out, original) in cropped.chunks_exact_mut(4).zip(source.chunks_exact(4)) {
        out[3] = original[3];
    }
    Ok((cropped, result["bridge_status"].clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requires_positive_neural_evidence() {
        let mut result = serde_json::json!({"bridge_status":{"feature_evaluations":1,"ngx":{"create_result":"0x00000001","evaluate_result":"0x00000001"}}});
        assert!(validate_status(&result).is_ok());
        result["bridge_status"]["feature_evaluations"] = 0.into();
        assert!(validate_status(&result).is_err());
        assert!(validate_status(&serde_json::json!({"ok":true})).is_err());
    }
    #[test]
    fn missing_runtime_is_an_error() {
        assert!(interpreter(Path::new("Z:/missing-studio-runtime")).is_err());
    }
}
