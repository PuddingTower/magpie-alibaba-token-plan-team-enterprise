import assert from "node:assert/strict"
import test from "node:test"
import { buildSignedHeaders, fetchSubscriptionStats, formatTeamQuota } from "../src/quota.mjs"
import { FALLBACK_CHAT_MODELS, classifyModel, fetchLiveModelIds, runtimeEntry } from "../src/models.mjs"
import { BailianTeamTokenPlanPlugin } from "../index.mjs"

test("buildSignedHeaders builds ACS3-HMAC-SHA256 Authorization header", async () => {
  const headers = await buildSignedHeaders("LTAI_TEST_AK", "TEST_SK_SECRET", {
    date: "2026-11-18T15:00:00Z",
    nonce: "00000000-0000-4000-8000-000000000001",
  })
  assert.equal(headers.host, "modelstudio.cn-beijing.aliyuncs.com")
  assert.equal(headers["x-acs-action"], "GetSubscriptionStats")
  assert.equal(headers["x-acs-version"], "2026-02-10")
  assert.match(
    headers.Authorization,
    /^ACS3-HMAC-SHA256 Credential=LTAI_TEST_AK,SignedHeaders=host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version,Signature=[0-9a-f]{64}$/
  )
})

test("formatTeamQuota maps GetSubscriptionStats response to Magpie windows", () => {
  const quota = formatTeamQuota({
    SubscriptionEndTime: "2026-12-13T07:00:00Z",
    Items: [
      {
        SeatType: "max",
        TotalSeats: 1,
        SeatCredits: 250000,
        SeatRemainingCredits: 236574,
        SeatRefreshTime: "2026-12-13T07:00:00Z",
      },
    ],
  })
  assert.equal(quota.plan, "Token Plan Team")
  assert.equal(quota.user, "RAM AK · 团队订阅")
  assert.equal(quota.renew, "auto")
  assert.equal(quota.windows.length, 1)
  assert.equal(quota.windows[0].name, "max 席位 ×1")
  assert.equal(quota.windows[0].amount, 13426)
  assert.equal(quota.windows[0].limit, 250000)
  assert.equal(quota.windows[0].unit, "credits")
  assert.equal(quota.windows[0].display, "236,574 / 250,000 credits 剩余")
})

test("fetchSubscriptionStats parses Data on Success=true and throws on API error", async () => {
  const okData = await fetchSubscriptionStats("ak", "sk", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ Success: true, Data: { Items: [{ SeatType: "max" }] } }),
    }),
  })
  assert.equal(okData.Items[0].SeatType, "max")

  await assert.rejects(
    () =>
      fetchSubscriptionStats("ak", "sk", {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ Success: false, Code: "Forbidden", Message: "denied" }),
        }),
      }),
    /denied/
  )
})

test("fetchLiveModelIds deduplicates IDs and classifies chat vs media models", async () => {
  const ids = await fetchLiveModelIds("sk-sp-demo", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "glm-5.3" },
          { id: "deepseek-v4.1-flash-1017" },
          { id: "glm-5.3" },
          { id: "qwen-image-3.0-pro" },
        ],
      }),
    }),
  })
  assert.deepEqual(ids, ["glm-5.3", "deepseek-v4.1-flash-1017", "qwen-image-3.0-pro"])
  assert.equal(classifyModel("glm-5.3").isChat, true)
  assert.equal(classifyModel("qwen-image-3.0-pro").isImageGen, true)
  assert.equal(runtimeEntry("glm-5.3").capabilities.output.text, true)
  assert.equal(runtimeEntry("qwen-image-3.0-pro").capabilities.output.image, true)
})

test("BailianTeamTokenPlanPlugin registers full fallback catalog, provider.models fallback, loader, and usage error", async () => {
  const prevAk = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
  const prevSk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
  delete process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
  delete process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
  try {
    const hooks = await BailianTeamTokenPlanPlugin({}, {})
    const cfg = {}
    await hooks.config(cfg)
    assert.ok(cfg.provider["bailian-token-plan"].models["deepseek-v4.1-flash-1017"])
    assert.ok(cfg.provider["bailian-token-plan"].models["glm-5.3"])
    assert.ok(cfg.provider["bailian-token-plan"].models["qwen4-max"])
    assert.equal(Object.keys(cfg.provider["bailian-token-plan"].models).length, FALLBACK_CHAT_MODELS.length)

    // Without auth, provider.models returns provider.models untouched
    const staticModels = { demo: { id: "demo" } }
    assert.equal(await hooks.provider.models({ models: staticModels }, {}), staticModels)

    const loaderRes = await hooks.auth.loader(async () => ({ type: "api", key: "sk-sp-demo" }))
    assert.equal(loaderRes.baseURL, "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")

    const usageRes = await hooks.auth.usage()
    assert.match(usageRes.error, /缺 AK\/SK/)
    assert.deepEqual(usageRes.windows, [])
  } finally {
    if (prevAk !== undefined) process.env.ALIBABA_CLOUD_ACCESS_KEY_ID = prevAk
    if (prevSk !== undefined) process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET = prevSk
  }
})
