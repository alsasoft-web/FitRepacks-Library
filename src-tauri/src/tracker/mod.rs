use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub mod mafia2;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RawPlayerPosition {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rotation: Option<f32>,
    pub heading_degrees: Option<f32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlayerPointerCandidate {
    pub id: String,
    pub label: String,
    pub address_hex: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rotation: Option<f32>,
    pub heading_degrees: Option<f32>,
    pub map_lat: f64,
    pub map_lng: f64,
    pub district: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LivePlayerPosition {
    pub supported: bool,
    pub game_running: bool,
    pub tracked: bool,
    pub game_title: String,
    pub game_slug: String,
    pub map_slug: String,
    pub process_name: Option<String>,
    pub pid: Option<u32>,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rotation: Option<f32>,
    pub heading_degrees: Option<f32>,
    pub map_lat: Option<f64>,
    pub map_lng: Option<f64>,
    pub status_message: String,
    pub district: Option<String>,
    pub candidates: Vec<PlayerPointerCandidate>,
    pub selected_candidate_id: Option<String>,
}

impl Default for LivePlayerPosition {
    fn default() -> Self {
        Self {
            supported: false,
            game_running: false,
            tracked: false,
            game_title: String::new(),
            game_slug: String::new(),
            map_slug: "default".to_string(),
            process_name: None,
            pid: None,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            rotation: None,
            heading_degrees: None,
            map_lat: None,
            map_lng: None,
            status_message: "Not tracking".to_string(),
            district: None,
            candidates: Vec::new(),
            selected_candidate_id: None,
        }
    }
}

pub trait GameTracker: Send + Sync {
    /// Canonical game title
    fn title(&self) -> &'static str;

    /// Supported game slugs (e.g. ["mafia-2", "mafia-ii", "mafia2"])
    fn game_slugs(&self) -> &'static [&'static str];

    /// Candidate process executable names (e.g. ["Mafia2.exe", "mafiadefinitiveedition.exe"])
    fn process_names(&self) -> &'static [&'static str];

    /// Read raw player position from game process memory
    fn read_position(&self, pid: u32, process_name: &str) -> Option<RawPlayerPosition>;

    /// Read all candidate player positions from game process memory
    fn read_candidates(
        &self,
        pid: u32,
        process_name: &str,
        map_slug: &str,
    ) -> Vec<PlayerPointerCandidate> {
        let _ = (pid, process_name, map_slug);
        Vec::new()
    }

    /// Transform raw in-game coordinates to Leaflet (lat, lng) for the active map
    fn transform_coords(&self, map_slug: &str, raw: &RawPlayerPosition) -> (f64, f64);

    /// Optional district / region name detection based on in-game coordinates
    fn get_district(&self, map_slug: &str, raw: &RawPlayerPosition) -> Option<String> {
        let _ = (map_slug, raw);
        None
    }
}

pub struct TrackerRegistry {
    trackers: Vec<Arc<dyn GameTracker>>,
}

impl TrackerRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            trackers: Vec::new(),
        };
        registry.register(Arc::new(mafia2::Mafia2Tracker::new()));
        registry
    }

    pub fn register(&mut self, tracker: Arc<dyn GameTracker>) {
        self.trackers.push(tracker);
    }

    pub fn find_by_slug(&self, slug: &str) -> Option<Arc<dyn GameTracker>> {
        let clean = slug.trim().to_lowercase();
        for tracker in &self.trackers {
            for &s in tracker.game_slugs() {
                if s.to_lowercase() == clean {
                    return Some(Arc::clone(tracker));
                }
            }
        }
        None
    }

    pub fn is_supported(&self, slug: &str) -> bool {
        self.find_by_slug(slug).is_some()
    }
}

use std::sync::OnceLock;
static GLOBAL_REGISTRY: OnceLock<TrackerRegistry> = OnceLock::new();

pub fn get_registry() -> &'static TrackerRegistry {
    GLOBAL_REGISTRY.get_or_init(|| TrackerRegistry::new())
}

#[cfg(target_os = "windows")]
pub mod win_mem {
    use std::path::Path;
    use windows::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
    use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, Process32FirstW, Process32NextW,
        MODULEENTRY32W, PROCESSENTRY32W, TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };

    pub fn find_process_by_names(names: &[&str]) -> Option<(u32, String)> {
        unsafe {
            let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
                Ok(h) if h != INVALID_HANDLE_VALUE => h,
                _ => return None,
            };

            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let null_pos = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let proc_name =
                        String::from_utf16_lossy(&entry.szExeFile[..null_pos]).to_lowercase();
                    let proc_stem = proc_name.trim_end_matches(".exe").trim().to_lowercase();

                    for &target in names {
                        let clean_target = Path::new(target)
                            .file_name()
                            .and_then(|f| f.to_str())
                            .unwrap_or(target)
                            .to_lowercase();
                        let target_stem = clean_target.trim_end_matches(".exe").trim().to_lowercase();

                        if proc_name == clean_target
                            || proc_stem == target_stem
                            || (!target_stem.is_empty() && proc_stem.contains(&target_stem))
                            || (!proc_stem.is_empty() && target_stem.contains(&proc_stem))
                        {
                            let _ = CloseHandle(snapshot);
                            return Some((entry.th32ProcessID, proc_name));
                        }
                    }

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }

            let _ = CloseHandle(snapshot);
        }
        None
    }

    pub struct ProcessHandle {
        pub handle: HANDLE,
    }

    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            if self.handle != INVALID_HANDLE_VALUE && !self.handle.is_invalid() {
                unsafe {
                    let _ = CloseHandle(self.handle);
                }
            }
        }
    }

    pub fn open_process_for_reading(pid: u32) -> Option<ProcessHandle> {
        unsafe {
            let permissions = [
                PROCESS_VM_READ | PROCESS_QUERY_INFORMATION,
                PROCESS_VM_READ | windows::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION,
                PROCESS_VM_READ,
            ];

            for perm in permissions {
                if let Ok(handle) = OpenProcess(perm, false, pid) {
                    if !handle.is_invalid() {
                        return Some(ProcessHandle { handle });
                    }
                }
            }
            None
        }
    }

    pub fn get_module_base(pid: u32, module_name: &str) -> Option<usize> {
        unsafe {
            let snapshot = match CreateToolhelp32Snapshot(
                TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32,
                pid,
            ) {
                Ok(h) if h != INVALID_HANDLE_VALUE => h,
                _ => return None,
            };

            let mut entry = MODULEENTRY32W {
                dwSize: std::mem::size_of::<MODULEENTRY32W>() as u32,
                ..Default::default()
            };

            let target = module_name.to_lowercase();
            let target_stem = target.trim_end_matches(".exe").trim().to_lowercase();
            let mut found = None;
            let mut first_module_base = None;

            if Module32FirstW(snapshot, &mut entry).is_ok() {
                first_module_base = Some(entry.modBaseAddr as usize);

                loop {
                    let null_pos = entry
                        .szModule
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szModule.len());
                    let mod_name =
                        String::from_utf16_lossy(&entry.szModule[..null_pos]).to_lowercase();
                    let mod_stem = mod_name.trim_end_matches(".exe").trim().to_lowercase();

                    if mod_name == target
                        || mod_stem == target_stem
                        || (!target_stem.is_empty() && mod_stem.contains(&target_stem))
                        || (!mod_stem.is_empty() && target_stem.contains(&mod_stem))
                    {
                        found = Some(entry.modBaseAddr as usize);
                        break;
                    }

                    if Module32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }

            let _ = CloseHandle(snapshot);
            found.or(first_module_base)
        }
    }

    pub unsafe fn read_val<T: Copy>(handle: HANDLE, address: usize) -> Option<T> {
        if address == 0 {
            return None;
        }
        let mut buffer = std::mem::MaybeUninit::<T>::uninit();
        let res = ReadProcessMemory(
            handle,
            address as *const _,
            buffer.as_mut_ptr() as *mut _,
            std::mem::size_of::<T>(),
            None,
        );
        if res.is_ok() {
            Some(buffer.assume_init())
        } else {
            None
        }
    }

    pub unsafe fn read_bytes(handle: HANDLE, address: usize, len: usize) -> Option<Vec<u8>> {
        if address == 0 || len == 0 {
            return None;
        }
        let mut buffer = vec![0u8; len];
        let res = ReadProcessMemory(
            handle,
            address as *const _,
            buffer.as_mut_ptr() as *mut _,
            len,
            None,
        );
        if res.is_ok() {
            Some(buffer)
        } else {
            None
        }
    }

    pub unsafe fn read_ptr_chain_32(handle: HANDLE, base: usize, offsets: &[usize]) -> Option<usize> {
        let mut current = base;
        for (i, &offset) in offsets.iter().enumerate() {
            let addr = current.checked_add(offset)?;
            if i == offsets.len() - 1 {
                return Some(addr);
            }
            let ptr_val: u32 = read_val(handle, addr)?;
            if ptr_val == 0 {
                return None;
            }
            current = ptr_val as usize;
        }
        Some(current)
    }

    pub unsafe fn read_ptr_chain_64(handle: HANDLE, base: usize, offsets: &[usize]) -> Option<usize> {
        let mut current = base;
        for (i, &offset) in offsets.iter().enumerate() {
            let addr = current.checked_add(offset)?;
            if i == offsets.len() - 1 {
                return Some(addr);
            }
            let ptr_val: u64 = read_val(handle, addr)?;
            if ptr_val == 0 {
                return None;
            }
            current = ptr_val as usize;
        }
        Some(current)
    }
}

pub fn get_live_player_position_for_game(
    game_slug: &str,
    map_slug: Option<&str>,
    selected_pointer_id: Option<&str>,
) -> LivePlayerPosition {
    let registry = get_registry();
    let tracker = match registry.find_by_slug(game_slug) {
        Some(t) => t,
        None => {
            return LivePlayerPosition {
                supported: false,
                game_slug: game_slug.to_string(),
                status_message: format!("Live tracking is not currently configured for '{}'", game_slug),
                ..Default::default()
            };
        }
    };

    let effective_map_slug = map_slug.unwrap_or("default");

    #[cfg(target_os = "windows")]
    {
        let process_candidates = tracker.process_names();
        let running_proc = win_mem::find_process_by_names(process_candidates);

        match running_proc {
            Some((pid, proc_name)) => {
                let mut candidates = tracker.read_candidates(pid, &proc_name, effective_map_slug);
                let default_pos = tracker.read_position(pid, &proc_name);

                // If candidates list is empty but default position was read, add it as first candidate
                if candidates.is_empty() {
                    if let Some(ref pos) = default_pos {
                        let (lat, lng) = tracker.transform_coords(effective_map_slug, pos);
                        let district = tracker.get_district(effective_map_slug, pos);
                        candidates.push(PlayerPointerCandidate {
                            id: "primary".to_string(),
                            label: "Primary Player Actor".to_string(),
                            address_hex: String::new(),
                            x: pos.x,
                            y: pos.y,
                            z: pos.z,
                            rotation: pos.rotation,
                            heading_degrees: pos.heading_degrees,
                            map_lat: lat,
                            map_lng: lng,
                            district,
                        });
                    }
                }

                // Determine active chosen candidate
                let active_candidate = if let Some(sel_id) = selected_pointer_id {
                    candidates.iter().find(|c| c.id == sel_id).cloned()
                } else {
                    None
                }.or_else(|| candidates.first().cloned());

                match active_candidate {
                    Some(cand) => {
                        LivePlayerPosition {
                            supported: true,
                            game_running: true,
                            tracked: true,
                            game_title: tracker.title().to_string(),
                            game_slug: game_slug.to_string(),
                            map_slug: effective_map_slug.to_string(),
                            process_name: Some(proc_name),
                            pid: Some(pid),
                            x: cand.x,
                            y: cand.y,
                            z: cand.z,
                            rotation: cand.rotation,
                            heading_degrees: cand.heading_degrees,
                            map_lat: Some(cand.map_lat),
                            map_lng: Some(cand.map_lng),
                            status_message: format!("Tracking live position in {}", tracker.title()),
                            district: cand.district,
                            selected_candidate_id: Some(cand.id),
                            candidates,
                        }
                    }
                    None => {
                        if let Some(pos) = default_pos {
                            let (lat, lng) = tracker.transform_coords(effective_map_slug, &pos);
                            let district = tracker.get_district(effective_map_slug, &pos);
                            LivePlayerPosition {
                                supported: true,
                                game_running: true,
                                tracked: true,
                                game_title: tracker.title().to_string(),
                                game_slug: game_slug.to_string(),
                                map_slug: effective_map_slug.to_string(),
                                process_name: Some(proc_name),
                                pid: Some(pid),
                                x: pos.x,
                                y: pos.y,
                                z: pos.z,
                                rotation: pos.rotation,
                                heading_degrees: pos.heading_degrees,
                                map_lat: Some(lat),
                                map_lng: Some(lng),
                                status_message: format!("Tracking live position in {}", tracker.title()),
                                district,
                                candidates,
                                selected_candidate_id: None,
                            }
                        } else {
                            LivePlayerPosition {
                                supported: true,
                                game_running: true,
                                tracked: false,
                                game_title: tracker.title().to_string(),
                                game_slug: game_slug.to_string(),
                                map_slug: effective_map_slug.to_string(),
                                process_name: Some(proc_name),
                                pid: Some(pid),
                                status_message: format!("{} is running. Waiting for in-game session...", tracker.title()),
                                candidates,
                                ..Default::default()
                            }
                        }
                    }
                }
            }
            None => LivePlayerPosition {
                supported: true,
                game_running: false,
                tracked: false,
                game_title: tracker.title().to_string(),
                game_slug: game_slug.to_string(),
                map_slug: effective_map_slug.to_string(),
                status_message: format!("Waiting for {} to start...", tracker.title()),
                ..Default::default()
            },
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        LivePlayerPosition {
            supported: true,
            game_running: false,
            tracked: false,
            game_title: tracker.title().to_string(),
            game_slug: game_slug.to_string(),
            map_slug: effective_map_slug.to_string(),
            status_message: "Live memory tracking is supported on Windows".to_string(),
            ..Default::default()
        }
    }
}
