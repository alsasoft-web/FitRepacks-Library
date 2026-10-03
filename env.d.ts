declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_IGDB_CLIENT_ID: string;
      NEXT_PUBLIC_IGDB_CLIENT_SECRET: string;
      NEXT_PUBLIC_STEAM_API_KEY: string;
      NEXT_PUBLIC_ALSABASE_URL: string;
    }
  }
}

export {}
