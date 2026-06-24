// Runtime config — can be overridden by env vars at build time
// or by the config.json file in the Android assets

interface RuntimeConfig {
  apiUrl: string
}

const defaultConfig: RuntimeConfig = {
  apiUrl: 'http://localhost:8000',
}

const buildTimeConfig: Partial<RuntimeConfig> = {
  ...(import.meta.env.VITE_API_URL && { apiUrl: import.meta.env.VITE_API_URL }),
}

let runtimeConfig: RuntimeConfig | null = null

export async function loadConfig(): Promise<RuntimeConfig> {
  if (runtimeConfig) return runtimeConfig

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
    } catch {}
  }

  const config = { ...defaultConfig, ...buildTimeConfig }
  runtimeConfig = config
  return config
}

export function getConfig(): RuntimeConfig {
  return runtimeConfig || { ...defaultConfig, ...buildTimeConfig }
}
