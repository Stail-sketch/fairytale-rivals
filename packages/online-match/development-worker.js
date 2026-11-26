import worker, { BattleRoom, Matchmaking } from '../../cloudflare/worker.js'

// Development/test adapter uses the production handlers; production persists in Durable Objects.
export function developmentWorker() {
  const timers = new Set(), env = { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }
  function namespace(Class) {
    const entries = new Map()
    return { idFromName: id => id, entries, get(id) {
      if (!entries.has(id)) {
        const values = new Map(); let queue = Promise.resolve(), alarm
        const entry = { values }
        const setAlarm = async when => {
          if (alarm) { clearTimeout(alarm); timers.delete(alarm) }
          alarm = setTimeout(() => { timers.delete(alarm); void entry.instance.alarm?.() }, Math.max(1, when - Date.now()))
          alarm.unref(); timers.add(alarm)
        }
        const storage = { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)) },
          deleteAll: async () => values.clear(), setAlarm,
          transaction: async callback => {
            const staged = structuredClone(values); let nextAlarm
            await callback({ get: async key => structuredClone(staged.get(key)), put: async (key,value) => staged.set(key, structuredClone(value)), setAlarm: async time => { nextAlarm = time } })
            values.clear(); for (const [key,value] of staged) values.set(key,value)
            if (nextAlarm !== undefined) await setAlarm(nextAlarm)
          } }
        const ctx = { storage, blockConcurrencyWhile(callback) { const next = queue.then(callback); queue = next.catch(() => {}); return next } }
        entry.instance = new Class(ctx, env); entries.set(id, entry)
      }
      return { fetch: request => entries.get(id).instance.fetch(request) }
    } }
  }
  env.ROOMS = namespace(BattleRoom); env.MATCHMAKING = namespace(Matchmaking)
  return { env, fetch: request => worker.fetch(request, env), close() { for (const timer of timers) clearTimeout(timer); timers.clear() } }
}
