import { fetchSubscriptionStats, formatTeamQuota } from "./src/quota.mjs"

const PROVIDER = "bailian-token-plan"
const BASE = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
const MODEL = { limit: { context: 1000000, output: 65536 }, tool_call: true, reasoning: true }

export const BailianTeamTokenPlanPlugin = async (_input, options = {}) => ({
  config: async (cfg) => {
    cfg.provider ??= {}
    cfg.provider[PROVIDER] ??= {
      name: "Bailian Token Plan Team",
      npm: "@ai-sdk/openai-compatible",
      api: BASE,
      decide: true,
      models: {
        auto: { name: "Auto", ...MODEL },
        "qwen4-max": { name: "Qwen4 Max", ...MODEL },
        "qwen4-max-preview": { name: "Qwen4 Max Preview", ...MODEL },
        "deepseek-v4.1-flash-1017": { name: "DeepSeek V4.1 Flash", ...MODEL, reasoning: false },
        "decision-model-preview": { name: "Decision Model", ...MODEL, decides: true },
      },
    }
  },
  auth: {
    provider: PROVIDER,
    methods: [{ type: "api", label: "Token Plan API Key", placeholder: "sk-sp-…" }],
    async loader(getAuth) {
      const auth = await getAuth()
      if (auth?.type !== "api" || !auth.key) return {}
      return {
        baseURL: BASE,
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
})
