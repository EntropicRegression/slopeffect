#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use uuid::Uuid;
use slopeffect_core::{TransformState, Scene};
use slopeffect_project::{
    CommandHistory, save_project, load_project, ProjectDocument,
    UpdateTransformCommand, AddSceneCommand, EditorCommand
};

// ==========================================================================
// 1. Thread-safe Shared Application State
// ==========================================================================

pub struct AppState {
    pub current_document: Mutex<Option<ProjectDocument>>,
    pub history: Mutex<CommandHistory>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            current_document: Mutex::new(None),
            history: Mutex::new(CommandHistory::new()),
        }
    }
}

// ==========================================================================
// 2. Tauri Command Endpoints (IPC Bridge)
// ==========================================================================

#[tauri::command]
fn create_project(state: tauri::State<'_, AppState>) -> Result<ProjectDocument, String> {
    let mut doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    let mut hist_lock = state.history.lock().map_err(|e| e.to_string())?;
    
    // Create a default scene
    let default_scene = Scene::new("Scene 1", 1920, 1080);
    let default_scene_id = default_scene.id;
    
    let new_doc = ProjectDocument {
        id: Uuid::new_v4(),
        schema_version: 1,
        name: "Untitled.slopeproj".to_string(),
        assets: Vec::new(),
        current_scene_id: default_scene_id,
        scenes: vec![default_scene],
    };
    
    *doc_lock = Some(new_doc.clone());
    *hist_lock = CommandHistory::new(); // Reset history on new project
    
    Ok(new_doc)
}

#[tauri::command]
fn open_project(state: tauri::State<'_, AppState>, path: String) -> Result<ProjectDocument, String> {
    let mut doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    let mut hist_lock = state.history.lock().map_err(|e| e.to_string())?;
    
    let loaded_doc = load_project(path).map_err(|e| e.to_string())?;
    *doc_lock = Some(loaded_doc.clone());
    *hist_lock = CommandHistory::new(); // Reset history on load
    
    Ok(loaded_doc)
}

#[tauri::command]
fn save_project_to_path(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    let doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    if let Some(ref doc) = *doc_lock {
        save_project(doc, path).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("No active project document to save".to_string())
    }
}

/// 新增場景指令 (Scene creation with custom dimensions)
#[tauri::command]
fn add_scene(
    state: tauri::State<'_, AppState>,
    name: String,
    width: u32,
    height: u32,
) -> Result<ProjectDocument, String> {
    let mut doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    let mut hist_lock = state.history.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut doc) = *doc_lock {
        let cmd = AddSceneCommand { name, width, height };
        hist_lock.execute(doc, Box::new(cmd)).map_err(|e| e.to_string())?;
        Ok(doc.clone())
    } else {
        Err("No active project document to add scene to".to_string())
    }
}

/// 泛用 Command 執行接口
#[tauri::command]
fn execute_editor_command(
    state: tauri::State<'_, AppState>,
    command_type: String,
    payload: serde_json::Value,
) -> Result<ProjectDocument, String> {
    let mut doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    let mut hist_lock = state.history.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut doc) = *doc_lock {
        if command_type == "layer.update_transform" {
            let clip_id_str = payload.get("clipId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing clipId payload".to_string())?;
            let clip_id = Uuid::parse_str(clip_id_str).map_err(|e| e.to_string())?;
            
            let transform_json = payload.get("transform")
                .ok_or_else(|| "Missing transform payload".to_string())?;
            let next_transform: TransformState = serde_json::from_value(transform_json.clone())
                .map_err(|e| e.to_string())?;
                
            let cmd = UpdateTransformCommand {
                clip_id,
                next_transform,
            };
            
            hist_lock.execute(doc, Box::new(cmd)).map_err(|e| e.to_string())?;
            Ok(doc.clone())
        } else {
            Err(format!("Unsupported editor command: {}", command_type))
        }
    } else {
        Err("No active project document to execute commands on".to_string())
    }
}

#[tauri::command]
fn undo_action(state: tauri::State<'_, AppState>) -> Result<Option<ProjectDocument>, String> {
    let mut doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    let mut hist_lock = state.history.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut doc) = *doc_lock {
        let success = hist_lock.undo(doc).map_err(|e| e.to_string())?;
        if success {
            Ok(Some(doc.clone()))
        } else {
            Ok(None)
        }
    } else {
        Err("No active project document to undo".to_string())
    }
}

#[tauri::command]
fn redo_action(state: tauri::State<'_, AppState>) -> Result<Option<ProjectDocument>, String> {
    let mut doc_lock = state.current_document.lock().map_err(|e| e.to_string())?;
    let mut hist_lock = state.history.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut doc) = *doc_lock {
        let success = hist_lock.redo(doc).map_err(|e| e.to_string())?;
        if success {
            Ok(Some(doc.clone()))
        } else {
            Ok(None)
        }
    } else {
        Err("No active project document to redo".to_string())
    }
}

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
fn probe_media_file(path: String) -> Result<slopeffect_media::MediaMetadata, String> {
    slopeffect_media::probe_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_media_thumbnail(path: String) -> Result<String, String> {
    let manager = slopeffect_media::CacheManager::new().map_err(|e| e.to_string())?;
    let cached = manager.generate_thumbnail(path).map_err(|e| e.to_string())?;
    Ok(cached.to_string_lossy().into_owned())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            save_project_to_path,
            add_scene,
            execute_editor_command,
            undo_action,
            redo_action,
            probe_media_file,
            get_media_thumbnail,
            save_rich_project,
            load_rich_project,
            pick_open_file_path,
            pick_save_file_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
