import { useState, useEffect, useCallback } from "react";

export interface GameMapInfo {
  id?: string;
  game_id?: string;
  title: string;
  slug: string;
  game_slug?: string;
  map_slug?: string;
  game_title?: string;
  url?: string;
  web_url?: string;
  game_card?: string;
  game_image?: string;
  thumbnail_url?: string;
  locations_count?: number;
}

export interface MapGenieGameData {
  id: number;
  title: string;
  slug: string;
  image?: string;
  logo?: string;
  locations_count?: number;
  assets?: {
    preview?: string;
    gamecard?: string;
    logo_512?: string;
    preview_thumb?: string;
    theme?: string;
  };
  config?: {
    tiles_base_url?: string;
    cdn_url?: string;
    marker_sprite_url?: string;
  };
  maps?: Array<{
    id: number;
    title: string;
    slug: string;
    image?: string;
    initial_latitude?: number;
    initial_longitude?: number;
    initial_zoom?: number;
    locations_count?: number;
  }>;
}

const STORAGE_KEY = "fitrepacks_mapgenie_maps_v3";
const GAMES_STORAGE_KEY = "fitrepacks_mapgenie_games_v3";

export const STATIC_POPULAR_MAPS: GameMapInfo[] = [
  {
    "id": "887",
    "game_id": "268",
    "title": "Crimson Desert - Pywel",
    "slug": "crimson-desert--pywel",
    "game_slug": "crimson-desert",
    "map_slug": "pywel",
    "game_title": "Crimson Desert",
    "url": "https://mapgenie.io/crimson-desert/maps/pywel",
    "web_url": "https://mapgenie.io/crimson-desert/maps/pywel",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/crimson-desert/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/crimson-desert/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/crimson-desert/preview-thumb.webp",
    "locations_count": 10668
  },
  {
    "id": "102",
    "game_id": "28",
    "title": "Mafia II - Empire Bay",
    "slug": "mafia-2--empire-bay",
    "game_slug": "mafia-2",
    "map_slug": "empire-bay",
    "game_title": "Mafia II",
    "url": "https://mapgenie.io/mafia-2/maps/empire-bay",
    "web_url": "https://mapgenie.io/mafia-2/maps/empire-bay",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/mafia-2/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/mafia-2/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/mafia-2/preview-thumb.webp",
    "locations_count": 448
  },
  {
    "id": "101",
    "game_id": "27",
    "title": "Mafia: Definitive Edition - Lost Heaven",
    "slug": "mafia--lost-heaven",
    "game_slug": "mafia",
    "map_slug": "lost-heaven",
    "game_title": "Mafia: Definitive Edition",
    "url": "https://mapgenie.io/mafia/maps/lost-heaven",
    "web_url": "https://mapgenie.io/mafia/maps/lost-heaven",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/mafia/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/mafia/maps/lost-heaven/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/mafia/preview-thumb.webp",
    "locations_count": 377
  },
  {
    "id": "103",
    "game_id": "29",
    "title": "Mafia III - New Bordeaux",
    "slug": "mafia-3--new-bordeaux",
    "game_slug": "mafia-3",
    "map_slug": "new-bordeaux",
    "game_title": "Mafia III",
    "url": "https://mapgenie.io/mafia-3/maps/new-bordeaux",
    "web_url": "https://mapgenie.io/mafia-3/maps/new-bordeaux",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/mafia-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/mafia-3/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/mafia-3/preview-thumb.webp",
    "locations_count": 512
  },
  {
    "id": "115",
    "game_id": "40",
    "title": "Cyberpunk 2077 - Night City",
    "slug": "cyberpunk-2077--night-city",
    "game_slug": "cyberpunk-2077",
    "map_slug": "night-city",
    "game_title": "Cyberpunk 2077",
    "url": "https://mapgenie.io/cyberpunk-2077/maps/night-city",
    "web_url": "https://mapgenie.io/cyberpunk-2077/maps/night-city",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/cyberpunk-2077/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/cyberpunk-2077/maps/night-city/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/cyberpunk-2077/preview-thumb.webp",
    "locations_count": 2552
  },
  {
    "id": "43",
    "game_id": "13",
    "title": "The Witcher 3 - White Orchard",
    "slug": "witcher-3--white-orchard",
    "game_slug": "witcher-3",
    "map_slug": "white-orchard",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/white-orchard",
    "web_url": "https://mapgenie.io/witcher-3/maps/white-orchard",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/white-orchard/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 233
  },
  {
    "id": "50",
    "game_id": "13",
    "title": "The Witcher 3 - Royal Palace in Vizima",
    "slug": "witcher-3--vizima-palace",
    "game_slug": "witcher-3",
    "map_slug": "vizima-palace",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/vizima-palace",
    "web_url": "https://mapgenie.io/witcher-3/maps/vizima-palace",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/vizima-palace/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 13
  },
  {
    "id": "44",
    "game_id": "13",
    "title": "The Witcher 3 - Velen & Novigrad",
    "slug": "witcher-3--velen-novigrad",
    "game_slug": "witcher-3",
    "map_slug": "velen-novigrad",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/velen-novigrad",
    "web_url": "https://mapgenie.io/witcher-3/maps/velen-novigrad",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/velen-novigrad/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 1747
  },
  {
    "id": "45",
    "game_id": "13",
    "title": "The Witcher 3 - Skellige Isles",
    "slug": "witcher-3--skellige",
    "game_slug": "witcher-3",
    "map_slug": "skellige",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/skellige",
    "web_url": "https://mapgenie.io/witcher-3/maps/skellige",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/skellige/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 642
  },
  {
    "id": "46",
    "game_id": "13",
    "title": "The Witcher 3 - Kaer Morhen",
    "slug": "witcher-3--kaer-morhen",
    "game_slug": "witcher-3",
    "map_slug": "kaer-morhen",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/kaer-morhen",
    "web_url": "https://mapgenie.io/witcher-3/maps/kaer-morhen",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/kaer-morhen/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 86
  },
  {
    "id": "895",
    "game_id": "13",
    "title": "The Witcher 3 - Time and Space",
    "slug": "witcher-3--time-and-space",
    "game_slug": "witcher-3",
    "map_slug": "time-and-space",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/time-and-space",
    "web_url": "https://mapgenie.io/witcher-3/maps/time-and-space",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/time-and-space/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 49
  },
  {
    "id": "49",
    "game_id": "13",
    "title": "The Witcher 3 - Isle of Mists",
    "slug": "witcher-3--isle-of-mists",
    "game_slug": "witcher-3",
    "map_slug": "isle-of-mists",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/isle-of-mists",
    "web_url": "https://mapgenie.io/witcher-3/maps/isle-of-mists",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/isle-of-mists/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 51
  },
  {
    "id": "894",
    "game_id": "13",
    "title": "The Witcher 3 - Realm of Rumination",
    "slug": "witcher-3--realm-of-rumination",
    "game_slug": "witcher-3",
    "map_slug": "realm-of-rumination",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/realm-of-rumination",
    "web_url": "https://mapgenie.io/witcher-3/maps/realm-of-rumination",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/realm-of-rumination/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 24
  },
  {
    "id": "47",
    "game_id": "13",
    "title": "The Witcher 3 - Toussaint",
    "slug": "witcher-3--toussaint",
    "game_slug": "witcher-3",
    "map_slug": "toussaint",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/toussaint",
    "web_url": "https://mapgenie.io/witcher-3/maps/toussaint",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/toussaint/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 362
  },
  {
    "id": "48",
    "game_id": "13",
    "title": "The Witcher 3 - Fablesphere",
    "slug": "witcher-3--fablesphere",
    "game_slug": "witcher-3",
    "map_slug": "fablesphere",
    "game_title": "The Witcher 3",
    "url": "https://mapgenie.io/witcher-3/maps/fablesphere",
    "web_url": "https://mapgenie.io/witcher-3/maps/fablesphere",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/maps/fablesphere/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/witcher-3/preview-thumb.webp",
    "locations_count": 24
  },
  {
    "id": "413",
    "game_id": "111",
    "title": "Elden Ring - The Lands Between",
    "slug": "elden-ring--the-lands-between",
    "game_slug": "elden-ring",
    "map_slug": "the-lands-between",
    "game_title": "Elden Ring",
    "url": "https://mapgenie.io/elden-ring/maps/the-lands-between",
    "web_url": "https://mapgenie.io/elden-ring/maps/the-lands-between",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/elden-ring/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/elden-ring/maps/the-lands-between/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/elden-ring/preview-thumb.webp",
    "locations_count": 5681
  },
  {
    "id": "638",
    "game_id": "111",
    "title": "Elden Ring - Realm of Shadow",
    "slug": "elden-ring--the-shadow-realm",
    "game_slug": "elden-ring",
    "map_slug": "the-shadow-realm",
    "game_title": "Elden Ring",
    "url": "https://mapgenie.io/elden-ring/maps/the-shadow-realm",
    "web_url": "https://mapgenie.io/elden-ring/maps/the-shadow-realm",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/elden-ring/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/elden-ring/maps/the-shadow-realm/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/elden-ring/preview-thumb.webp",
    "locations_count": 1869
  },
  {
    "id": "3",
    "game_id": "3",
    "title": "Skyrim",
    "slug": "skyrim--skyrim",
    "game_slug": "skyrim",
    "map_slug": "skyrim",
    "game_title": "Skyrim",
    "url": "https://mapgenie.io/skyrim/maps/skyrim",
    "web_url": "https://mapgenie.io/skyrim/maps/skyrim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/skyrim/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/skyrim/maps/skyrim/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/skyrim/preview-thumb.webp",
    "locations_count": 2568
  },
  {
    "id": "18",
    "game_id": "3",
    "title": "Skyrim - Solstheim",
    "slug": "skyrim--solstheim",
    "game_slug": "skyrim",
    "map_slug": "solstheim",
    "game_title": "Skyrim",
    "url": "https://mapgenie.io/skyrim/maps/solstheim",
    "web_url": "https://mapgenie.io/skyrim/maps/solstheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/skyrim/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/skyrim/maps/solstheim/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/skyrim/preview-thumb.webp",
    "locations_count": 234
  },
  {
    "id": "321",
    "game_id": "93",
    "title": "Grand Theft Auto: San Andreas - San Andreas",
    "slug": "grand-theft-auto-san-andreas--san-andreas",
    "game_slug": "grand-theft-auto-san-andreas",
    "map_slug": "san-andreas",
    "game_title": "Grand Theft Auto: San Andreas",
    "url": "https://mapgenie.io/grand-theft-auto-san-andreas/maps/san-andreas",
    "web_url": "https://mapgenie.io/grand-theft-auto-san-andreas/maps/san-andreas",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/grand-theft-auto-san-andreas/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/grand-theft-auto-san-andreas/maps/san-andreas/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/grand-theft-auto-san-andreas/preview-thumb.webp",
    "locations_count": 1440
  },
  {
    "id": "320",
    "game_id": "92",
    "title": "Grand Theft Auto: Vice City - Vice City",
    "slug": "grand-theft-auto-vice-city--vice-city",
    "game_slug": "grand-theft-auto-vice-city",
    "map_slug": "vice-city",
    "game_title": "Grand Theft Auto: Vice City",
    "url": "https://mapgenie.io/grand-theft-auto-vice-city/maps/vice-city",
    "web_url": "https://mapgenie.io/grand-theft-auto-vice-city/maps/vice-city",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/grand-theft-auto-vice-city/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/grand-theft-auto-vice-city/maps/vice-city/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/grand-theft-auto-vice-city/preview-thumb.webp",
    "locations_count": 702
  },
  {
    "id": "602",
    "game_id": "180",
    "title": "Fallout: New Vegas - Mojave Wasteland",
    "slug": "fallout-new-vegas--mojave-wasteland",
    "game_slug": "fallout-new-vegas",
    "map_slug": "mojave-wasteland",
    "game_title": "Fallout: New Vegas",
    "url": "https://mapgenie.io/fallout-new-vegas/maps/mojave-wasteland",
    "web_url": "https://mapgenie.io/fallout-new-vegas/maps/mojave-wasteland",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/maps/mojave-wasteland/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/preview-thumb.webp",
    "locations_count": 1797
  },
  {
    "id": "603",
    "game_id": "180",
    "title": "Fallout: New Vegas - Sierra Madre",
    "slug": "fallout-new-vegas--sierra-madre",
    "game_slug": "fallout-new-vegas",
    "map_slug": "sierra-madre",
    "game_title": "Fallout: New Vegas",
    "url": "https://mapgenie.io/fallout-new-vegas/maps/sierra-madre",
    "web_url": "https://mapgenie.io/fallout-new-vegas/maps/sierra-madre",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/maps/sierra-madre/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/preview-thumb.webp",
    "locations_count": 233
  },
  {
    "id": "604",
    "game_id": "180",
    "title": "Fallout: New Vegas - Zion Canyon",
    "slug": "fallout-new-vegas--zion-canyon",
    "game_slug": "fallout-new-vegas",
    "map_slug": "zion-canyon",
    "game_title": "Fallout: New Vegas",
    "url": "https://mapgenie.io/fallout-new-vegas/maps/zion-canyon",
    "web_url": "https://mapgenie.io/fallout-new-vegas/maps/zion-canyon",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/maps/zion-canyon/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/preview-thumb.webp",
    "locations_count": 181
  },
  {
    "id": "605",
    "game_id": "180",
    "title": "Fallout: New Vegas - Big MT",
    "slug": "fallout-new-vegas--big-mt",
    "game_slug": "fallout-new-vegas",
    "map_slug": "big-mt",
    "game_title": "Fallout: New Vegas",
    "url": "https://mapgenie.io/fallout-new-vegas/maps/big-mt",
    "web_url": "https://mapgenie.io/fallout-new-vegas/maps/big-mt",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/maps/big-mt/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/preview-thumb.webp",
    "locations_count": 214
  },
  {
    "id": "606",
    "game_id": "180",
    "title": "Fallout: New Vegas - The Divide",
    "slug": "fallout-new-vegas--the-divide",
    "game_slug": "fallout-new-vegas",
    "map_slug": "the-divide",
    "game_title": "Fallout: New Vegas",
    "url": "https://mapgenie.io/fallout-new-vegas/maps/the-divide",
    "web_url": "https://mapgenie.io/fallout-new-vegas/maps/the-divide",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/maps/the-divide/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-new-vegas/preview-thumb.webp",
    "locations_count": 210
  },
  {
    "id": "200",
    "game_id": "58",
    "title": "Fallout 4 - Commonwealth",
    "slug": "fallout-4--commonwealth",
    "game_slug": "fallout-4",
    "map_slug": "commonwealth",
    "game_title": "Fallout 4",
    "url": "https://mapgenie.io/fallout-4/maps/commonwealth",
    "web_url": "https://mapgenie.io/fallout-4/maps/commonwealth",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/gamecard.jpg",
    "game_image": "https://cdn.mapgenie.io/images/games/fallout-4/maps/commonwealth.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/preview-thumb.webp",
    "locations_count": 2122
  },
  {
    "id": "201",
    "game_id": "58",
    "title": "Fallout 4 - Far Harbor",
    "slug": "fallout-4--far-harbor",
    "game_slug": "fallout-4",
    "map_slug": "far-harbor",
    "game_title": "Fallout 4",
    "url": "https://mapgenie.io/fallout-4/maps/far-harbor",
    "web_url": "https://mapgenie.io/fallout-4/maps/far-harbor",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/gamecard.jpg",
    "game_image": "https://cdn.mapgenie.io/images/games/fallout-4/maps/far-harbor.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/preview-thumb.webp",
    "locations_count": 536
  },
  {
    "id": "202",
    "game_id": "58",
    "title": "Fallout 4 - Nuka-World",
    "slug": "fallout-4--nuka-world",
    "game_slug": "fallout-4",
    "map_slug": "nuka-world",
    "game_title": "Fallout 4",
    "url": "https://mapgenie.io/fallout-4/maps/nuka-world",
    "web_url": "https://mapgenie.io/fallout-4/maps/nuka-world",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/gamecard.jpg",
    "game_image": "https://cdn.mapgenie.io/images/games/fallout-4/maps/nuka-world.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/preview-thumb.webp",
    "locations_count": 274
  },
  {
    "id": "675",
    "game_id": "58",
    "title": "Fallout 4 - Fallout London",
    "slug": "fallout-4--fallout-london",
    "game_slug": "fallout-4",
    "map_slug": "fallout-london",
    "game_title": "Fallout 4",
    "url": "https://mapgenie.io/fallout-4/maps/fallout-london",
    "web_url": "https://mapgenie.io/fallout-4/maps/fallout-london",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/gamecard.jpg",
    "game_image": "https://cdn.mapgenie.io/images/games/fallout-4/maps/fallout-london.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-4/preview-thumb.webp",
    "locations_count": 644
  },
  {
    "id": "2",
    "game_id": "2",
    "title": "Fallout 76 - Appalachia",
    "slug": "fallout76--appalachia",
    "game_slug": "fallout76",
    "map_slug": "appalachia",
    "game_title": "Fallout 76",
    "url": "https://mapgenie.io/fallout76/maps/appalachia",
    "web_url": "https://mapgenie.io/fallout76/maps/appalachia",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout76/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout76/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout76/preview-thumb.webp",
    "locations_count": 2511
  },
  {
    "id": "624",
    "game_id": "187",
    "title": "Fallout 3 - Capital Wasteland",
    "slug": "fallout-3--capital-wasteland",
    "game_slug": "fallout-3",
    "map_slug": "capital-wasteland",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/capital-wasteland",
    "web_url": "https://mapgenie.io/fallout-3/maps/capital-wasteland",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/capital-wasteland/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 987
  },
  {
    "id": "625",
    "game_id": "187",
    "title": "Fallout 3 - Anchorage",
    "slug": "fallout-3--anchorage",
    "game_slug": "fallout-3",
    "map_slug": "anchorage",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/anchorage",
    "web_url": "https://mapgenie.io/fallout-3/maps/anchorage",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/anchorage/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 995
  },
  {
    "id": "626",
    "game_id": "187",
    "title": "Fallout 3 - The Pitt",
    "slug": "fallout-3--the-pitt",
    "game_slug": "fallout-3",
    "map_slug": "the-pitt",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/the-pitt",
    "web_url": "https://mapgenie.io/fallout-3/maps/the-pitt",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/the-pitt/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 8
  },
  {
    "id": "627",
    "game_id": "187",
    "title": "Fallout 3 - The Enclave Relay",
    "slug": "fallout-3--enclave-relay",
    "game_slug": "fallout-3",
    "map_slug": "enclave-relay",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/enclave-relay",
    "web_url": "https://mapgenie.io/fallout-3/maps/enclave-relay",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/enclave-relay/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 995
  },
  {
    "id": "628",
    "game_id": "187",
    "title": "Fallout 3 - Adams Air Force Base",
    "slug": "fallout-3--adams-air-force-base",
    "game_slug": "fallout-3",
    "map_slug": "adams-air-force-base",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/adams-air-force-base",
    "web_url": "https://mapgenie.io/fallout-3/maps/adams-air-force-base",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/adams-air-force-base/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 995
  },
  {
    "id": "629",
    "game_id": "187",
    "title": "Fallout 3 - Point Lookout",
    "slug": "fallout-3--point-lookout",
    "game_slug": "fallout-3",
    "map_slug": "point-lookout",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/point-lookout",
    "web_url": "https://mapgenie.io/fallout-3/maps/point-lookout",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/point-lookout/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 995
  },
  {
    "id": "630",
    "game_id": "187",
    "title": "Fallout 3 - Mothership Zeta",
    "slug": "fallout-3--mothership-zeta",
    "game_slug": "fallout-3",
    "map_slug": "mothership-zeta",
    "game_title": "Fallout 3",
    "url": "https://mapgenie.io/fallout-3/maps/mothership-zeta",
    "web_url": "https://mapgenie.io/fallout-3/maps/mothership-zeta",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/maps/mothership-zeta/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/fallout-3/preview-thumb.webp",
    "locations_count": 995
  },
  {
    "id": "55",
    "game_id": "16",
    "title": "Assassin's Creed Origins - Egypt",
    "slug": "assassins-creed-origins--egypt",
    "game_slug": "assassins-creed-origins",
    "map_slug": "egypt",
    "game_title": "Assassin's Creed Origins",
    "url": "https://mapgenie.io/assassins-creed-origins/maps/egypt",
    "web_url": "https://mapgenie.io/assassins-creed-origins/maps/egypt",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/maps/egypt/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/preview-thumb.webp",
    "locations_count": 954
  },
  {
    "id": "56",
    "game_id": "16",
    "title": "Assassin's Creed Origins - Sinai",
    "slug": "assassins-creed-origins--sinai",
    "game_slug": "assassins-creed-origins",
    "map_slug": "sinai",
    "game_title": "Assassin's Creed Origins",
    "url": "https://mapgenie.io/assassins-creed-origins/maps/sinai",
    "web_url": "https://mapgenie.io/assassins-creed-origins/maps/sinai",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/maps/sinai/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/preview-thumb.webp",
    "locations_count": 137
  },
  {
    "id": "57",
    "game_id": "16",
    "title": "Assassin's Creed Origins - Valley of the Kings",
    "slug": "assassins-creed-origins--valley-of-the-kings",
    "game_slug": "assassins-creed-origins",
    "map_slug": "valley-of-the-kings",
    "game_title": "Assassin's Creed Origins",
    "url": "https://mapgenie.io/assassins-creed-origins/maps/valley-of-the-kings",
    "web_url": "https://mapgenie.io/assassins-creed-origins/maps/valley-of-the-kings",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/maps/valley-of-the-kings/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-origins/preview-thumb.webp",
    "locations_count": 230
  },
  {
    "id": "8",
    "game_id": "8",
    "title": "Assassin's Creed Odyssey - Greece",
    "slug": "assassins-creed-odyssey--greece",
    "game_slug": "assassins-creed-odyssey",
    "map_slug": "greece",
    "game_title": "Assassin's Creed Odyssey",
    "url": "https://mapgenie.io/assassins-creed-odyssey/maps/greece",
    "web_url": "https://mapgenie.io/assassins-creed-odyssey/maps/greece",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/maps/greece/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/preview-thumb.webp",
    "locations_count": 4079
  },
  {
    "id": "9",
    "game_id": "8",
    "title": "Assassin's Creed Odyssey - Elysium",
    "slug": "assassins-creed-odyssey--elysium",
    "game_slug": "assassins-creed-odyssey",
    "map_slug": "elysium",
    "game_title": "Assassin's Creed Odyssey",
    "url": "https://mapgenie.io/assassins-creed-odyssey/maps/elysium",
    "web_url": "https://mapgenie.io/assassins-creed-odyssey/maps/elysium",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/maps/elysium/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/preview-thumb.webp",
    "locations_count": 150
  },
  {
    "id": "10",
    "game_id": "8",
    "title": "Assassin's Creed Odyssey - Underworld",
    "slug": "assassins-creed-odyssey--underworld",
    "game_slug": "assassins-creed-odyssey",
    "map_slug": "underworld",
    "game_title": "Assassin's Creed Odyssey",
    "url": "https://mapgenie.io/assassins-creed-odyssey/maps/underworld",
    "web_url": "https://mapgenie.io/assassins-creed-odyssey/maps/underworld",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/maps/underworld/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/preview-thumb.webp",
    "locations_count": 136
  },
  {
    "id": "19",
    "game_id": "8",
    "title": "Assassin's Creed Odyssey - Atlantis",
    "slug": "assassins-creed-odyssey--atlantis",
    "game_slug": "assassins-creed-odyssey",
    "map_slug": "atlantis",
    "game_title": "Assassin's Creed Odyssey",
    "url": "https://mapgenie.io/assassins-creed-odyssey/maps/atlantis",
    "web_url": "https://mapgenie.io/assassins-creed-odyssey/maps/atlantis",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/maps/atlantis/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/preview-thumb.webp",
    "locations_count": 269
  },
  {
    "id": "357",
    "game_id": "8",
    "title": "Assassin's Creed Odyssey - Korfu",
    "slug": "assassins-creed-odyssey--korfu",
    "game_slug": "assassins-creed-odyssey",
    "map_slug": "korfu",
    "game_title": "Assassin's Creed Odyssey",
    "url": "https://mapgenie.io/assassins-creed-odyssey/maps/korfu",
    "web_url": "https://mapgenie.io/assassins-creed-odyssey/maps/korfu",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/maps/korfu/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-odyssey/v6/preview-thumb.webp",
    "locations_count": 175
  },
  {
    "id": "131",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Norway",
    "slug": "assassins-creed-valhalla--norway",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "norway",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/norway",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/norway",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/norway/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 283
  },
  {
    "id": "132",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - England",
    "slug": "assassins-creed-valhalla--england",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "england",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/england",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/england",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/england/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 3267
  },
  {
    "id": "133",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Vinland",
    "slug": "assassins-creed-valhalla--vinland",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "vinland",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/vinland",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/vinland",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/vinland/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 63
  },
  {
    "id": "134",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Asgard",
    "slug": "assassins-creed-valhalla--asgard",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "asgard",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/asgard",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/asgard",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/asgard/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 81
  },
  {
    "id": "135",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Jotunheim",
    "slug": "assassins-creed-valhalla--jotunheim",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "jotunheim",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/jotunheim",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/jotunheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/jotunheim/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 78
  },
  {
    "id": "136",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - River Raids",
    "slug": "assassins-creed-valhalla--river-raids",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "river-raids",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/river-raids",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/river-raids",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/river-raids/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 158
  },
  {
    "id": "234",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Ireland",
    "slug": "assassins-creed-valhalla--ireland",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "ireland",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/ireland",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/ireland",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/ireland/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 745
  },
  {
    "id": "235",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Francia",
    "slug": "assassins-creed-valhalla--francia",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "francia",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/francia",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/francia",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/francia/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 523
  },
  {
    "id": "358",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Isle of Skye",
    "slug": "assassins-creed-valhalla--isle-of-skye",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "isle-of-skye",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/isle-of-skye",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/isle-of-skye",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/isle-of-skye/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 203
  },
  {
    "id": "359",
    "game_id": "48",
    "title": "Assassin's Creed Valhalla - Svartalfheim",
    "slug": "assassins-creed-valhalla--svartalfheim",
    "game_slug": "assassins-creed-valhalla",
    "map_slug": "svartalfheim",
    "game_title": "Assassin's Creed Valhalla",
    "url": "https://mapgenie.io/assassins-creed-valhalla/maps/svartalfheim",
    "web_url": "https://mapgenie.io/assassins-creed-valhalla/maps/svartalfheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/maps/svartalfheim/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-valhalla/preview-thumb.webp",
    "locations_count": 713
  },
  {
    "id": "568",
    "game_id": "161",
    "title": "Assassin's Creed Mirage - Baghdad",
    "slug": "assassins-creed-mirage--baghdad",
    "game_slug": "assassins-creed-mirage",
    "map_slug": "baghdad",
    "game_title": "Assassin's Creed Mirage",
    "url": "https://mapgenie.io/assassins-creed-mirage/maps/baghdad",
    "web_url": "https://mapgenie.io/assassins-creed-mirage/maps/baghdad",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-mirage/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-mirage/maps/baghdad/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-mirage/preview-thumb.webp",
    "locations_count": 814
  },
  {
    "id": "850",
    "game_id": "161",
    "title": "Assassin's Creed Mirage - AlUla",
    "slug": "assassins-creed-mirage--alula",
    "game_slug": "assassins-creed-mirage",
    "map_slug": "alula",
    "game_title": "Assassin's Creed Mirage",
    "url": "https://mapgenie.io/assassins-creed-mirage/maps/alula",
    "web_url": "https://mapgenie.io/assassins-creed-mirage/maps/alula",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-mirage/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-mirage/maps/alula/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/assassins-creed-mirage/preview-thumb.webp",
    "locations_count": 127
  },
  {
    "id": "122",
    "game_id": "44",
    "title": "Baldur's Gate 3 - Nautiloid",
    "slug": "baldurs-gate-3--nautiloid",
    "game_slug": "baldurs-gate-3",
    "map_slug": "nautiloid",
    "game_title": "Baldur's Gate 3",
    "url": "https://mapgenie.io/baldurs-gate-3/maps/nautiloid",
    "web_url": "https://mapgenie.io/baldurs-gate-3/maps/nautiloid",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/maps/nautiloid/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/preview-thumb.webp",
    "locations_count": 58
  },
  {
    "id": "123",
    "game_id": "44",
    "title": "Baldur's Gate 3 - Wilderness",
    "slug": "baldurs-gate-3--wilderness",
    "game_slug": "baldurs-gate-3",
    "map_slug": "wilderness",
    "game_title": "Baldur's Gate 3",
    "url": "https://mapgenie.io/baldurs-gate-3/maps/wilderness",
    "web_url": "https://mapgenie.io/baldurs-gate-3/maps/wilderness",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/maps/wilderness/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/preview-thumb.webp",
    "locations_count": 2092
  },
  {
    "id": "124",
    "game_id": "44",
    "title": "Baldur's Gate 3 - Shadow-Cursed Lands",
    "slug": "baldurs-gate-3--shadow-cursed-lands",
    "game_slug": "baldurs-gate-3",
    "map_slug": "shadow-cursed-lands",
    "game_title": "Baldur's Gate 3",
    "url": "https://mapgenie.io/baldurs-gate-3/maps/shadow-cursed-lands",
    "web_url": "https://mapgenie.io/baldurs-gate-3/maps/shadow-cursed-lands",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/maps/shadow-cursed-lands/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/preview-thumb.webp",
    "locations_count": 1090
  },
  {
    "id": "125",
    "game_id": "44",
    "title": "Baldur's Gate 3 - Baldur's Gate",
    "slug": "baldurs-gate-3--baldurs-gate",
    "game_slug": "baldurs-gate-3",
    "map_slug": "baldurs-gate",
    "game_title": "Baldur's Gate 3",
    "url": "https://mapgenie.io/baldurs-gate-3/maps/baldurs-gate",
    "web_url": "https://mapgenie.io/baldurs-gate-3/maps/baldurs-gate",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/maps/baldurs-gate/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/baldurs-gate-3/preview-thumb.webp",
    "locations_count": 1639
  },
  {
    "id": "504",
    "game_id": "143",
    "title": "Hogwarts Legacy - World",
    "slug": "hogwarts-legacy--world",
    "game_slug": "hogwarts-legacy",
    "map_slug": "world",
    "game_title": "Hogwarts Legacy",
    "url": "https://mapgenie.io/hogwarts-legacy/maps/world",
    "web_url": "https://mapgenie.io/hogwarts-legacy/maps/world",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/preview-thumb.webp",
    "locations_count": 1144
  },
  {
    "id": "505",
    "game_id": "143",
    "title": "Hogwarts Legacy - Hogwarts",
    "slug": "hogwarts-legacy--hogwarts",
    "game_slug": "hogwarts-legacy",
    "map_slug": "hogwarts",
    "game_title": "Hogwarts Legacy",
    "url": "https://mapgenie.io/hogwarts-legacy/maps/hogwarts",
    "web_url": "https://mapgenie.io/hogwarts-legacy/maps/hogwarts",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/preview-thumb.webp",
    "locations_count": 710
  },
  {
    "id": "506",
    "game_id": "143",
    "title": "Hogwarts Legacy - Hogsmeade",
    "slug": "hogwarts-legacy--hogsmeade",
    "game_slug": "hogwarts-legacy",
    "map_slug": "hogsmeade",
    "game_title": "Hogwarts Legacy",
    "url": "https://mapgenie.io/hogwarts-legacy/maps/hogsmeade",
    "web_url": "https://mapgenie.io/hogwarts-legacy/maps/hogsmeade",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/hogwarts-legacy/preview-thumb.webp",
    "locations_count": 250
  },
  {
    "id": "551",
    "game_id": "159",
    "title": "Starfield - Galaxy",
    "slug": "starfield--galaxy",
    "game_slug": "starfield",
    "map_slug": "galaxy",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/galaxy",
    "web_url": "https://mapgenie.io/starfield/maps/galaxy",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/maps/galaxy/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 2085
  },
  {
    "id": "557",
    "game_id": "159",
    "title": "Starfield - New Atlantis",
    "slug": "starfield--new-atlantis",
    "game_slug": "starfield",
    "map_slug": "new-atlantis",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/new-atlantis",
    "web_url": "https://mapgenie.io/starfield/maps/new-atlantis",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 281
  },
  {
    "id": "558",
    "game_id": "159",
    "title": "Starfield - Akila City",
    "slug": "starfield--akila-city",
    "game_slug": "starfield",
    "map_slug": "akila-city",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/akila-city",
    "web_url": "https://mapgenie.io/starfield/maps/akila-city",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 146
  },
  {
    "id": "559",
    "game_id": "159",
    "title": "Starfield - Cydonia",
    "slug": "starfield--cydonia",
    "game_slug": "starfield",
    "map_slug": "cydonia",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/cydonia",
    "web_url": "https://mapgenie.io/starfield/maps/cydonia",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 126
  },
  {
    "id": "560",
    "game_id": "159",
    "title": "Starfield - Neon",
    "slug": "starfield--neon",
    "game_slug": "starfield",
    "map_slug": "neon",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/neon",
    "web_url": "https://mapgenie.io/starfield/maps/neon",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 230
  },
  {
    "id": "561",
    "game_id": "159",
    "title": "Starfield - Red Mile",
    "slug": "starfield--red-mile",
    "game_slug": "starfield",
    "map_slug": "red-mile",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/red-mile",
    "web_url": "https://mapgenie.io/starfield/maps/red-mile",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 15
  },
  {
    "id": "562",
    "game_id": "159",
    "title": "Starfield - The Key",
    "slug": "starfield--the-key",
    "game_slug": "starfield",
    "map_slug": "the-key",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/the-key",
    "web_url": "https://mapgenie.io/starfield/maps/the-key",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 36
  },
  {
    "id": "563",
    "game_id": "159",
    "title": "Starfield - Paradiso",
    "slug": "starfield--paradiso",
    "game_slug": "starfield",
    "map_slug": "paradiso",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/paradiso",
    "web_url": "https://mapgenie.io/starfield/maps/paradiso",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 28
  },
  {
    "id": "565",
    "game_id": "159",
    "title": "Starfield - Gagarin Landing",
    "slug": "starfield--gagarin-landing",
    "game_slug": "starfield",
    "map_slug": "gagarin-landing",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/gagarin-landing",
    "web_url": "https://mapgenie.io/starfield/maps/gagarin-landing",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 22
  },
  {
    "id": "566",
    "game_id": "159",
    "title": "Starfield - New Homestead",
    "slug": "starfield--new-homestead",
    "game_slug": "starfield",
    "map_slug": "new-homestead",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/new-homestead",
    "web_url": "https://mapgenie.io/starfield/maps/new-homestead",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 47
  },
  {
    "id": "567",
    "game_id": "159",
    "title": "Starfield - Hopetown",
    "slug": "starfield--hopetown",
    "game_slug": "starfield",
    "map_slug": "hopetown",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/hopetown",
    "web_url": "https://mapgenie.io/starfield/maps/hopetown",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 25
  },
  {
    "id": "570",
    "game_id": "159",
    "title": "Starfield - Waggoner Farm",
    "slug": "starfield--waggoner-farm",
    "game_slug": "starfield",
    "map_slug": "waggoner-farm",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/waggoner-farm",
    "web_url": "https://mapgenie.io/starfield/maps/waggoner-farm",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 3
  },
  {
    "id": "713",
    "game_id": "159",
    "title": "Starfield - The Oracle",
    "slug": "starfield--the-oracle",
    "game_slug": "starfield",
    "map_slug": "the-oracle",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/the-oracle",
    "web_url": "https://mapgenie.io/starfield/maps/the-oracle",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 3044
  },
  {
    "id": "714",
    "game_id": "159",
    "title": "Starfield - Dazra",
    "slug": "starfield--dazra",
    "game_slug": "starfield",
    "map_slug": "dazra",
    "game_title": "Starfield",
    "url": "https://mapgenie.io/starfield/maps/dazra",
    "web_url": "https://mapgenie.io/starfield/maps/dazra",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/starfield/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/starfield/preview-thumb.webp",
    "locations_count": 3044
  },
  {
    "id": "109",
    "game_id": "34",
    "title": "Ghost of Tsushima - Tsushima",
    "slug": "ghost-of-tsushima--tsushima",
    "game_slug": "ghost-of-tsushima",
    "map_slug": "tsushima",
    "game_title": "Ghost of Tsushima",
    "url": "https://mapgenie.io/ghost-of-tsushima/maps/tsushima",
    "web_url": "https://mapgenie.io/ghost-of-tsushima/maps/tsushima",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/ghost-of-tsushima/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/ghost-of-tsushima/maps/tsushima/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/ghost-of-tsushima/preview-thumb.webp",
    "locations_count": 1098
  },
  {
    "id": "765",
    "game_id": "222",
    "title": "DOOM: The Dark Ages - World",
    "slug": "doom-the-dark-ages--world",
    "game_slug": "doom-the-dark-ages",
    "map_slug": "world",
    "game_title": "DOOM: The Dark Ages",
    "url": "https://mapgenie.io/doom-the-dark-ages/maps/world",
    "web_url": "https://mapgenie.io/doom-the-dark-ages/maps/world",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/doom-the-dark-ages/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/doom-the-dark-ages/maps/world/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/doom-the-dark-ages/preview-thumb.webp",
    "locations_count": 85
  },
  {
    "id": "375",
    "game_id": "107",
    "title": "Dying Light 2 - Villedor",
    "slug": "dying-light-2--villedor",
    "game_slug": "dying-light-2",
    "map_slug": "villedor",
    "game_title": "Dying Light 2",
    "url": "https://mapgenie.io/dying-light-2/maps/villedor",
    "web_url": "https://mapgenie.io/dying-light-2/maps/villedor",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/dying-light-2/v3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/dying-light-2/maps/villedor/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/dying-light-2/v3/preview-thumb.webp",
    "locations_count": 1183
  },
  {
    "id": "527",
    "game_id": "107",
    "title": "Dying Light 2 - Carnage Hall",
    "slug": "dying-light-2--bloody-ties",
    "game_slug": "dying-light-2",
    "map_slug": "bloody-ties",
    "game_title": "Dying Light 2",
    "url": "https://mapgenie.io/dying-light-2/maps/bloody-ties",
    "web_url": "https://mapgenie.io/dying-light-2/maps/bloody-ties",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/dying-light-2/v3/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/dying-light-2/maps/bloody-ties/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/dying-light-2/v3/preview-thumb.webp",
    "locations_count": 66
  },
  {
    "id": "181",
    "game_id": "55",
    "title": "Dying Light - The Slums",
    "slug": "dying-light--slums",
    "game_slug": "dying-light",
    "map_slug": "slums",
    "game_title": "Dying Light",
    "url": "https://mapgenie.io/dying-light/maps/slums",
    "web_url": "https://mapgenie.io/dying-light/maps/slums",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/maps/slums/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/preview-thumb.webp",
    "locations_count": 589
  },
  {
    "id": "182",
    "game_id": "55",
    "title": "Dying Light - Old Town",
    "slug": "dying-light--old-town",
    "game_slug": "dying-light",
    "map_slug": "old-town",
    "game_title": "Dying Light",
    "url": "https://mapgenie.io/dying-light/maps/old-town",
    "web_url": "https://mapgenie.io/dying-light/maps/old-town",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/maps/old-town/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/preview-thumb.webp",
    "locations_count": 460
  },
  {
    "id": "183",
    "game_id": "55",
    "title": "Dying Light - Antenna",
    "slug": "dying-light--antenna",
    "game_slug": "dying-light",
    "map_slug": "antenna",
    "game_title": "Dying Light",
    "url": "https://mapgenie.io/dying-light/maps/antenna",
    "web_url": "https://mapgenie.io/dying-light/maps/antenna",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/maps/antenna/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/preview-thumb.webp",
    "locations_count": 11
  },
  {
    "id": "184",
    "game_id": "55",
    "title": "Dying Light - The Countryside",
    "slug": "dying-light--countryside",
    "game_slug": "dying-light",
    "map_slug": "countryside",
    "game_title": "Dying Light",
    "url": "https://mapgenie.io/dying-light/maps/countryside",
    "web_url": "https://mapgenie.io/dying-light/maps/countryside",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/maps/countryside/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/dying-light/preview-thumb.webp",
    "locations_count": 809
  },
  {
    "id": "319",
    "game_id": "91",
    "title": "Far Cry 6 - Yara",
    "slug": "far-cry-6--yara",
    "game_slug": "far-cry-6",
    "map_slug": "yara",
    "game_title": "Far Cry 6",
    "url": "https://mapgenie.io/far-cry-6/maps/yara",
    "web_url": "https://mapgenie.io/far-cry-6/maps/yara",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/maps/yara/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/preview-thumb.webp",
    "locations_count": 2818
  },
  {
    "id": "335",
    "game_id": "91",
    "title": "Far Cry 6 - Vaas's Mind",
    "slug": "far-cry-6--vaas-insanity",
    "game_slug": "far-cry-6",
    "map_slug": "vaas-insanity",
    "game_title": "Far Cry 6",
    "url": "https://mapgenie.io/far-cry-6/maps/vaas-insanity",
    "web_url": "https://mapgenie.io/far-cry-6/maps/vaas-insanity",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/maps/vaas-insanity/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/preview-thumb.webp",
    "locations_count": 180
  },
  {
    "id": "336",
    "game_id": "91",
    "title": "Far Cry 6 - Pagan's Mind",
    "slug": "far-cry-6--pagan-control",
    "game_slug": "far-cry-6",
    "map_slug": "pagan-control",
    "game_title": "Far Cry 6",
    "url": "https://mapgenie.io/far-cry-6/maps/pagan-control",
    "web_url": "https://mapgenie.io/far-cry-6/maps/pagan-control",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/maps/pagan-control/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/preview-thumb.webp",
    "locations_count": 221
  },
  {
    "id": "337",
    "game_id": "91",
    "title": "Far Cry 6 - Father's Mind",
    "slug": "far-cry-6--joseph-collapse",
    "game_slug": "far-cry-6",
    "map_slug": "joseph-collapse",
    "game_title": "Far Cry 6",
    "url": "https://mapgenie.io/far-cry-6/maps/joseph-collapse",
    "web_url": "https://mapgenie.io/far-cry-6/maps/joseph-collapse",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/maps/joseph-collapse/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-6/preview-thumb.webp",
    "locations_count": 191
  },
  {
    "id": "52",
    "game_id": "15",
    "title": "Far Cry 5 - Montana",
    "slug": "far-cry-5--montana",
    "game_slug": "far-cry-5",
    "map_slug": "montana",
    "game_title": "Far Cry 5",
    "url": "https://mapgenie.io/far-cry-5/maps/montana",
    "web_url": "https://mapgenie.io/far-cry-5/maps/montana",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/maps/montana/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/preview-thumb.webp",
    "locations_count": 1083
  },
  {
    "id": "53",
    "game_id": "15",
    "title": "Far Cry 5 - Vietnam",
    "slug": "far-cry-5--vietnam",
    "game_slug": "far-cry-5",
    "map_slug": "vietnam",
    "game_title": "Far Cry 5",
    "url": "https://mapgenie.io/far-cry-5/maps/vietnam",
    "web_url": "https://mapgenie.io/far-cry-5/maps/vietnam",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/maps/vietnam/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/preview-thumb.webp",
    "locations_count": 97
  },
  {
    "id": "54",
    "game_id": "15",
    "title": "Far Cry 5 - Mars",
    "slug": "far-cry-5--mars",
    "game_slug": "far-cry-5",
    "map_slug": "mars",
    "game_title": "Far Cry 5",
    "url": "https://mapgenie.io/far-cry-5/maps/mars",
    "web_url": "https://mapgenie.io/far-cry-5/maps/mars",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/maps/mars/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/far-cry-5/preview-thumb.webp",
    "locations_count": 92
  },
  {
    "id": "546",
    "game_id": "155",
    "title": "Marvel's Spider-Man - Manhattan",
    "slug": "marvels-spider-man--manhattan",
    "game_slug": "marvels-spider-man",
    "map_slug": "manhattan",
    "game_title": "Marvel's Spider-Man",
    "url": "https://mapgenie.io/marvels-spider-man/maps/manhattan",
    "web_url": "https://mapgenie.io/marvels-spider-man/maps/manhattan",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/marvels-spider-man/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/marvels-spider-man/maps/manhattan/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/marvels-spider-man/preview-thumb.webp",
    "locations_count": 324
  },
  {
    "id": "569",
    "game_id": "162",
    "title": "Marvel's Spider-Man 2 - New York",
    "slug": "marvels-spider-man-2--new-york",
    "game_slug": "marvels-spider-man-2",
    "map_slug": "new-york",
    "game_title": "Marvel's Spider-Man 2",
    "url": "https://mapgenie.io/marvels-spider-man-2/maps/new-york",
    "web_url": "https://mapgenie.io/marvels-spider-man-2/maps/new-york",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/marvels-spider-man-2/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/marvels-spider-man-2/maps/new-york/preview.webp",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/marvels-spider-man-2/preview-thumb.webp",
    "locations_count": 639
  },
  {
    "id": "468",
    "game_id": "131",
    "title": "God of War Ragnarök - Sindri's House",
    "slug": "god-of-war-ragnarok--sindris-house",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "sindris-house",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/sindris-house",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/sindris-house",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 63
  },
  {
    "id": "469",
    "game_id": "131",
    "title": "God of War Ragnarök - Vanaheim",
    "slug": "god-of-war-ragnarok--vanaheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "vanaheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/vanaheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/vanaheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 526
  },
  {
    "id": "470",
    "game_id": "131",
    "title": "God of War Ragnarök - Alfheim",
    "slug": "god-of-war-ragnarok--alfheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "alfheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/alfheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/alfheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 164
  },
  {
    "id": "472",
    "game_id": "131",
    "title": "God of War Ragnarök - Muspelheim",
    "slug": "god-of-war-ragnarok--muspelheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "muspelheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/muspelheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/muspelheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 60
  },
  {
    "id": "473",
    "game_id": "131",
    "title": "God of War Ragnarök - Midgard",
    "slug": "god-of-war-ragnarok--midgard",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "midgard",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/midgard",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/midgard",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 272
  },
  {
    "id": "474",
    "game_id": "131",
    "title": "God of War Ragnarök - Svartalfheim",
    "slug": "god-of-war-ragnarok--svartalfheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "svartalfheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/svartalfheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/svartalfheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 319
  },
  {
    "id": "475",
    "game_id": "131",
    "title": "God of War Ragnarök - Jötunheim",
    "slug": "god-of-war-ragnarok--jotunheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "jotunheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/jotunheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/jotunheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 50
  },
  {
    "id": "482",
    "game_id": "131",
    "title": "God of War Ragnarök - Asgard",
    "slug": "god-of-war-ragnarok--asgard",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "asgard",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/asgard",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/asgard",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 30
  },
  {
    "id": "476",
    "game_id": "131",
    "title": "God of War Ragnarök - Helheim",
    "slug": "god-of-war-ragnarok--helheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "helheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/helheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/helheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 52
  },
  {
    "id": "471",
    "game_id": "131",
    "title": "God of War Ragnarök - Niflheim",
    "slug": "god-of-war-ragnarok--niflheim",
    "game_slug": "god-of-war-ragnarok",
    "map_slug": "niflheim",
    "game_title": "God of War Ragnarök",
    "url": "https://mapgenie.io/god-of-war-ragnarok/maps/niflheim",
    "web_url": "https://mapgenie.io/god-of-war-ragnarok/maps/niflheim",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/god-of-war-ragnarok/preview-thumb.webp",
    "locations_count": 54
  },
  {
    "id": "114",
    "game_id": "39",
    "title": "Horizon Zero Dawn - World",
    "slug": "horizon-zero-dawn--world",
    "game_slug": "horizon-zero-dawn",
    "map_slug": "world",
    "game_title": "Horizon Zero Dawn",
    "url": "https://mapgenie.io/horizon-zero-dawn/maps/world",
    "web_url": "https://mapgenie.io/horizon-zero-dawn/maps/world",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/horizon-zero-dawn/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/horizon-zero-dawn/maps/world/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/horizon-zero-dawn/preview-thumb.webp",
    "locations_count": 1404
  },
  {
    "id": "411",
    "game_id": "110",
    "title": "Horizon Forbidden West - World",
    "slug": "horizon-forbidden-west--world",
    "game_slug": "horizon-forbidden-west",
    "map_slug": "world",
    "game_title": "Horizon Forbidden West",
    "url": "https://mapgenie.io/horizon-forbidden-west/maps/world",
    "web_url": "https://mapgenie.io/horizon-forbidden-west/maps/world",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/horizon-forbidden-west/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/horizon-forbidden-west/maps/world/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/horizon-forbidden-west/preview-thumb.webp",
    "locations_count": 1735
  },
  {
    "id": "528",
    "game_id": "110",
    "title": "Horizon Forbidden West - Burning Shores",
    "slug": "horizon-forbidden-west--burning-shores",
    "game_slug": "horizon-forbidden-west",
    "map_slug": "burning-shores",
    "game_title": "Horizon Forbidden West",
    "url": "https://mapgenie.io/horizon-forbidden-west/maps/burning-shores",
    "web_url": "https://mapgenie.io/horizon-forbidden-west/maps/burning-shores",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/horizon-forbidden-west/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/horizon-forbidden-west/maps/burning-shores/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/horizon-forbidden-west/preview-thumb.webp",
    "locations_count": 432
  },
  {
    "id": "684",
    "game_id": "196",
    "title": "Black Myth: Wukong - Chapter 1: Black Cloud, Red Fire",
    "slug": "black-myth-wukong--chapter-1",
    "game_slug": "black-myth-wukong",
    "map_slug": "chapter-1",
    "game_title": "Black Myth: Wukong",
    "url": "https://mapgenie.io/black-myth-wukong/maps/chapter-1",
    "web_url": "https://mapgenie.io/black-myth-wukong/maps/chapter-1",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview-thumb.webp",
    "locations_count": 217
  },
  {
    "id": "685",
    "game_id": "196",
    "title": "Black Myth: Wukong - Chapter 2: Yellow Sand, Desolate Dusk",
    "slug": "black-myth-wukong--chapter-2",
    "game_slug": "black-myth-wukong",
    "map_slug": "chapter-2",
    "game_title": "Black Myth: Wukong",
    "url": "https://mapgenie.io/black-myth-wukong/maps/chapter-2",
    "web_url": "https://mapgenie.io/black-myth-wukong/maps/chapter-2",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview-thumb.webp",
    "locations_count": 344
  },
  {
    "id": "686",
    "game_id": "196",
    "title": "Black Myth: Wukong - Chapter 3: White Snow, Ice Cold",
    "slug": "black-myth-wukong--chapter-3",
    "game_slug": "black-myth-wukong",
    "map_slug": "chapter-3",
    "game_title": "Black Myth: Wukong",
    "url": "https://mapgenie.io/black-myth-wukong/maps/chapter-3",
    "web_url": "https://mapgenie.io/black-myth-wukong/maps/chapter-3",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview-thumb.webp",
    "locations_count": 577
  },
  {
    "id": "687",
    "game_id": "196",
    "title": "Black Myth: Wukong - Chapter 4: Rosy Cheeks, Gray Hair",
    "slug": "black-myth-wukong--chapter-4",
    "game_slug": "black-myth-wukong",
    "map_slug": "chapter-4",
    "game_title": "Black Myth: Wukong",
    "url": "https://mapgenie.io/black-myth-wukong/maps/chapter-4",
    "web_url": "https://mapgenie.io/black-myth-wukong/maps/chapter-4",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview-thumb.webp",
    "locations_count": 502
  },
  {
    "id": "688",
    "game_id": "196",
    "title": "Black Myth: Wukong - Chapter 5: Golden Child, Crimson Blood",
    "slug": "black-myth-wukong--chapter-5",
    "game_slug": "black-myth-wukong",
    "map_slug": "chapter-5",
    "game_title": "Black Myth: Wukong",
    "url": "https://mapgenie.io/black-myth-wukong/maps/chapter-5",
    "web_url": "https://mapgenie.io/black-myth-wukong/maps/chapter-5",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview-thumb.webp",
    "locations_count": 212
  },
  {
    "id": "689",
    "game_id": "196",
    "title": "Black Myth: Wukong - Chapter 6",
    "slug": "black-myth-wukong--chapter-6",
    "game_slug": "black-myth-wukong",
    "map_slug": "chapter-6",
    "game_title": "Black Myth: Wukong",
    "url": "https://mapgenie.io/black-myth-wukong/maps/chapter-6",
    "web_url": "https://mapgenie.io/black-myth-wukong/maps/chapter-6",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/black-myth-wukong/preview-thumb.webp",
    "locations_count": 53
  },
  {
    "id": "580",
    "game_id": "169",
    "title": "Palworld - Palpagos Islands",
    "slug": "palworld--palpagos-islands",
    "game_slug": "palworld",
    "map_slug": "palpagos-islands",
    "game_title": "Palworld",
    "url": "https://mapgenie.io/palworld/maps/palpagos-islands",
    "web_url": "https://mapgenie.io/palworld/maps/palpagos-islands",
    "game_card": "https://media.mapgenie.io/v2/assets/prod/games/palworld/gamecard.jpg",
    "game_image": "https://media.mapgenie.io/v2/assets/prod/games/palworld/maps/palpagos-islands/preview.jpg",
    "thumbnail_url": "https://media.mapgenie.io/v2/assets/prod/games/palworld/preview-thumb.webp",
    "locations_count": 11114
  }
];

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

function getInitialCache(): GameMapInfo[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.filter(
            (m: any) =>
              m.game_slug !== "doom-eternal" &&
              m.slug !== "doom-eternal--exultia" &&
              !String(m.title || "").toLowerCase().includes("doom eternal"),
          );
          return cleaned;
        }
      }
    } catch {}
  }
  return STATIC_POPULAR_MAPS;
}

let mapsCache: GameMapInfo[] = getInitialCache();
let gamesCache: MapGenieGameData[] = [];
let inFlightMapsPromise: Promise<GameMapInfo[]> | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

export function subscribeMapUpdates(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function fetchRawMapGenieGames(): Promise<MapGenieGameData[]> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const resStr = await invoke<string>("fetch_mapgenie_games");
      const data = JSON.parse(resStr);
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (tauriErr) {
      try {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const res = await tauriFetch("https://mapgenie.io/api/v1/games", {
          headers: {
            "Accept": "application/json",
            "Referer": "https://mapgenie.io/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        });
        if (res.ok) return await res.json();
      } catch (_) {}
    }
  }

  const res = await fetch("https://mapgenie.io/api/v1/games", {
    headers: { "Accept": "application/json", "Referer": "https://mapgenie.io/" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchRawMapGenieMapFull(mapId: number | string): Promise<any> {
  const cacheKey = `mapgenie_map_data_${mapId}`;
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.map || parsed.categories || parsed.locations)) {
          return parsed;
        }
      }
    } catch (_) {}
  }

  const numericId = Number(mapId);
  let result: any = null;

  if (isTauri() && !isNaN(numericId)) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const resStr = await invoke<string>("fetch_mapgenie_map", { mapId: numericId });
      result = JSON.parse(resStr);
    } catch (tauriErr) {
      try {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const res = await tauriFetch(`https://mapgenie.io/api/v1/maps/${mapId}/full`, {
          headers: {
            "Accept": "application/json",
            "Referer": "https://mapgenie.io/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        });
        if (res.ok) result = await res.json();
      } catch (_) {}
    }
  }

  if (!result) {
    const res = await fetch(`https://mapgenie.io/api/v1/maps/${mapId}/full`, {
      headers: { "Accept": "application/json", "Referer": "https://mapgenie.io/" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    result = await res.json();
  }

  if (result && typeof window !== "undefined") {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(result));
    } catch (_) {}
  }

  return result;
}

export async function fetchRawMapGenieHtml(gameSlug: string, mapSlug: string): Promise<string> {
  const cacheKey = `mapgenie_page_html_${gameSlug}_${mapSlug}`;
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached && cached.length > 50) return cached;
    } catch (_) {}
  }

  let html = "";
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const resHtml = await invoke<string>("fetch_mapgenie_page", { gameSlug, mapSlug });
      if (resHtml && resHtml.length > 50) html = resHtml;
    } catch (tauriErr) {
      try {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const res = await tauriFetch(`https://mapgenie.io/${gameSlug}/maps/${mapSlug}`, {
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://mapgenie.io/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        });
        if (res.ok) html = await res.text();
      } catch (_) {}
    }
  }

  if (!html) {
    try {
      const res = await fetch(`https://mapgenie.io/${gameSlug}/maps/${mapSlug}`, {
        headers: { "Accept": "text/html,*/*", "Referer": "https://mapgenie.io/" },
      });
      if (res.ok) html = await res.text();
    } catch (_) {}
  }

  if (html && html.length > 50 && typeof window !== "undefined") {
    try {
      localStorage.setItem(cacheKey, html);
    } catch (_) {}
  }

  return html;
}

export async function loadMapsFromMapGenie(): Promise<GameMapInfo[]> {
  if (inFlightMapsPromise) return inFlightMapsPromise;

  inFlightMapsPromise = (async () => {
    try {
      const rawGames = await fetchRawMapGenieGames();
      if (Array.isArray(rawGames) && rawGames.length > 0) {
        gamesCache = rawGames;
        const items: GameMapInfo[] = [];

        for (const game of rawGames) {
          const gameSlug = game.slug || "";
          const gameTitle = game.title || gameSlug;
          const gameCard = game.assets?.gamecard || game.logo || `https://media.mapgenie.io/v2/assets/prod/games/${gameSlug}/gamecard.jpg`;
          const gamePreview = game.assets?.preview || game.image || `https://media.mapgenie.io/v2/assets/prod/games/${gameSlug}/preview.jpg`;
          const gameThumb = game.assets?.preview_thumb || gamePreview || gameCard;

          const mapsList = Array.isArray(game.maps) && game.maps.length > 0
            ? game.maps
            : [{ id: 0, title: gameTitle, slug: "default", locations_count: game.locations_count }];

          for (const map of mapsList) {
            const mapSlug = map.slug || "default";
            const mapTitle = map.title || mapSlug;
            const displayTitle = mapTitle.toLowerCase() !== gameTitle.toLowerCase()
              ? `${gameTitle} - ${mapTitle}`
              : gameTitle;

            items.push({
              id: map.id ? String(map.id) : undefined,
              game_id: String(game.id),
              title: displayTitle,
              slug: `${gameSlug}--${mapSlug}`,
              game_slug: gameSlug,
              map_slug: mapSlug,
              game_title: gameTitle,
              url: `https://mapgenie.io/${gameSlug}/maps/${mapSlug}`,
              web_url: `https://mapgenie.io/${gameSlug}/maps/${mapSlug}`,
              game_card: gameCard,
              game_image: map.image || gamePreview,
              thumbnail_url: gameThumb,
              locations_count: map.locations_count || game.locations_count || 0,
            });
          }
        }

        items.sort((a, b) => (a.game_title || a.title).localeCompare(b.game_title || b.title));
        mapsCache = items;

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(rawGames));
          } catch {}
        }

        matchCache.clear();
        notifyListeners();
        return items;
      }
    } catch (err) {
      console.warn("MapGenie games load failed:", err);
    } finally {
      inFlightMapsPromise = null;
    }
    return mapsCache;
  })();

  return inFlightMapsPromise;
}

export function getCachedMapGenieGames(): MapGenieGameData[] {
  if (gamesCache.length > 0) return gamesCache;
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(GAMES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          gamesCache = parsed;
          return gamesCache;
        }
      }
    } catch {}
  }
  return gamesCache;
}

export function getMapGenieGameBySlug(slug: string): MapGenieGameData | undefined {
  const games = getCachedMapGenieGames();
  const clean = slug.toLowerCase();
  return games.find((g) => g.slug.toLowerCase() === clean);
}

export const KNOWN_GAME_ALIASES: Record<string, string[]> = {
  skyrim: ["elder scrolls 5", "the elder scrolls 5", "the elder scrolls v", "tes 5", "tes v", "skyrim", "the elder scrolls 5 skyrim", "the elder scrolls v skyrim"],
  oblivion: ["elder scrolls 4", "the elder scrolls 4", "the elder scrolls iv", "tes 4", "tes iv", "oblivion"],
  morrowind: ["elder scrolls 3", "the elder scrolls 3", "the elder scrolls iii", "tes 3", "tes iii", "morrowind"],
  "fallout-nv": ["fallout new vegas", "new vegas", "fallout nv"],
  "fallout-new-vegas": ["fallout new vegas", "new vegas", "fallout nv"],
  "fallout-4": ["fallout 4", "fallout iv"],
  "fallout-3": ["fallout 3", "fallout iii"],
  "fallout-76": ["fallout 76"],
  gtasa: ["grand theft auto san andreas", "gta san andreas", "san andreas"],
  "gta-sa": ["grand theft auto san andreas", "gta san andreas", "san andreas", "grand theft auto: san andreas"],
  "grand-theft-auto-san-andreas": ["grand theft auto san andreas", "gta san andreas", "san andreas", "grand theft auto: san andreas"],
  gtavc: ["grand theft auto vice city", "gta vice city", "vice city"],
  "gta-vc": ["grand theft auto vice city", "gta vice city", "vice city", "grand theft auto: vice city"],
  "grand-theft-auto-vice-city": ["grand theft auto vice city", "gta vice city", "vice city", "grand theft auto: vice city"],
  "grand-theft-auto-v": ["grand theft auto 5", "grand theft auto v", "gta 5", "gta v", "gta5"],
  "grand-theft-auto-iv": ["grand theft auto 4", "grand theft auto iv", "gta 4", "gta iv", "gta4"],
  rdr2: ["red dead redemption 2", "red dead 2", "rdr 2", "rdr2"],
  "rdr-2": ["red dead redemption 2", "red dead 2", "rdr 2", "rdr2"],
  "red-dead-redemption-2": ["red dead redemption 2", "red dead 2", "rdr 2", "rdr2"],
  witcher3: ["the witcher 3", "witcher 3", "the witcher 3 wild hunt", "witcher 3 wild hunt", "the witcher iii"],
  "the-witcher-3": ["the witcher 3", "witcher 3", "the witcher 3 wild hunt", "the witcher iii"],
  "the-witcher-3-wild-hunt": ["the witcher 3", "witcher 3", "the witcher 3 wild hunt", "the witcher iii"],
  "witcher-3": ["the witcher 3", "witcher 3", "the witcher 3 wild hunt", "the witcher iii"],
  "cyberpunk-2077": ["cyberpunk", "cyberpunk 2077", "cyberpunk2077"],
  "elden-ring": ["elden ring", "shadow of the erdtree"],
  "mafia-2": ["mafia 2", "mafia ii", "mafia 2 definitive edition", "mafia ii: definitive edition", "mafia ii definitive edition"],
  "mafia-3": ["mafia 3", "mafia iii", "mafia 3 definitive edition", "mafia iii definitive edition"],
  "mafia": ["mafia 1", "mafia definitive edition", "mafia: definitive edition", "mafia i"],
  "assassins-creed-origins": ["ac origins", "assassins creed origins", "assassin's creed origins", "assassins creed egypt"],
  "assassins-creed-odyssey": ["ac odyssey", "assassins creed odyssey", "assassin's creed odyssey", "assassins creed greece"],
  "assassins-creed-valhalla": ["ac valhalla", "assassins creed valhalla", "assassin's creed valhalla"],
  "assassins-creed-mirage": ["ac mirage", "assassins creed mirage", "assassin's creed mirage"],
  "baldurs-gate-3": ["baldur's gate 3", "baldurs gate 3", "bg3", "baldur's gate iii", "baldurs gate iii"],
  "hogwarts-legacy": ["hogwarts legacy", "hogwarts"],
  "starfield": ["starfield"],
  "ghost-of-tsushima": ["ghost of tsushima", "ghost of tsushima director's cut", "ghost of tsushima directors cut"],
  "doom-the-dark-ages": ["doom the dark ages", "doom dark ages", "doom tda"],
  "dying-light-2": ["dying light 2", "dying light 2 stay human"],
  "dying-light": ["dying light", "dying light the following"],
  "far-cry-6": ["far cry 6", "far cry vi"],
  "far-cry-5": ["far cry 5", "far cry v"],
  "marvels-spider-man": ["marvel's spider-man", "spider-man remastered", "marvels spider man", "spider man"],
  "marvels-spider-man-2": ["marvel's spider-man 2", "marvels spider man 2", "spider man 2"],
  "god-of-war-ragnarok": ["god of war ragnarok", "gow ragnarok"],
  "horizon-zero-dawn": ["horizon zero dawn", "horizon zero dawn complete edition"],
  "horizon-forbidden-west": ["horizon forbidden west", "horizon forbidden west complete edition"],
  "black-myth-wukong": ["black myth wukong", "wukong"],
  "palworld": ["palworld"],
  "007-first-light": ["007 first light", "007", "james bond"],
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/definitive\s+edition|directors\s+cut|game\s+of\s+the\s+year|goty|remastered|remake/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

const matchCache = new Map<string, GameMapInfo | undefined>();

export function findMatchingMap(gameTitle?: string, gameSlug?: string): GameMapInfo | undefined {
  if (!gameTitle && !gameSlug) return undefined;
  const list = mapsCache;
  if (list.length === 0) return undefined;

  const cacheKey = `${gameTitle || ""}:::${gameSlug || ""}`;
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey);
  }

  const rawSlug = (gameSlug || "").toLowerCase();
  const cleanTitle = (gameTitle || "").toLowerCase();
  const normalizedTitle = normalizeString(gameTitle || "");
  const normalizedSlug = normalizeString(gameSlug || "");

  for (const [key, aliases] of Object.entries(KNOWN_GAME_ALIASES)) {
    const matchesAlias =
      rawSlug === key.toLowerCase() ||
      aliases.some((alias) => {
        const normAlias = normalizeString(alias);
        return (
          cleanTitle === alias ||
          rawSlug === alias ||
          normalizedTitle === normAlias ||
          normalizedSlug === normAlias
        );
      });

    if (matchesAlias) {
      const match = list.find((m) => m.game_slug?.toLowerCase() === key.toLowerCase() || m.slug?.toLowerCase() === key.toLowerCase());
      if (match) {
        matchCache.set(cacheKey, match);
        return match;
      }
    }
  }

  const result = list.find((m) => {
    const mSlug = (m.game_slug || m.slug || "").toLowerCase();
    const mTitle = (m.game_title || m.title || "").toLowerCase();
    const mNormTitle = normalizeString(mTitle);
    const mNormSlug = normalizeString(mSlug);

    return (
      mSlug === rawSlug ||
      mTitle === cleanTitle ||
      (mNormTitle.length > 4 && (normalizedTitle === mNormTitle || (normalizedTitle.startsWith(mNormTitle) && mNormTitle.length > 6))) ||
      (mNormSlug.length > 4 && normalizedSlug === mNormSlug)
    );
  });

  matchCache.set(cacheKey, result);
  return result;
}

export function useGameMap(gameTitle?: string, gameSlug?: string) {
  const [map, setMap] = useState<GameMapInfo | undefined>(() => findMatchingMap(gameTitle, gameSlug));
  const [isLoading, setIsLoading] = useState<boolean>(!Boolean(findMatchingMap(gameTitle, gameSlug)));

  useEffect(() => {
    let isMounted = true;

    const matched = findMatchingMap(gameTitle, gameSlug);
    if (matched) {
      setMap(matched);
      setIsLoading(false);
    } else {
      setIsLoading(true);
      loadMapsFromMapGenie()
        .then(() => {
          if (isMounted) {
            setMap(findMatchingMap(gameTitle, gameSlug));
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsLoading(false);
        });
    }

    const unsub = subscribeMapUpdates(() => {
      if (isMounted) {
        const updated = findMatchingMap(gameTitle, gameSlug);
        if (updated) {
          setMap(updated);
          setIsLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [gameTitle, gameSlug]);

  return { map, isLoading };
}

export function useAllGameMaps() {
  const [maps, setMaps] = useState<GameMapInfo[]>(() => mapsCache);
  const [isLoading, setIsLoading] = useState<boolean>(mapsCache.length === 0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadMapsFromMapGenie();
      setMaps([...data]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mapsCache.length === 0) refresh();
    return subscribeMapUpdates(() => setMaps([...mapsCache]));
  }, [refresh]);

  return { maps, isLoading, refresh };
}

if (typeof window !== "undefined") {
  loadMapsFromMapGenie().catch(() => {});
}
