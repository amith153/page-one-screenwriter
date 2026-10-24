/// <reference types="vite/client" />

/** Private keys, read from .env.local (git-ignored). All optional: Settings can supply them too. */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_TMDB_KEY?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
