use std::path::PathBuf;
use tauri::Manager;
fn check(app: &tauri::AppHandle, path: &PathBuf) -> Result<(), String> {
    if !path.is_absolute() || !app.asset_protocol_scope().is_allowed(path) {
        Err("Select the file in the native dialog".into())
    } else {
        Ok(())
    }
}
fn recent_path() -> PathBuf {
    crate::neural::config_path().with_file_name("recent-projects.json")
}
#[tauri::command]
pub fn recent_projects() -> Vec<String> {
    std::fs::read(recent_path())
        .ok()
        .and_then(|s| serde_json::from_slice(&s).ok())
        .unwrap_or_default()
}
fn remember(path: &PathBuf) {
    let p = path.to_string_lossy().to_string();
    let mut all = recent_projects();
    all.retain(|s| s != &p);
    all.insert(0, p);
    all.truncate(8);
    let cfg = recent_path();
    let _ = std::fs::create_dir_all(cfg.parent().unwrap());
    if let Ok(data) = serde_json::to_vec(&all) {
        let _ = std::fs::write(cfg, data);
    }
}
fn validate(value: &serde_json::Value) -> Result<(), String> {
    if value["version"] != 1 || !value["sourcePath"].is_string() {
        return Err("Unsupported Studio project".into());
    }
    fn state(v: &serde_json::Value) -> Result<(), String> {
        let s: crate::StudioState = serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
        s.params()?;
        if let Some(f) = s.finish {
            f.validate()?;
        }
        Ok(())
    }
    state(&value["state"])?;
    for (field, limit) in [("snapshots", 64), ("history", 100), ("presets", 100)] {
        if let Some(list) = value[field].as_array() {
            if list.len() > limit {
                return Err(format!("Too many {field}"));
            }
            for entry in list {
                state(&entry["state"])?;
            }
        }
    }
    if value["passes"].as_array().is_some_and(|v| v.len() > 64) {
        return Err("Maximum 64 render passes".into());
    }
    if let Some(space) = value["inputSpace"].as_str() {
        if !["auto", "srgb", "linear", "acescg", "rec709", "p3"].contains(&space) {
            return Err("Unsupported project input space".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn read_project(app: tauri::AppHandle, path: PathBuf) -> Result<String, String> {
    if !app.asset_protocol_scope().is_allowed(&path)
        && recent_projects().contains(&path.to_string_lossy().to_string())
    {
        app.asset_protocol_scope()
            .allow_file(&path)
            .map_err(|e| e.to_string())?;
    }
    check(&app, &path)?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.len() > 10_000_000 {
        return Err("Project exceeds 10 MB".into());
    }
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    validate(&v)?;
    for p in std::iter::once(v["sourcePath"].as_str()).chain(
        v["passes"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|p| p["path"].as_str()),
    ) {
        if let Some(p) = p {
            let path = PathBuf::from(p);
            if !path.is_absolute() {
                return Err("Project media paths must be absolute".into());
            }
            app.asset_protocol_scope()
                .allow_file(path)
                .map_err(|e| e.to_string())?;
        }
    }
    remember(&path);
    Ok(text)
}
#[tauri::command]
pub async fn write_project(
    app: tauri::AppHandle,
    path: PathBuf,
    content: String,
) -> Result<(), String> {
    check(&app, &path)?;
    if path.extension().and_then(|s| s.to_str()) != Some("dlssproj") {
        return Err("Use .dlssproj for Studio projects".into());
    }
    if content.len() > 10_000_000 {
        return Err("Project exceeds 10 MB".into());
    }
    let v = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    validate(&v)?;
    save_with_backup(&path, &content)?;
    remember(&path);
    Ok(())
}
fn save_with_backup(path: &PathBuf, content: &str) -> Result<(), String> {
    let temp = path.with_extension("dlssproj.tmp");
    std::fs::write(&temp, content).map_err(|e| e.to_string())?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("dlssproj.bak")).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_validation_includes_history_and_masks() {
        let state: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/finish-defaults.json"))
                .unwrap();
        let mut value = serde_json::json!({"version":1,"sourcePath":"D:/image.exr","state":state,"history":[{"state":state}],"passes":[]});
        validate(&value).unwrap();
        value["history"][0]["state"]["finish"]["exposure"] = serde_json::json!(999);
        assert!(validate(&value).is_err());
    }
    #[test]
    fn saving_twice_retains_a_recoverable_project() {
        let root = std::env::temp_dir().join(format!("studio-project-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("test.dlssproj");
        save_with_backup(&path, "first").unwrap();
        save_with_backup(&path, "second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
        assert_eq!(
            std::fs::read_to_string(path.with_extension("dlssproj.bak")).unwrap(),
            "first"
        );
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_file(path.with_extension("dlssproj.bak")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
#[tauri::command]
pub async fn read_presets(app: tauri::AppHandle, path: PathBuf) -> Result<String, String> {
    check(&app, &path)?;
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if text.len() > 5_000_000 {
        return Err("Preset file too large".into());
    }
    Ok(text)
}
#[tauri::command]
pub async fn write_presets(
    app: tauri::AppHandle,
    path: PathBuf,
    content: String,
) -> Result<(), String> {
    check(&app, &path)?;
    if path.extension().and_then(|s| s.to_str()) != Some("dlsspresets") {
        return Err("Use .dlsspresets".into());
    }
    use std::io::Write;
    std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .and_then(|mut f| f.write_all(content.as_bytes()))
        .map_err(|e| e.to_string())
}
