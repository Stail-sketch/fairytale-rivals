export const profileKey = 'fairytale-player-v1'
export function createPlayerProfile(storage = localStorage, fetcher = fetch) {
  let credential = '', profile = null
  try { const saved = JSON.parse(storage.getItem(profileKey) ?? 'null'); credential = saved?.credential ?? ''; profile = saved?.profile ?? null } catch { /* Keep existing decks and report registration errors on save. */ }
  async function request(path, method = 'GET', body) {
    const response = await fetcher(path, { method, headers: { ...(credential ? { Authorization: 'Bearer ' + credential } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12_000) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.issue ?? '対戦受付に接続できませんでした。')
    if (data.credential) credential = data.credential
    if (data.profile) {
      profile = data.profile
      // One new key only. Never clear or migrate the existing deck collection.
      storage.setItem(profileKey, JSON.stringify({ credential, profile }))
    }
    return data
  }
  return { get profile() { return profile }, get registered() { return Boolean(credential) },
    saveName: name => request(credential ? '/api/players/me' : '/api/players', 'POST', { name }),
    refresh: () => credential ? request('/api/players/me') : Promise.resolve(null),
    queue: (method = 'GET', body) => request('/api/matchmaking', method, body),
    accept(profileUpdate) { if (!profileUpdate || !credential) return; profile = { ...profile, ...profileUpdate }; storage.setItem(profileKey, JSON.stringify({ credential, profile })) },
  }
}
