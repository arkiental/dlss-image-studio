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
    pub resolution: f32,
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

type Reply = Result<(Vec<u8>, serde_json::Value), String>;
type Request = (serde_json::Value, Option<Vec<u8>>);
pub struct Worker {
    root: PathBuf,
    dimensions: (u32, u32),
    child: std::process::Child,
    sender: std::sync::mpsc::Sender<Request>,
    replies: std::sync::mpsc::Receiver<Reply>,
    source: Option<(u64, u32, u32)>,
    thread: Option<std::thread::JoinHandle<()>>,
    _job: Job,
}
impl Drop for Worker {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        // Replacing the sender closes the thread's request stream.
        let (dummy, _) = std::sync::mpsc::channel();
        self.sender = dummy;
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
impl Worker {
    fn start(root: &Path, dimensions: (u32, u32)) -> Result<Self, String> {
        use std::io::{BufRead, Read, Write};
        let python = interpreter(root)?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let job =
            Job(std::env::temp_dir().join(format!("studio-neural-{}-{stamp}", std::process::id())));
        std::fs::create_dir(&job.0).map_err(|e| e.to_string())?;
        std::fs::write(job.0.join("adapter.py"), include_str!("neural_adapter.py"))
            .map_err(|e| e.to_string())?;
        let mut command = Command::new(python);
        command
            .arg("-u")
            .arg(job.0.join("adapter.py"))
            .arg(root)
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(std::fs::File::create(job.0.join("stderr.txt")).map_err(|e| e.to_string())?);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Cannot start neural runtime: {e}"))?;
        let mut input = child.stdin.take().ok_or("Missing neural input pipe")?;
        let mut output =
            std::io::BufReader::new(child.stdout.take().ok_or("Missing neural output pipe")?);
        let (sender, requests) = std::sync::mpsc::channel::<Request>();
        let (results, replies) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            for (request, pixels) in requests {
                let response = (|| -> Reply {
                    serde_json::to_writer(&mut input, &request).map_err(|e| e.to_string())?;
                    input.write_all(b"\n").map_err(|e| e.to_string())?;
                    if let Some(bytes) = pixels {
                        input.write_all(&bytes).map_err(|e| e.to_string())?;
                    }
                    input.flush().map_err(|e| e.to_string())?;
                    let mut line = String::new();
                    output
                        .by_ref()
                        .take(65536)
                        .read_line(&mut line)
                        .map_err(|e| e.to_string())?;
                    let value: serde_json::Value = serde_json::from_str(&line).map_err(|e| {
                        format!("Neural runtime stopped or returned invalid diagnostics: {e}")
                    })?;
                    if let Some(error) = value["error"].as_str() {
                        return Err(format!("Neural evaluation failed: {error}"));
                    }
                    validate_status(&value)?;
                    let expected = request["width"].as_u64().unwrap_or(0)
                        * request["height"].as_u64().unwrap_or(0)
                        * 4;
                    if expected == 0
                        || expected > 256_000_000
                        || value["bytes"].as_u64() != Some(expected)
                    {
                        return Err("Unexpected neural output size".into());
                    }
                    let mut bytes = vec![0; expected as usize];
                    output.read_exact(&mut bytes).map_err(|e| e.to_string())?;
                    Ok((bytes, value["bridge_status"].clone()))
                })();
                let failed = response.is_err();
                if results.send(response).is_err() || failed {
                    break;
                }
            }
        });
        Ok(Self {
            root: root.to_path_buf(),
            dimensions,
            child,
            sender,
            replies,
            source: None,
            thread: Some(thread),
            _job: job,
        })
    }
}
pub fn render(
    worker: &mut Option<Worker>,
    key: &Key,
    source: &[u8],
    width: u32,
    height: u32,
    source_id: u64,
) -> Reply {
    interpreter(&key.root)?;
    let sw = ((width as f32 * key.resolution / 100.).round() as u32).max(1);
    let sh = ((height as f32 * key.resolution / 100.).round() as u32).max(1);
    let dimensions = (
        sw.max(128).next_multiple_of(2),
        sh.max(128).next_multiple_of(2),
    );
    if worker.as_ref().map(|w| (&w.root, w.dimensions)) != Some((&key.root, dimensions)) {
        *worker = None;
        *worker = Some(Worker::start(&key.root, dimensions)?);
    }
    let start = Instant::now();
    let current = worker.as_mut().unwrap();
    let identity = (source_id, width, height);
    let send_source = current.source != Some(identity);
    let request = serde_json::json!({"controls":key,"width":width,"height":height,"small_width":sw,"small_height":sh,"source_bytes":if send_source {source.len()} else {0}});
    let result = current
        .sender
        .send((
            request,
            if send_source {
                Some(source.to_vec())
            } else {
                None
            },
        ))
        .map_err(|_| "Neural worker stopped".to_string())
        .and_then(|_| {
            current
                .replies
                .recv_timeout(Duration::from_secs(120))
                .map_err(|e| format!("Neural worker timeout or disconnect: {e}"))
        })
        .and_then(|result| result);
    match result {
        Ok((bytes, mut status)) => {
            current.source = Some(identity);
            status["round_trip_ms"] = (start.elapsed().as_secs_f64() * 1000.).into();
            Ok((bytes, status))
        }
        Err(error) => {
            *worker = None;
            Err(error)
        }
    }
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
