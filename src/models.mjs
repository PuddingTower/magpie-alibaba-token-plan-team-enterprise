export const DEFAULT_BASE = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"

export const FALLBACK_CHAT_MODELS = [
  "auto",
  "qwen4-max",
  "qwen4-max-preview",
  "deepseek-v4.1-flash-1017",
  "deepseek-v4.1-flash",
  "deepseek-v4-pro-0813",
  "deepseek-v4-pro",
  "deepseek-v4-flash-0731",
  "glm-5.3",
  "glm-5.2",
  "glm-5.1",
  "glm-5",
  "qwen3.8-max",
  "qwen3.8-flash",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
  "qwen3.6-flash",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "kimi-k2.5",
  "MiniMax-M2.5",
]

export function classifyModel(id) {
  const isImageGen = /(?:^|-)image(?:-|$)/i.test(id)
  const isVideoGen = /(?:^|-)video(?:-|$)/i.test(id)
  const isAudioOnly = /(?:^|-)audio(?:-|$)/i.test(id) && !/omni/i.test(id)
  return { isImageGen, isVideoGen, isAudioOnly, isChat: !isImageGen && !isVideoGen && !isAudioOnly }
}

export function configEntry(id) {
  const { isChat, isImageGen, isVideoGen, isAudioOnly } = classifyModel(id)
  return {
    name: id,
    limit: { context: 1000000, output: 65536 },
    tool_call: isChat,
    reasoning: isChat,
    attachment: isChat,
    modalities: {
      input: isImageGen ? ["text", "image"] : isVideoGen ? ["text"] : isAudioOnly ? ["text", "audio"] : ["text", "image"],
      output: isImageGen ? ["image"] : isVideoGen ? ["video"] : isAudioOnly ? ["audio"] : ["text"],
    },
  }
}

export function runtimeEntry(id, { providerID = "bailian-token-plan", url = DEFAULT_BASE } = {}) {
  const { isChat, isImageGen, isVideoGen, isAudioOnly } = classifyModel(id)
  return {
    id,
    providerID,
    name: id,
    api: { id, url, npm: "@ai-sdk/openai-compatible" },
    status: "active",
    headers: {},
    options: {},
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 1000000, output: 65536 },
    capabilities: {
      temperature: true,
      reasoning: isChat,
      attachment: isChat,
      toolcall: isChat,
      input: { text: true, image: isChat || isImageGen, audio: isAudioOnly, video: false, pdf: false },
      output: { text: isChat, image: isImageGen, audio: isAudioOnly, video: isVideoGen, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: {},
  }
}

/**
 * Fetch live authorized model IDs from Bailian Token Plan /v1/models.
 */
export async function fetchLiveModelIds(apiKey, { baseURL = DEFAULT_BASE, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${baseURL.replace(/\/+$/, "")}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`/v1/models HTTP ${res.status}`)
  const j = await res.json()
  const ids = (j?.data || []).map((m) => String(m?.id || "").trim()).filter(Boolean)
  if (!ids.length) throw new Error("/v1/models returned empty list")
  return [...new Set(ids)]
}
