use super::{GameTracker, RawPlayerPosition};

#[cfg(target_os = "windows")]
use super::win_mem;

pub struct Mafia2Tracker {
    slugs: &'static [&'static str],
    processes: &'static [&'static str],
}

impl Mafia2Tracker {
    pub fn new() -> Self {
        Self {
            slugs: &[
                "mafia-2",
                "mafia-ii",
                "mafia2",
                "mafaii",
                "mafia",
                "empire-bay",
                "mafia-2-definitive-edition",
                "mafia-ii-definitive-edition",
                "mafia-2-classic",
                "mafia-ii-classic",
            ],
            processes: &[
                "Mafia II Definitive Edition.exe",
                "Mafia II Definitive Edition",
                "mafiadefinitiveedition.exe",
                "mafiadefinitiveedition",
                "MafiaIIDefinitiveEdition.exe",
                "MafiaIIDefinitiveEdition",
                "Mafia2.exe",
                "mafia2.exe",
                "Mafia2",
                "mafia2",
            ],
        }
    }
}

impl GameTracker for Mafia2Tracker {
    fn title(&self) -> &'static str {
        "Mafia II"
    }

    fn game_slugs(&self) -> &'static [&'static str] {
        self.slugs
    }

    fn process_names(&self) -> &'static [&'static str] {
        self.processes
    }

    fn read_position(&self, pid: u32, process_name: &str) -> Option<RawPlayerPosition> {
        #[cfg(target_os = "windows")]
        {
            let handle_wrapper = win_mem::open_process_for_reading(pid)?;
            let handle = handle_wrapper.handle;

            let lower_proc = process_name.to_lowercase();
            let is_64bit = lower_proc.contains("definitive")
                || lower_proc.contains("mafiadefinitiveedition")
                || lower_proc.contains("mafia ii definitive edition");

            let module_base = win_mem::get_module_base(pid, process_name)
                .or_else(|| win_mem::get_module_base(pid, "Mafia II Definitive Edition.exe"))
                .or_else(|| win_mem::get_module_base(pid, "mafiadefinitiveedition.exe"))
                .or_else(|| win_mem::get_module_base(pid, "Mafia2.exe"))
                .unwrap_or(0x140000000);

            if is_64bit {
                // 1. Primary verified live moving player pointer chains (Definitive Edition)
                let verified_chains: &[&[usize]] = &[
                    &[0x314D7A0, 0xA0],
                    &[0x314D7A0, 0xE0],
                    &[0x3156210, 0x18, 0x60],
                    &[0x3156210, 0x20, 0x60],
                    &[0x315DD50, 0x18, 0x40],
                    &[0x315DD50, 0x20, 0x40],
                    &[0x314D798, 0x48, 0x80],
                    &[0x314D798, 0xC0, 0xA0],
                    &[0x314DA68, 0x1C0],
                ];

                for offsets in verified_chains {
                    unsafe {
                        if let Some(target_addr) = win_mem::read_ptr_chain_64(handle, module_base, offsets) {
                            if let Some(pos) = try_read_player_vector_de(handle, target_addr) {
                                return Some(pos);
                            }
                        }
                    }
                }
            } else {
                // 32-bit Mafia II (Classic / v1.0 / v1.0.0.1 / Steam / GOG)
                let pointer_candidates: &[&[usize]] = &[
                    &[0x1AB8668, 0x64, 0x80],
                    &[0x1AB8668, 0x64, 0x20],
                    &[0x1A28A80, 0x20],
                    &[0x1A28A80, 0x0],
                    &[0x1BA1794, 0x34, 0x54],
                    &[0x1198A60, 0x4, 0x60],
                    &[0x1A27A78, 0x3C, 0x18, 0x20],
                    &[0x1BB6020, 0x18, 0x30],
                ];

                for offsets in pointer_candidates {
                    unsafe {
                        if let Some(target_addr) = win_mem::read_ptr_chain_32(handle, module_base, offsets) {
                            if let Some(pos) = try_read_coords_classic(handle, target_addr) {
                                return Some(pos);
                            }
                        }
                        if let Some(target_addr) = win_mem::read_ptr_chain_32(handle, 0, offsets) {
                            if let Some(pos) = try_read_coords_classic(handle, target_addr) {
                                return Some(pos);
                            }
                        }
                    }
                }
            }
        }

        let _ = (pid, process_name);
        None
    }

    fn read_candidates(
        &self,
        pid: u32,
        process_name: &str,
        map_slug: &str,
    ) -> Vec<super::PlayerPointerCandidate> {
        let mut results = Vec::new();
        #[cfg(target_os = "windows")]
        {
            let handle_wrapper = match win_mem::open_process_for_reading(pid) {
                Some(h) => h,
                None => return results,
            };
            let handle = handle_wrapper.handle;

            let lower_proc = process_name.to_lowercase();
            let is_64bit = lower_proc.contains("definitive")
                || lower_proc.contains("mafiadefinitiveedition")
                || lower_proc.contains("mafia ii definitive edition");

            let module_base = win_mem::get_module_base(pid, process_name)
                .or_else(|| win_mem::get_module_base(pid, "Mafia II Definitive Edition.exe"))
                .or_else(|| win_mem::get_module_base(pid, "mafiadefinitiveedition.exe"))
                .or_else(|| win_mem::get_module_base(pid, "Mafia2.exe"))
                .unwrap_or(0x140000000);

            if is_64bit {
                let candidate_configs: &[(&str, usize, &[usize])] = &[
                    ("Base+0x314D7A0 -> +0xA0 (Primary Player & Heading)", 0x314D7A0, &[0xA0]),
                ];

                for (idx, &(label, base_off, offsets)) in candidate_configs.iter().enumerate() {
                    unsafe {
                        let target_opt = if offsets.len() == 1 {
                            win_mem::read_val::<u64>(handle, module_base + base_off)
                                .map(|p| (p as usize).wrapping_add(offsets[0]))
                        } else {
                            win_mem::read_ptr_chain_64(handle, module_base + base_off, offsets)
                        };

                        if let Some(target_addr) = target_opt {
                            if target_addr > 0x10000 && target_addr < 0x7FFFFFFFFFFF {
                                if let Some(pos) = try_read_player_vector_de(handle, target_addr) {
                                    let (lat, lng) = self.transform_coords(map_slug, &pos);
                                    let district = self.get_district(map_slug, &pos);
                                    results.push(super::PlayerPointerCandidate {
                                        id: format!("ptr_{}", idx),
                                        label: format!("#{}: {}", idx + 1, label),
                                        address_hex: format!("0x{:X}", target_addr),
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
                        }
                    }
                }
            } else {
                let classic_candidates: &[(&str, &[usize])] = &[
                    ("Base+0x1AB8668 -> 0x64 -> 0x80 (Classic Main)", &[0x1AB8668, 0x64, 0x80]),
                ];

                for (idx, &(label, offsets)) in classic_candidates.iter().enumerate() {
                    unsafe {
                        let target_opt = win_mem::read_ptr_chain_32(handle, module_base, offsets)
                            .or_else(|| win_mem::read_ptr_chain_32(handle, 0, offsets));

                        if let Some(target_addr) = target_opt {
                            if target_addr > 0x10000 && target_addr < 0x7FFFFFFF {
                                if let Some(pos) = try_read_coords_classic(handle, target_addr) {
                                    let (lat, lng) = self.transform_coords(map_slug, &pos);
                                    let district = self.get_district(map_slug, &pos);
                                    results.push(super::PlayerPointerCandidate {
                                        id: format!("classic_ptr_{}", idx),
                                        label: format!("#{}: {}", idx + 1, label),
                                        address_hex: format!("0x{:X}", target_addr),
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
                        }
                    }
                }
            }
        }
        let _ = map_slug;
        results
    }

    fn transform_coords(&self, _map_slug: &str, raw: &RawPlayerPosition) -> (f64, f64) {
        // Calibrated affine projection for MapGenie Empire Bay
        // let lat_center = 1.177677;
        // let lng_center = -1.252454;
        // let lat_scale = 0.000453;
        // let lng_scale = 0.000453;
        // let rotation_deg: f64 = 0.82;
        // let invert_x = false;
        // let invert_y = false;
        // let swap_xy = false;

        let lat_center = 1.180613;
        let lng_center = -1.259176;
        let lat_scale = 0.000448;
        let lng_scale = 0.000448;
        let rotation_deg: f64 = 2.71;
        let invert_x = false;
        let invert_y = false;
        let swap_xy = false;

        let mut ix = if invert_x { -(raw.x as f64) } else { raw.x as f64 };
        let mut iy = if invert_y { -(raw.y as f64) } else { raw.y as f64 };
        if swap_xy {
            std::mem::swap(&mut ix, &mut iy);
        }

        let rad = rotation_deg.to_radians();
        let cos = rad.cos();
        let sin = rad.sin();

        let rx = ix * cos - iy * sin;
        let ry = ix * sin + iy * cos;

        let map_lat = lat_center + (ry * lat_scale);
        let map_lng = lng_center + (rx * lng_scale);

        (map_lat, map_lng)
    }

    fn get_district(&self, _map_slug: &str, raw: &RawPlayerPosition) -> Option<String> {
        let x = raw.x;
        let y = raw.y;

        if x >= -600.0 && x <= 200.0 && y >= 300.0 && y <= 1000.0 {
            Some("Little Italy".to_string())
        } else if x >= -850.0 && x <= -200.0 && y >= 100.0 && y <= 550.0 {
            Some("Chinatown".to_string())
        } else if x >= -300.0 && x <= 450.0 && y >= -250.0 && y <= 450.0 {
            Some("Midtown".to_string())
        } else if x >= 400.0 && x <= 1300.0 && y >= 0.0 && y <= 850.0 {
            Some("East Side".to_string())
        } else if x >= -1400.0 && x <= -650.0 && y >= -400.0 && y <= 300.0 {
            Some("West Side".to_string())
        } else if x >= -1900.0 && x <= -950.0 && y >= 400.0 && y <= 1300.0 {
            Some("Kingston".to_string())
        } else if x >= -1950.0 && x <= -1200.0 && y >= -350.0 && y <= 400.0 {
            Some("Dipton".to_string())
        } else if x >= -1250.0 && x <= -450.0 && y >= 800.0 && y <= 1700.0 {
            Some("Riverside".to_string())
        } else if x >= -250.0 && x <= 1250.0 && y >= 1000.0 && y <= 2300.0 {
            Some("Hillwood".to_string())
        } else if x >= 600.0 && x <= 1700.0 && y >= 600.0 && y <= 1650.0 {
            Some("Northoak".to_string())
        } else if x >= 200.0 && x <= 1300.0 && y >= -1050.0 && y <= 0.0 {
            Some("Oyster Bay".to_string())
        } else if x >= -50.0 && x <= 850.0 && y >= -1500.0 && y <= -800.0 {
            Some("Hunters Point".to_string())
        } else if x >= -850.0 && x <= 250.0 && y >= -2100.0 && y <= -1000.0 {
            Some("South Port".to_string())
        } else if x >= -1900.0 && x <= -950.0 && y >= -1500.0 && y <= -500.0 {
            Some("Sand Island".to_string())
        } else if x >= -1850.0 && x <= -750.0 && y >= 0.0 && y <= 850.0 {
            Some("Greenfield".to_string())
        } else {
            Some("Empire Bay".to_string())
        }
    }
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
unsafe fn try_read_actor_transform_de(
    handle: windows::Win32::Foundation::HANDLE,
    actor_base: usize,
) -> Option<RawPlayerPosition> {
    if actor_base == 0 {
        return None;
    }

    // Read 16 floats (64 bytes) representing the actor's transform matrix
    let floats: [f32; 16] = win_mem::read_val(handle, actor_base)?;

    let z = floats[0]; // [+0x00] Elevation
    let x = floats[4]; // [+0x10] East-West (X axis)
    let y = floats[8]; // [+0x20] North-South (Y axis)

    if x.is_finite()
        && y.is_finite()
        && z.is_finite()
        && x >= -2500.0
        && x <= 2500.0
        && y >= -3000.0
        && y <= 3000.0
        && z >= -150.0
        && z <= 450.0
        && !(x == 0.0 && y == 0.0 && z == 0.0)
    {
        let fwd_x = floats[5];
        let fwd_y = floats[9];

        let heading_deg = if fwd_x.is_finite() && fwd_y.is_finite() && (fwd_x != 0.0 || fwd_y != 0.0) {
            let rad = fwd_x.atan2(fwd_y);
            let mut deg = (rad * 180.0 / std::f32::consts::PI) % 360.0;
            if deg < 0.0 {
                deg += 360.0;
            }
            Some(deg)
        } else {
            None
        };

        Some(RawPlayerPosition {
            x,
            y,
            z,
            rotation: heading_deg.map(|d| d * std::f32::consts::PI / 180.0),
            heading_degrees: heading_deg,
        })
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
unsafe fn try_read_player_vector_de(
    handle: windows::Win32::Foundation::HANDLE,
    base_addr: usize,
) -> Option<RawPlayerPosition> {
    if base_addr < 0x10000 {
        return None;
    }

    // Read position vector at base_addr [X, Y, Z]
    let pos_vec: [f32; 3] = win_mem::read_val(handle, base_addr)?;
    let x = pos_vec[0];
    let y = pos_vec[1];
    let z = pos_vec[2];

    if x.is_finite()
        && y.is_finite()
        && z.is_finite()
        && x >= -2500.0
        && x <= 2500.0
        && y >= -3000.0
        && y <= 3000.0
        && z >= -150.0
        && z <= 450.0
        && !(x == 0.0 && y == 0.0 && z == 0.0)
    {
        // Check for forward direction vector in matrix at offset -0x20 relative to translation
        let fwd_vec: Option<[f32; 2]> = if base_addr >= 0x20 {
            if let Some(fwd) = win_mem::read_val::<[f32; 2]>(handle, base_addr - 0x20) {
                let mag_sq = fwd[0] * fwd[0] + fwd[1] * fwd[1];
                if mag_sq >= 0.5 && mag_sq <= 1.5 {
                    Some(fwd)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let heading_deg = if let Some(fwd) = fwd_vec {
            let (fwd_x, fwd_y) = (fwd[0], fwd[1]);
            let rad = fwd_x.atan2(fwd_y);
            let mut deg = (rad * 180.0 / std::f32::consts::PI) % 360.0;
            if deg < 0.0 {
                deg += 360.0;
            }
            Some(deg)
        } else {
            None
        };

        Some(RawPlayerPosition {
            x,
            y,
            z,
            rotation: heading_deg.map(|d| d * std::f32::consts::PI / 180.0),
            heading_degrees: heading_deg,
        })
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
unsafe fn try_read_coords_classic(
    handle: windows::Win32::Foundation::HANDLE,
    base_addr: usize,
) -> Option<RawPlayerPosition> {
    if base_addr == 0 {
        return None;
    }

    let coords: [f32; 3] = win_mem::read_val(handle, base_addr)?;
    let x = coords[0];
    let y = coords[1];
    let z = coords[2];

    if x.is_finite()
        && y.is_finite()
        && z.is_finite()
        && x >= -2500.0
        && x <= 2500.0
        && y >= -3000.0
        && y <= 3000.0
        && z >= -150.0
        && z <= 450.0
        && !(x == 0.0 && y == 0.0 && z == 0.0)
    {
        Some(RawPlayerPosition {
            x,
            y,
            z,
            rotation: None,
            heading_degrees: None,
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::thread::sleep;
    use std::time::Duration;

    #[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
    struct SavedCandidate {
        chain_type: u8,
        base_off: usize,
        encoded_off: usize,
        x: f32,
        y: f32,
        z: f32,
    }

    #[test]
    fn test_scan_step1_still() {
        println!("\n=======================================================");
        println!("=== STEP 1: SCANNING WHILE STANDING STILL ===");
        println!("=======================================================");
        let tracker = Mafia2Tracker::new();
        let running = win_mem::find_process_by_names(tracker.process_names());

        let (pid, proc_name) = match running {
            Some(r) => r,
            None => {
                println!("Error: Mafia II process not found. Please ensure the game is running!");
                return;
            }
        };

        let mod_base = win_mem::get_module_base(pid, &proc_name).unwrap_or(0x140000000);
        let handle_wrapper = win_mem::open_process_for_reading(pid).expect("Failed to open process");
        let h = handle_wrapper.handle;

        println!("Process: {} (PID: {}) | Base: 0x{:X}", proc_name, pid, mod_base);
        println!("Scanning static data segment pointers (0x1000000..0x3500000)...");

        let mut ptr_map: Vec<(usize, usize)> = Vec::new();
        unsafe {
            for bo in (0x1000000..0x3500000).step_by(8) {
                if let Some(ptr_val) = win_mem::read_val::<u64>(h, mod_base + bo) {
                    let p = ptr_val as usize;
                    if p > 0x10000000 && p < 0x7FFFFFFFFFFF {
                        let bytes = p.to_le_bytes();
                        let is_ascii = bytes.iter().take(4).all(|&b| b >= 0x20 && b <= 0x7E);
                        if !is_ascii {
                            ptr_map.push((bo, p));
                        }
                    }
                }
            }
        }

        println!("Found {} valid base pointers.", ptr_map.len());

        let mut sample_1: Vec<SavedCandidate> = Vec::new();

        unsafe {
            for &(bo, target) in &ptr_map {
                // Direct offset check 0x00..0x200 (step 16)
                for off in (0x0..0x200).step_by(16) {
                    if let Some(coords) = win_mem::read_val::<[f32; 3]>(h, target + off) {
                        let (c0, c1, c2) = (coords[0], coords[1], coords[2]);
                        if c0.is_finite() && c1.is_finite() && c2.is_finite() {
                            if c0 >= -2500.0 && c0 <= 2500.0 && c1 >= -3000.0 && c1 <= 3000.0 && c2 >= -150.0 && c2 <= 450.0 {
                                if c0.abs() > 5.0 || c1.abs() > 5.0 {
                                    sample_1.push(SavedCandidate {
                                        chain_type: 1,
                                        base_off: bo,
                                        encoded_off: off,
                                        x: c0,
                                        y: c1,
                                        z: c2,
                                    });
                                }
                            }
                        }
                    }
                }

                // Level 2 chain check for prominent actor offsets
                for &sub in &[0x0, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0x48, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xC0, 0xD0, 0xE0, 0xF0, 0x100] {
                    if let Some(p2) = win_mem::read_val::<u64>(h, target + sub) {
                        let target2 = p2 as usize;
                        if target2 > 0x10000000 && target2 < 0x7FFFFFFFFFFF {
                            for &off2 in &[0x0, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0, 0xD0, 0x100] {
                                if let Some(coords) = win_mem::read_val::<[f32; 3]>(h, target2 + off2) {
                                    let (c0, c1, c2) = (coords[0], coords[1], coords[2]);
                                    if c0.is_finite() && c1.is_finite() && c2.is_finite() {
                                        if c0 >= -2500.0 && c0 <= 2500.0 && c1 >= -3000.0 && c1 <= 3000.0 && c2 >= -150.0 && c2 <= 450.0 {
                                            if c0.abs() > 5.0 || c1.abs() > 5.0 {
                                                sample_1.push(SavedCandidate {
                                                    chain_type: 2,
                                                    base_off: bo,
                                                    encoded_off: (sub << 16) | off2,
                                                    x: c0,
                                                    y: c1,
                                                    z: c2,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        println!("Found {} candidates with city-range coordinates.", sample_1.len());
        println!("Checking stability over 1.5 seconds while STILL to eliminate moving ambient traffic & NPCs...");
        sleep(Duration::from_millis(1500));

        let mut stationary_candidates: Vec<SavedCandidate> = Vec::new();

        unsafe {
            for item in sample_1 {
                if item.chain_type == 1 {
                    if let Some(p) = win_mem::read_val::<u64>(h, mod_base + item.base_off) {
                        let target = (p as usize) + item.encoded_off;
                        if let Some(new_coords) = win_mem::read_val::<[f32; 3]>(h, target) {
                            let dx = (new_coords[0] - item.x).abs();
                            let dy = (new_coords[1] - item.y).abs();
                            let dz = (new_coords[2] - item.z).abs();
                            // Keep ONLY candidates that stayed completely still (< 0.001 delta)
                            if dx < 0.001 && dy < 0.001 && dz < 0.001 {
                                stationary_candidates.push(item);
                            }
                        }
                    }
                } else if item.chain_type == 2 {
                    let sub = (item.encoded_off >> 16) & 0xFFFF;
                    let off2 = item.encoded_off & 0xFFFF;
                    if let Some(p) = win_mem::read_val::<u64>(h, mod_base + item.base_off) {
                        if let Some(p2) = win_mem::read_val::<u64>(h, (p as usize) + sub) {
                            let target2 = (p2 as usize) + off2;
                            if let Some(new_coords) = win_mem::read_val::<[f32; 3]>(h, target2) {
                                let dx = (new_coords[0] - item.x).abs();
                                let dy = (new_coords[1] - item.y).abs();
                                let dz = (new_coords[2] - item.z).abs();
                                if dx < 0.001 && dy < 0.001 && dz < 0.001 {
                                    stationary_candidates.push(item);
                                }
                            }
                        }
                    }
                }
            }
        }

        println!("\n=== SUCCESS: Isolated {} stationary candidate addresses ===", stationary_candidates.len());
        let json_data = serde_json::to_string_pretty(&stationary_candidates).unwrap();
        let _ = fs::write("target/stationary_snapshot.json", json_data);
        println!("Snapshot saved to target/stationary_snapshot.json");
        println!("\n>>> ACTION REQUIRED: Now move/walk your character 10-20 meters in-game, then run Step 2!");
    }

    #[test]
    fn test_scan_step2_moved() {
        println!("\n=======================================================");
        println!("=== STEP 2: COMPARING MOVED CANDIDATES ===");
        println!("=======================================================");
        let raw_data = match fs::read_to_string("target/stationary_snapshot.json") {
            Ok(s) => s,
            Err(_) => {
                println!("Error: target/stationary_snapshot.json not found! Run test_scan_step1_still first.");
                return;
            }
        };

        let saved: Vec<SavedCandidate> = serde_json::from_str(&raw_data).unwrap();
        println!("Loaded {} stationary baseline candidates from Step 1.", saved.len());

        let tracker = Mafia2Tracker::new();
        let running = win_mem::find_process_by_names(tracker.process_names());
        let (pid, proc_name) = match running {
            Some(r) => r,
            None => {
                println!("Error: Mafia II process not found!");
                return;
            }
        };

        let mod_base = win_mem::get_module_base(pid, &proc_name).unwrap_or(0x140000000);
        let handle_wrapper = win_mem::open_process_for_reading(pid).expect("Failed to open process");
        let h = handle_wrapper.handle;

        let mut confirmed_player_pointers: Vec<(String, [f32; 3], [f32; 3], f32)> = Vec::new();

        unsafe {
            for item in &saved {
                if item.chain_type == 1 {
                    if let Some(p) = win_mem::read_val::<u64>(h, mod_base + item.base_off) {
                        let target = (p as usize) + item.encoded_off;
                        if let Some(new_coords) = win_mem::read_val::<[f32; 3]>(h, target) {
                            let dx = new_coords[0] - item.x;
                            let dy = new_coords[1] - item.y;
                            let dz = new_coords[2] - item.z;
                            let dist = (dx * dx + dy * dy).sqrt();

                            // Player moved 0.5m to 200m
                            if dist >= 0.5 && dist <= 200.0 && dz.abs() < 30.0 {
                                let desc = format!("[base + 0x{:X}] + 0x{:X}", item.base_off, item.encoded_off);
                                confirmed_player_pointers.push((
                                    desc,
                                    [item.x, item.y, item.z],
                                    new_coords,
                                    dist,
                                ));
                            }
                        }
                    }
                } else if item.chain_type == 2 {
                    let sub = (item.encoded_off >> 16) & 0xFFFF;
                    let off2 = item.encoded_off & 0xFFFF;
                    if let Some(p) = win_mem::read_val::<u64>(h, mod_base + item.base_off) {
                        if let Some(p2) = win_mem::read_val::<u64>(h, (p as usize) + sub) {
                            let target2 = (p2 as usize) + off2;
                            if let Some(new_coords) = win_mem::read_val::<[f32; 3]>(h, target2) {
                                let dx = new_coords[0] - item.x;
                                let dy = new_coords[1] - item.y;
                                let dz = new_coords[2] - item.z;
                                let dist = (dx * dx + dy * dy).sqrt();

                                if dist >= 0.5 && dist <= 200.0 && dz.abs() < 30.0 {
                                    let desc = format!("[[base + 0x{:X}] + 0x{:X}] + 0x{:X}", item.base_off, sub, off2);
                                    confirmed_player_pointers.push((
                                        desc,
                                        [item.x, item.y, item.z],
                                        new_coords,
                                        dist,
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }

        println!("\n=======================================================");
        println!("=== CONFIRMED TRUE PLAYER POINTERS FOUND ({}) ===", confirmed_player_pointers.len());
        println!("=======================================================");
        for (desc, old_c, new_c, dist) in &confirmed_player_pointers {
            println!(
                "  MATCH: {:<45} | Moved: {:.2}m | [{:.1}, {:.1}, {:.1}] -> [{:.1}, {:.1}, {:.1}]",
                desc, dist, old_c[0], old_c[1], old_c[2], new_c[0], new_c[1], new_c[2]
            );
        }
    }

    #[test]
    fn test_debug_player_rotation_and_offsets() {
        println!("\n=======================================================");
        println!("=== LIVE PLAYER ROTATION & MATRIX MEMORY DUMP ===");
        println!("=======================================================");
        let tracker = Mafia2Tracker::new();
        let running = win_mem::find_process_by_names(tracker.process_names());
        let (pid, proc_name) = match running {
            Some(r) => r,
            None => {
                println!("Error: Mafia II process not found!");
                return;
            }
        };

        let mod_base = win_mem::get_module_base(pid, &proc_name).unwrap_or(0x140000000);
        let handle_wrapper = win_mem::open_process_for_reading(pid).expect("Failed to open process");
        let h = handle_wrapper.handle;

        unsafe {
            // Check Base+0x314D7A0
            if let Some(p) = win_mem::read_val::<u64>(h, mod_base + 0x314D7A0) {
                let target = p as usize;
                println!("Base+0x314D7A0 points to 0x{:X}", target);

                let buffer: [f32; 64] = win_mem::read_val(h, target).unwrap_or([0.0; 64]);
                for i in 0..64 {
                    let val = buffer[i];
                    let off = i * 4;
                    if val.is_finite() && val != 0.0 {
                        println!("  [+0x{:03X}] float = {:12.4}", off, val);
                    }
                }
            }

            // Check Base+0x3156210 -> +0x18
            if let Some(p) = win_mem::read_val::<u64>(h, mod_base + 0x3156210) {
                if let Some(p2) = win_mem::read_val::<u64>(h, (p as usize) + 0x18) {
                    let target2 = p2 as usize;
                    println!("\nBase+0x3156210 -> +0x18 points to 0x{:X}", target2);

                    let buffer: [f32; 64] = win_mem::read_val(h, target2).unwrap_or([0.0; 64]);
                    for i in 0..64 {
                        let val = buffer[i];
                        let off = i * 4;
                        if val.is_finite() && val != 0.0 {
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn test_calibrate_mapgenie_affine() {
        let urls = [
            "https://alsabase.93.127.186.247.sslip.io/maps/mafia-2/empire-bay/data.json",
            "https://alsabase.93.127.186.247.sslip.io/maps/mafia-ii/empire-bay/data.json",
            "https://alsabase.93.127.186.247.sslip.io/maps/mafia-2-definitive-edition/empire-bay/data.json",
        ];

        let client = reqwest::blocking::Client::builder().build().unwrap();
        for url in urls {
            if let Ok(resp) = client.get(url).send() {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>() {
                        println!("Successfully downloaded map data from {}", url);
                        if let Some(locs) = json.get("locations").and_then(|l| l.as_array()) {
                            println!("Total locations: {}", locs.len());
                            for loc in locs {
                                let title = loc.get("title").and_then(|t| t.as_str()).unwrap_or("");
                                let desc = loc.get("description").and_then(|d| d.as_str()).unwrap_or("");
                                let lat = loc.get("latitude").and_then(|l| l.as_f64()).or_else(|| loc.get("latitude").and_then(|l| l.as_str()).and_then(|s| s.parse().ok()));
                                let lng = loc.get("longitude").and_then(|l| l.as_f64()).or_else(|| loc.get("longitude").and_then(|l| l.as_str()).and_then(|s| s.parse().ok()));

                                if title.to_lowercase().contains("burger")
                                    || title.to_lowercase().contains("clothing")
                                    || title.to_lowercase().contains("gas")
                                    || title.to_lowercase().contains("giuseppe")
                                    || title.to_lowercase().contains("vito's")
                                    || title.to_lowercase().contains("apartment")
                                    || title.to_lowercase().contains("derek")
                                    || title.to_lowercase().contains("mister")
                                    || title.to_lowercase().contains("wanted")
                                    || title.to_lowercase().contains("playboy")
                                {
                                    if let (Some(la), Some(ln)) = (lat, lng) {
                                        println!("  LOCATION: {:<30} | Lat: {:10.6}, Lng: {:10.6} | Desc: {}", title, la, ln, desc);
                                    }
                                }
                            }
                        }
                        if let Some(bounds) = json.get("mapConfig").or_else(|| json.get("map")) {
                            println!("Map config: {:?}", bounds);
                        }
                        break;
                    }
                }
            }
        }
    }
}


