// Subscribes to /games/:code/events and reloads the page when state changes.
// Imported as a module on the host/player/spectator pages.

(function () {
  const m = window.location.pathname.match(/\/games\/([^/]+)\//)
  const joinCode = m?.[1]
  if (!joinCode) return

  const url = `/games/${encodeURIComponent(joinCode)}/events`
  try {
    const ev = new EventSource(url)
    // 0 (not Date.now()) so the first event after a fresh page load is never
    // dropped by the dedupe window.
    let lastReload = 0
    ev.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'ready') return
        if (Date.now() - lastReload < 150) return
        lastReload = Date.now()
        window.location.reload()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
})()
