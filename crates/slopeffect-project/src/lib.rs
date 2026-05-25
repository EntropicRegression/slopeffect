use serde::{Serialize, Deserialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use uuid::Uuid;
use slopeffect_core::{Scene, TransformState};

// ==========================================================================
// 1. Asset Library Metadata
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    pub id: Uuid,
    pub original_path: String,
    pub file_type: String,
    pub duration_seconds: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub size_bytes: u64,
    pub has_video: bool,
    pub has_audio: bool,
}

// ==========================================================================
// 2. Project Document containing Shared Assets & Scene Collections
// ==========================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocument {
    pub id: Uuid,
    pub schema_version: u32,
    pub name: String,
    pub assets: Vec<AssetMetadata>,
    pub current_scene_id: Uuid,
    pub scenes: Vec<Scene>,
}

// ==========================================================================
// 3. Project File Serializer / Deserializer (.slopeproj)
// ==========================================================================

#[derive(thiserror::Error, Debug)]
pub enum ProjectError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization / Deserialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Migration error: {0}")]
    Migration(String),
}

pub fn save_project<P: AsRef<Path>>(doc: &ProjectDocument, path: P) -> Result<(), ProjectError> {
    let json_str = serde_json::to_string_pretty(doc)?;
    let mut file = File::create(path)?;
    file.write_all(json_str.as_bytes())?;
    Ok(())
}

pub fn load_project<P: AsRef<Path>>(path: P) -> Result<ProjectDocument, ProjectError> {
    let mut file = File::open(path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    let doc: ProjectDocument = serde_json::from_str(&contents)?;
    Ok(doc)
}

// ==========================================================================
// 4. Command Undo / Redo Service (In-memory stack, cleared on close)
// ==========================================================================

pub trait EditorCommand: Send + Sync {
    fn name(&self) -> &'static str;
    fn execute(&self, doc: &mut ProjectDocument) -> anyhow::Result<Box<dyn EditorCommand>>;
}

pub struct CommandHistory {
    undo_stack: Vec<Box<dyn EditorCommand>>,
    redo_stack: Vec<Box<dyn EditorCommand>>,
}

impl Default for CommandHistory {
    fn default() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }
}

impl CommandHistory {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn execute(&mut self, doc: &mut ProjectDocument, cmd: Box<dyn EditorCommand>) -> anyhow::Result<()> {
        let inverse = cmd.execute(doc)?;
        self.undo_stack.push(inverse);
        self.redo_stack.clear(); // Clear redo on new action
        Ok(())
    }
    
    pub fn undo(&mut self, doc: &mut ProjectDocument) -> anyhow::Result<bool> {
        if let Some(cmd) = self.undo_stack.pop() {
            let inverse = cmd.execute(doc)?;
            self.redo_stack.push(inverse);
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    pub fn redo(&mut self, doc: &mut ProjectDocument) -> anyhow::Result<bool> {
        if let Some(cmd) = self.redo_stack.pop() {
            let inverse = cmd.execute(doc)?;
            self.undo_stack.push(inverse);
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

// ==========================================================================
// 5. Active Scene Command Operations
// ==========================================================================

pub struct UpdateTransformCommand {
    pub clip_id: Uuid,
    pub next_transform: TransformState,
}

impl EditorCommand for UpdateTransformCommand {
    fn name(&self) -> &'static str {
        "layer.update_transform"
    }
    
    fn execute(&self, doc: &mut ProjectDocument) -> anyhow::Result<Box<dyn EditorCommand>> {
        // Fetch active scene
        let active_scene_id = doc.current_scene_id;
        let scene = doc.scenes.iter_mut()
            .find(|s| s.id == active_scene_id)
            .ok_or_else(|| anyhow::anyhow!("Active scene not found"))?;
            
        // Find the clip by clip_id across all video tracks in this scene
        for track in &mut scene.video_tracks {
            for clip in &mut track.clips {
                if clip.id == self.clip_id {
                    let prev_transform = clip.layer.transform.clone();
                    clip.layer.transform = self.next_transform.clone();
                    
                    // Return inverse for undoing
                    return Ok(Box::new(UpdateTransformCommand {
                        clip_id: self.clip_id,
                        next_transform: prev_transform,
                    }));
                }
            }
        }
        anyhow::bail!("Clip with id {} not found in active scene", self.clip_id)
    }
}

pub struct AddSceneCommand {
    pub name: String,
    pub width: u32,
    pub height: u32,
}

impl EditorCommand for AddSceneCommand {
    fn name(&self) -> &'static str {
        "project.add_scene"
    }
    
    fn execute(&self, doc: &mut ProjectDocument) -> anyhow::Result<Box<dyn EditorCommand>> {
        let new_scene = Scene::new(&self.name, self.width, self.height);
        let scene_id = new_scene.id;
        doc.scenes.push(new_scene);
        
        let prev_scene_id = doc.current_scene_id;
        doc.current_scene_id = scene_id;
        
        // Return inverse command to delete scene
        struct RemoveSceneCommand {
            scene_id: Uuid,
            fallback_scene_id: Uuid,
        }
        
        impl EditorCommand for RemoveSceneCommand {
            fn name(&self) -> &'static str {
                "project.remove_scene"
            }
            fn execute(&self, doc: &mut ProjectDocument) -> anyhow::Result<Box<dyn EditorCommand>> {
                let index = doc.scenes.iter().position(|s| s.id == self.scene_id)
                    .ok_or_else(|| anyhow::anyhow!("Scene not found to remove"))?;
                let removed = doc.scenes.remove(index);
                doc.current_scene_id = self.fallback_scene_id;
                
                // Return Add inverse
                Ok(Box::new(AddSceneCommand {
                    name: removed.name,
                    width: removed.width,
                    height: removed.height,
                }))
            }
        }
        
        Ok(Box::new(RemoveSceneCommand {
            scene_id,
            fallback_scene_id: prev_scene_id,
        }))
    }
}
