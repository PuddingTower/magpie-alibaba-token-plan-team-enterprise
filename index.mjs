import { fetchSubscriptionStats, formatTeamQuota } from "./src/quota.mjs"
import { DEFAULT_BASE, FALLBACK_CHAT_MODELS, configEntry, fetchLiveModelIds, runtimeEntry } from "./src/models.mjs"

const PROVIDER = "bailian-token-plan"

export const BailianTeamTokenPlanPlugin = async (_input, options = {}) => {
  const baseURL = options?.baseURL || DEFAULT_BASE
  return {
    config: async (cfg) => {
      cfg.provider ??= {}
      cfg.provider[PROVIDER] ??= {
        name: "Alibaba Token Plan Team/Enterprise",
        npm: "@ai-sdk/openai-compatible",
        api: baseURL,
        models: Object.fromEntries(FALLBACK_CHAT_MODELS.map((id) => [id, configEntry(id)])),
      }
    },
    provider: {
      id: PROVIDER,
      async models(provider, { auth } = {}) {
        if (auth?.type !== "api" || !auth?.key) return provider.models
        let ids
        let fell = false
        try {
          ids = await fetchLiveModelIds(auth.key, { baseURL })
        } catch {
          ids = FALLBACK_CHAT_MODELS
          fell = true
        }
        const out = Object.fromEntries(ids.map((id) => [id, runtimeEntry(id, { providerID: PROVIDER, url: baseURL })]))
        if (fell) out[Symbol.for("magpie.fellBack")] = true
        return out
      },
    },
    auth: {
      provider: PROVIDER,
      methods: [{ type: "api", label: "Token Plan API Key", placeholder: "sk-sp-…" }],
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth?.type !== "api" || !auth.key) return {}
        return {
          baseURL,
          async fetch(input, init) {
            const headers = new Headers(init?.headers)
            headers.set("authorization", `Bearer ${auth.key}`)
            return fetch(input, { ...init, headers })
          },
        }
      },
      async usage() {
        const ak = options?.accessKeyId || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
        const sk = options?.accessKeySecret || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
        if (!ak || !sk) {
          return {
            error: "缺 AK/SK：请配置 magpie plugin options 的 accessKeyId/accessKeySecret（或环境变量 ALIBABA_CLOUD_ACCESS_KEY_ID/SECRET）",
            windows: [],
          }
        }
        try {
          const data = await fetchSubscriptionStats(ak, sk, {
            host: options?.host || undefined,
          })
          return formatTeamQuota(data, options?.label || "RAM AK · 团队订阅")
        } catch (e) {
          return { error: String(e?.message || e).slice(0, 200), windows: [] }
        }
      },
    },
  }
}
