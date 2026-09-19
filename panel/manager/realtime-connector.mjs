// P4：面板实时通道连接器（Q3 裁决：SSE + 版本号轮询兜底）。
//
// 双路径语义（两条路径都有测试，test/panel-v2.test.mjs）：
//   - SSE 在场：事件直达（onEvent），不做轮询；
//   - SSE 断连（onerror）：自动切轮询（onSnapshot 周期拉快照）；
//   - SSE 恢复（onopen，EventSource 原生自动重连）：自动停轮询切回 SSE。
//
// 零 import（浏览器 <script type="module"> 直连可用；Node 测试可注入替身）。
// 数据只经 onEvent/onSnapshot 回调上抛——不持有任何旁路状态。

export function createRealtimeConnector({
  sseUrl,
  snapshotUrl,
  eventNames = [],
  eventSourceFactory = (url) => new EventSource(url),
  fetchFn = (...args) => fetch(...args),
  pollIntervalMs = 3000,
  onSnapshot,
  onEvent,
  onModeChange,
  timers = { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) },
}) {
  let es = null
  let mode = null // 'sse' | 'poll' | 'connecting'（start 时通知 connecting，保证 onModeChange 首态可达）
  let pollTimer = null
  let polling = false
  let stopped = false

  function setMode(next) {
    if (mode === next) return
    mode = next
    try {
      onModeChange?.(next)
    } catch {
      // 回调异常不影响通道本身
    }
  }

  function startPolling() {
    if (polling) return
    polling = true
    const tick = async () => {
      try {
        const response = await fetchFn(snapshotUrl, { cache: 'no-store' })
        const data = await response.json()
        if (data && data.ok) onSnapshot?.(data)
      } catch {
        // 轮询失败：下个周期再试（不崩、不切回 SSE——切回只由 SSE onopen 触发）
      }
    }
    void tick()
    pollTimer = timers.setInterval(tick, pollIntervalMs)
  }

  function stopPolling() {
    if (pollTimer !== null) {
      timers.clearInterval(pollTimer)
      pollTimer = null
    }
    polling = false
  }

  function open() {
    if (stopped) return
    es = eventSourceFactory(sseUrl)
    es.onopen = () => {
      if (stopped) return
      stopPolling()
      setMode('sse')
    }
    es.onerror = () => {
      if (stopped) return
      // 断连：立即降级轮询；EventSource 按服务器 retry 提示自动重连，
      // 重连成功会再触发 onopen → 自动切回。
      startPolling()
      setMode('poll')
    }
    es.onmessage = (message) => {
      if (stopped) return
      try {
        onEvent?.('message', JSON.parse(message.data))
      } catch {
        // 非 JSON 心跳/注释：忽略
      }
    }
    for (const name of eventNames) {
      es.addEventListener(name, (message) => {
        if (stopped) return
        try {
          onEvent?.(name, JSON.parse(message.data))
        } catch {
          // ignore
        }
      })
    }
  }

  return {
    start() {
      open()
      setMode('connecting')
    },
    get mode() {
      return mode
    },
    get polling() {
      return polling
    },
    stop() {
      stopped = true
      stopPolling()
      try {
        es?.close()
      } catch {
        // ignore
      }
      es = null
    },
  }
}
