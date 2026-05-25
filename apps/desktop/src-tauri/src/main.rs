#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ==========================================================================
// 3. Application Launcher
// ==========================================================================

#[tauri::command]
fn save_rich_project(path: String, json_content: String) -> Result<(), String> {
    std::fs::write(path, json_content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_rich_project(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_open_file_path() -> Result<Option<String>, String> {
    let script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Slopeffect Project (*.slopeproj)|*.slopeproj'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileName }";
    let output = std::process::Command::new("powershell")
        .args(&["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

#[tauri::command]
fn pick_save_file_path() -> Result<Option<String>, String> {
    let script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.SaveFileDialog; $f.Filter = 'Slopeffect Project (*.slopeproj)|*.slopeproj'; $f.FileName = 'Untitled.slopeproj'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileName }";
    let output = std::process::Command::new("powershell")
        .args(&["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

#[tauri::command]
fn pick_export_directory() -> Result<Option<String>, String> {
    let script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath }";
    let output = std::process::Command::new("powershell")
        .args(&["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

#[tauri::command]
fn probe_media_file(path: String) -> Result<slopeffect_media::MediaMetadata, String> {
    slopeffect_media::probe_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_media_thumbnail(path: String) -> Result<String, String> {
    let manager = slopeffect_media::CacheManager::new().map_err(|e| e.to_string())?;
    let cached = manager.generate_thumbnail(path).map_err(|e| e.to_string())?;
    Ok(cached.to_string_lossy().into_owned())
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ExportProgressPayload {
    pub job_id: String,
    pub progress: f64,    // 0.0 to 100.0
    pub status: String,   // "ready", "running", "completed", "failed"
    pub error: Option<String>,
}

#[tauri::command]
fn start_export_project(
    _project_json: String,
    _export_path: String,
    _preset: String,
) -> Result<String, String> {
    Err("Export backend is not implemented yet. The project exporter is under construction.".to_string())
}

#[tauri::command]
fn cancel_export(
    _job_id: String,
) -> Result<(), String> {
    Err("No active export job exists to cancel.".to_string())
}

#[tauri::command]
fn pick_media_file() -> Result<Option<String>, String> {
    let script = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Media Files (*.mp4;*.avi;*.mov;*.mp3;*.wav;*.svg)|*.mp4;*.avi;*.mov;*.mp3;*.wav;*.svg|All Files (*.*)|*.*'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileName }";
    let output = std::process::Command::new("powershell")
        .args(&["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            probe_media_file,
            get_media_thumbnail,
            save_rich_project,
            load_rich_project,
            pick_open_file_path,
            pick_save_file_path,
            pick_export_directory,
            start_export_project,
            cancel_export,
            pick_media_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

