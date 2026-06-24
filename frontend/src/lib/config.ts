// Runtime config — can be overridden by env vars at build time
// or by the config.json file in the Android assets

interface RuntimeConfig {
  apiUrl: string
  clerkPublishableKey: string
}

// Default config (used in dev / when no config.json is present)
const defaultConfig: RuntimeConfig = {
  apiUrl: 'http://localhost:8000',
  clerkPublishableKey: '',
}

// At build time, Vite injects VITE_* env vars
const buildTimeConfig: Partial<RuntimeConfig> = {
  ...(import.meta.env.VITE_API_URL && { apiUrl: import.meta.env.VITE_API_URL }),
  ...(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && {
    clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  }),
}

let runtimeConfig: RuntimeConfig | null = null

export async function loadConfig(): Promise<RuntimeConfig> {
  if (runtimeConfig) return runtimeConfig

  // In Capacitor/Android, try to load config.json from assets
  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    try {
      const { Filesystem } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: 'config.json',
        directory: 'APPLICATION' as any,
      })
      const fileConfig = JSON.parse(result.data as string)
      const config = { ...defaultConfig, ...buildTimeConfig, ...fileConfig }
      runtimeConfig = config
      return config
    } catch {
      // config.json not found — use build-time defaults
    }
  }

  const config = { ...defaultConfig, ...buildTimeConfig }
  runtimeConfig = config
  return config
}

export function getConfig(): RuntimeConfig {
  return runtimeConfig || { ...defaultConfig, ...buildTimeConfig }
}
