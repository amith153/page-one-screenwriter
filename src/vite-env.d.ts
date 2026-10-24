/// <reference types="vite/client" />

/** Private keys, read from .env.local (git-ignored). All optional: Settings can supply them too. */
interface ImportMetaEnv {
  readonly VITE_TMDB_KEY?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
