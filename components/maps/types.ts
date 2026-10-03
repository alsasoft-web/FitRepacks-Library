export interface MapMedia {
  id?: number | string;
  title?: string;
  file_name?: string;
  url?: string;
}

export interface MapLocation {
  id: number | string;
  map_id?: number | string;
  category_id: number | string;
  title: string;
  description?: string | null;
  latitude: number | string;
  longitude: number | string;
  media?: MapMedia[];
}

export interface MapCategory {
  id: number | string;
  group_id?: number | string;
  title: string;
  icon?: string;
  locations_count?: number;
  color?: string | null;
  icon_color?: string | null;
  locations?: MapLocation[];
}

export interface MapGroup {
  id: number | string;
  game_id?: number | string;
  title: string;
  categories?: MapCategory[];
}

export interface MapTileSet {
  name?: string;
  path?: string;
  extension?: string;
  pattern?: string;
  min_zoom?: number;
  max_zoom?: number;
  tiles_max_zoom?: number;
  bounds?: Record<string, { x: { min: number; max: number }; y: { min: number; max: number } }>;
}

export interface MapConfig {
  id?: number | string;
  title?: string;
  gameTitle?: string;
  slug?: string;
  tile_sets?: MapTileSet[];
  tilePattern?: string;
  initial_zoom?: number;
  min_zoom?: number;
  max_zoom?: number;
  start_lat?: number;
  start_lng?: number;
  center?: [number, number];
  markerSpritePositions?: Record<string, { x: number; y: number; width?: number; height?: number; pixelRatio?: number }>;
  markerImagesUrl?: string;
  markerImagesWidth?: number;
  markerImagesHeight?: number;
  iconsCssUrl?: string;
  icomoonUrl?: string;
  mgIconsUrl?: string;
}

export interface MapData {
  game?: {
    id?: number | string;
    title?: string;
    slug?: string;
    config?: Record<string, any>;
  };
  map?: {
    id?: number | string;
    title?: string;
    slug?: string;
    start_lat?: number;
    start_lng?: number;
    tile_sets?: MapTileSet[];
  };
  categories?: MapCategory[];
  groups?: MapGroup[];
  locations?: MapLocation[];
  mapConfig?: MapConfig;
  regions?: any[];
}

export interface MapItem {
  id?: number | string;
  title: string;
  slug: string;
  url?: string;
  web_url?: string;
  locations_count?: number;
}

export interface MapViewerProps {
  gameSlug?: string;
  mapSlug?: string;
  gameTitle?: string;
  mapData?: MapData | null;
  storageKey?: string;
  style?: React.CSSProperties;
  className?: string;
  availableMaps?: MapItem[];
  currentMapSlug?: string;
  minZoom?: number;
  maxZoom?: number;
  isOverlay?: boolean;
  overlayShape?: "rounded" | "square" | "circle";
  isSidebarOpen?: boolean;
  onSelectMap?: (slug: string) => void;
  onOpenOverlay?: () => void;
  onToggleSidebar?: () => void;
  onCloseSidebar?: () => void;
  onClose?: () => void;
}

export interface MapViewerModalProps {
  opened: boolean;
  onClose: () => void;
  gameSlug?: string;
  mapSlug?: string;
  gameTitle?: string;
  mapData?: MapData | null;
  storageKey?: string;
  size?: string | number;
  height?: string | number;
  minZoom?: number;
  maxZoom?: number;
}

export interface PlayerPointerCandidate {
  id: string;
  label: string;
  address_hex: string;
  x: number;
  y: number;
  z: number;
  rotation?: number | null;
  heading_degrees?: number | null;
  map_lat: number;
  map_lng: number;
  district?: string | null;
}

export interface LivePlayerPosition {
  supported: boolean;
  game_running: boolean;
  tracked: boolean;
  game_title: string;
  game_slug: string;
  map_slug: string;
  process_name?: string | null;
  pid?: number | null;
  x: number;
  y: number;
  z: number;
  rotation?: number | null;
  heading_degrees?: number | null;
  map_lat?: number | null;
  map_lng?: number | null;
  status_message: string;
  district?: string | null;
  candidates: PlayerPointerCandidate[];
  selected_candidate_id?: string | null;
}
