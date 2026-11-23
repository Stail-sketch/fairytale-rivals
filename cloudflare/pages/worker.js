// Keep the public URL short while using the existing persistent battle server.
export default {
  fetch(request, env) {
    return new URL(request.url).pathname.startsWith('/api/')
      ? env.GAME_SERVER.fetch(request)
      : env.ASSETS.fetch(request)
  },
}
