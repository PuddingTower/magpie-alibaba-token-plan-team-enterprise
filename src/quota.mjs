const DEFAULT_HOST = "modelstudio.cn-beijing.aliyuncs.com"
const URI = "/tokenplan/subscription/stats"
const enc = new TextEncoder()

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")

export async function sha256hex(s) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)))
}

export async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))
}

/**
 * Build ACS3-HMAC-SHA256 signed headers for ModelStudio GetSubscriptionStats.
 */
export async function buildSignedHeaders(ak, sk, { host = DEFAULT_HOST, date, nonce } = {}) {
  const bodyHash = await sha256hex("")
  const headers = {
    host,
    "x-acs-action": "GetSubscriptionStats",
    "x-acs-version": "2026-02-10",
    "x-acs-date": date || new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    "x-acs-signature-nonce": nonce || crypto.randomUUID(),
    "x-acs-content-sha256": bodyHash,
  }
  const signed = Object.keys(headers).sort().join(";")
  const canonHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("")
  const canonical = `GET\n${URI}\n\n${canonHeaders}\n${signed}\n${bodyHash}`
  const sts = "ACS3-HMAC-SHA256\n" + (await sha256hex(canonical))
  const sig = await hmacHex(sk, sts)
  return {
    ...headers,
    Authorization: `ACS3-HMAC-SHA256 Credential=${ak},SignedHeaders=${signed},Signature=${sig}`,
  }
}

/**
 * Fetch Bailian Token Plan Team subscription stats via OpenAPI (no console login or SMS MFA).
 */
export async function fetchSubscriptionStats(ak, sk, { host = DEFAULT_HOST, fetchImpl = fetch } = {}) {
  const headers = await buildSignedHeaders(ak, sk, { host })
  const res = await fetchImpl(`https://${host}${URI}`, { headers })
  if (!res.ok) throw new Error(`GetSubscriptionStats HTTP ${res.status}`)
  const j = await res.json()
  if (!j.Success) throw new Error(j.Message || j.Code || "GetSubscriptionStats failed")
  return j.Data
}

/**
 * Convert GetSubscriptionStats Data into Magpie subscription quota format.
 */
export function formatTeamQuota(data, label = "RAM AK · 团队订阅") {
  const windows = (data?.Items || []).map((it) => {
    const limit = it.SeatCredits || 0
    const remaining = it.SeatRemainingCredits || 0
    const amount = Math.max(0, limit - remaining)
    return {
      name: `${it.SeatType} 席位 ×${it.TotalSeats}`,
      amount,
      limit,
      unit: "credits",
      resetsAt: it.SeatRefreshTime,
      display: `${Math.round(remaining).toLocaleString("en-US")} / ${Math.round(limit).toLocaleString("en-US")} credits 剩余`,
    }
  })
  return {
    plan: "Token Plan Team",
    user: label,
    until: data?.SubscriptionEndTime,
    renew: "auto",
    windows,
  }
}
