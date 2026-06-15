/**
 * 统计独立页面
 */
import { formatCount } from '../../utils/renderer'
import statsStorage from '../../utils/storage'

Page({
  data: {
    totalDisplay: '0',
    trendDays: 7,
  },

  onLoad() {
    this._canvasCtxs = {}
    this._loadData()
  },

  onReady() {
    this._initAllCanvases()
  },

  _loadData() {
    const today = statsStorage.getToday()
    this.setData({ totalDisplay: formatCount(today.total || 0) })
  },

  _initAllCanvases() {
    const ids = ['back-canvas', 'ring-press', 'ring-scroll', 'ring-pull',
      'heatmap-canvas', 'trend-canvas']
    let pending = ids.length

    ids.forEach((id) => {
      const query = wx.createSelectorQuery()
      query.select(`#${id}`).fields({ node: true, size: true }).exec((res) => {
        if (res && res[0] && res[0].node) {
          const node = res[0].node
          const ctx = node.getContext('2d')
          const dpr = wx.getWindowInfo().pixelRatio
          const w = res[0].width
          const h = res[0].height
          node.width = w * dpr
          node.height = h * dpr
          ctx.scale(dpr, dpr)
          this._canvasCtxs[id] = { ctx, w, h }
        }
        pending--
        if (pending === 0) this._drawAll()
      })
    })
  },

  _ctx(id) { return this._canvasCtxs[id] },

  _drawAll() {
    this._drawBackButton()
    this._drawRings()
    this._drawHeatmap()
    this._drawTrend()
  },

  _drawBackButton() {
    const info = this._ctx('back-canvas')
    if (!info) return
    const { ctx, w, h } = info
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#EAEAEA'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    // ← 左箭头
    const cx = w / 2, cy = h / 2
    ctx.beginPath()
    ctx.moveTo(cx + 6, cy - 6)
    ctx.lineTo(cx - 4, cy)
    ctx.lineTo(cx + 6, cy + 6)
    ctx.stroke()
  },

  _drawRings() {
    const modes = ['press', 'scroll', 'pull']
    const colors = ['#4CAF50', '#78909C', '#FFC107']
    const labels = ['●', '⌇', '↕']
    const today = statsStorage.getToday()
    const totals = { press: today.press || 0, scroll: today.scroll || 0, pull: today.pull || 0 }
    const maxVal = Math.max(totals.press || 1, totals.scroll || 1, totals.pull || 1)

    modes.forEach((mode, idx) => {
      const info = this._ctx(`ring-${mode}`)
      if (!info) return
      const { ctx, w, h } = info
      const cx = w / 2, cy = h / 2, r = w * 0.35
      const val = totals[mode] || 0
      const ratio = val / maxVal

      ctx.clearRect(0, 0, w, h)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 8
      ctx.stroke()

      if (ratio > 0) {
        ctx.beginPath()
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio)
        ctx.strokeStyle = colors[idx]
        ctx.lineWidth = 8
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      ctx.fillStyle = '#EAEAEA'
      ctx.font = `bold ${Math.round(w * 0.24)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(val), cx, cy)

      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = `${Math.round(w * 0.16)}px sans-serif`
      ctx.fillText(labels[idx], cx, cy + r + 18)
    })
  },

  _drawHeatmap() {
    const info = this._ctx('heatmap-canvas')
    if (!info) return
    const { ctx, w, h } = info
    ctx.clearRect(0, 0, w, h)

    const cols = 7, rows = 5, gap = 2
    const cellSize = Math.floor((Math.min(w, h) - 8) / rows)
    const totalW = cols * (cellSize + gap)
    const totalH = rows * (cellSize + gap)
    const startX = Math.floor((w - totalW) / 2)
    const startY = Math.floor((h - totalH) / 2)

    const history = statsStorage.getHistory(35)
    let maxTotal = 1
    history.forEach(d => { if (d.total > maxTotal) maxTotal = d.total })

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        const gx = startX + col * (cellSize + gap)
        const gy = startY + row * (cellSize + gap)
        if (idx >= history.length) {
          ctx.fillStyle = 'rgba(255,255,255,0.03)'
          ctx.fillRect(gx, gy, cellSize, cellSize)
          continue
        }
        const dayData = history[history.length - 1 - idx]
        const alpha = 0.05 + (dayData.total / maxTotal) * 0.7
        ctx.fillStyle = `rgba(76,175,80,${alpha})`
        ctx.fillRect(gx, gy, cellSize, cellSize)
      }
    }
  },

  _drawTrend() {
    const info = this._ctx('trend-canvas')
    if (!info) return
    const { ctx, w, h } = info
    ctx.clearRect(0, 0, w, h)

    const days = this.data.trendDays
    const history = statsStorage.getHistory(days)
    if (history.length < 2) return

    let maxVal = 1
    history.forEach(d => { if (d.total > maxVal) maxVal = d.total })

    const pad = { l: 8, r: 8, t: 10, b: 8 }
    const cw = w - pad.l - pad.r
    const ch = h - pad.t - pad.b

    const points = history.map((d, i) => ({
      x: pad.l + (i / (history.length - 1)) * cw,
      y: pad.t + ch - ((d.total || 0) / maxVal) * ch,
    }))

    ctx.beginPath()
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 2
    points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y) })
    ctx.stroke()

    ctx.lineTo(points[points.length - 1].x, pad.t + ch)
    ctx.lineTo(pad.l, pad.t + ch)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch)
    grad.addColorStop(0, 'rgba(76,175,80,0.15)')
    grad.addColorStop(1, 'rgba(76,175,80,0)')
    ctx.fillStyle = grad
    ctx.fill()

    points.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
      ctx.fillStyle = '#4CAF50'
      ctx.fill()
    })
  },

  onBack() {
    wx.navigateBack()
  },

  onTrendTabTap(e) {
    const days = parseInt(e.currentTarget.dataset.days, 10)
    this.setData({ trendDays: days })
    setTimeout(() => this._drawTrend(), 80)
  },
})
