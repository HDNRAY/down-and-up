/**
 * 解压计数器 - 统计面板组件
 * 显示模式环形图、日历热力图、趋势折线图
 * 所有 Canvas 在 ready 时批量初始化，DPR 统一处理
 *
 * 属性：
 *   statsData — 外部传入的统计数据（可选）
 * 事件：
 *   close — 关闭面板
 */

import { formatCount } from '../../utils/renderer'
import statsStorage from '../../utils/storage'

Component({
  properties: {
    statsData: {
      type: Object,
      value: {},
      observer: '_onStatsDataChange',
    },
  },

  data: {
    totalDisplay: '0',
    trendDays: 7,
  },

  lifetimes: {
    attached() {
      this._canvasCtxs = {} // { id: { ctx, w, h, dpr } }
      this._data = null
    },

    ready() {
      this._loadData()
      this._initAllCanvases()
    },
  },

  methods: {
    /** 从存储加载数据 */
    _loadData() {
      const today = statsStorage.getToday()
      const total = today.total || 0
      const history = statsStorage.getHistory(30)

      this._data = {
        todayTotal: total,
        modeTotals: {
          press: today.press || 0,
          scroll: today.scroll || 0,
          pull: today.pull || 0,
        },
        history,
      }

      this.setData({
        totalDisplay: formatCount(total),
      })
    },

    /** 属性变化回调 */
    _onStatsDataChange() {
      this._loadData()
      // 等待 DOM 更新后再绘制
      setTimeout(() => this._drawAll(), 80)
    },

    /* ========================================
     * Canvas 批量初始化
     * ======================================== */

    _initAllCanvases() {
      const ids = [
        'stats-close-canvas', 'ring-press', 'ring-scroll', 'ring-pull',
        'heatmap-canvas', 'trend-canvas', 'share-canvas',
      ]
      let pending = ids.length

      ids.forEach((id) => {
        const query = this.createSelectorQuery()
        query.select(`#${id}`)
          .fields({ node: true, size: true })
          .exec((res) => {
            if (res && res[0] && res[0].node) {
              const node = res[0].node
              const ctx = node.getContext('2d')
              const dpr = wx.getWindowInfo().pixelRatio
              const w = res[0].width
              const h = res[0].height

              node.width = w * dpr
              node.height = h * dpr
              ctx.scale(dpr, dpr)

              this._canvasCtxs[id] = { ctx, w, h, dpr, node }
            }

            pending--
            if (pending === 0) {
              this._drawAll()
            }
          })
      })
    },

    /** 获取 Canvas 上下文 */
    _ctx(id) {
      return this._canvasCtxs[id] || null
    },

    /** 绘制所有图表 */
    _drawAll() {
      this._drawCloseButton()
      this._drawRingCharts()
      this._drawHeatmap()
      this._drawTrendChart()
      this._drawShareIcon()
    },

    /* ─── 关闭按钮 ✕ ─── */
    _drawCloseButton() {
      const info = this._ctx('stats-close-canvas')
      if (!info) return
      const { ctx, w, h } = info

      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = '#EAEAEA'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'

      const p = w * 0.25
      ctx.beginPath()
      ctx.moveTo(p, p)
      ctx.lineTo(w - p, h - p)
      ctx.moveTo(w - p, p)
      ctx.lineTo(p, h - p)
      ctx.stroke()
    },

    /* ─── 三个模式环形图 ─── */
    _drawRingCharts() {
      const modes = ['press', 'scroll', 'pull']
      const colors = ['#4CAF50', '#78909C', '#FFC107']
      const labels = ['●', '⌇', '↕']
      const totals = (this._data && this._data.modeTotals) || { press: 0, scroll: 0, pull: 0 }
      const maxVal = Math.max(totals.press || 1, totals.scroll || 1, totals.pull || 1)

      modes.forEach((mode, idx) => {
        const info = this._ctx(`ring-${mode}`)
        if (!info) return
        const { ctx, w, h } = info

        const cx = w / 2
        const cy = h / 2
        const r = Math.min(w, h) * 0.38
        const val = totals[mode] || 0
        const ratio = val / maxVal

        ctx.clearRect(0, 0, w, h)

        // 背景环
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 6
        ctx.stroke()

        // 前景环
        if (ratio > 0) {
          ctx.beginPath()
          ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio)
          ctx.strokeStyle = colors[idx]
          ctx.lineWidth = 6
          ctx.lineCap = 'round'
          ctx.stroke()
        }

        // 中心数字
        ctx.fillStyle = '#EAEAEA'
        ctx.font = `bold ${Math.round(w * 0.22)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(val), cx, cy)

        // 下方标签
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
        ctx.font = `${Math.round(w * 0.16)}px sans-serif`
        ctx.fillText(labels[idx], cx, cy + r + 16)
      })
    },

    /* ─── 热力图 ─── */
    _drawHeatmap() {
      const info = this._ctx('heatmap-canvas')
      if (!info) return
      const { ctx, w, h } = info

      ctx.clearRect(0, 0, w, h)

      const cols = 7
      const rows = 5
      const gap = 2
      const cellSize = Math.floor((Math.min(w, h) - gap * (rows - 1) - 8) / rows)

      // 计算起始位置（居中）
      const totalGridW = cols * (cellSize + gap)
      const totalGridH = rows * (cellSize + gap)
      const startX = Math.floor((w - totalGridW) / 2)
      const startY = Math.floor((h - totalGridH) / 2)

      const fullHistory = statsStorage.getHistory(35)
      let maxTotal = 1
      fullHistory.forEach(d => { if (d.total > maxTotal) maxTotal = d.total })

      // 绘制格子（最近的在右下角）
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col
          if (idx >= fullHistory.length) {
            // 空白格子
            const gx = startX + col * (cellSize + gap)
            const gy = startY + row * (cellSize + gap)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
            ctx.fillRect(gx, gy, cellSize, cellSize)
            continue
          }

          // 从尾部往前取（最近的数据在数组末尾）
          const dataIdx = fullHistory.length - 1 - idx
          const dayData = fullHistory[dataIdx]
          const intensity = dayData ? (dayData.total / maxTotal) : 0

          const gx = startX + col * (cellSize + gap)
          const gy = startY + row * (cellSize + gap)
          const alpha = 0.05 + intensity * 0.7

          ctx.fillStyle = `rgba(76, 175, 80, ${alpha})`
          ctx.fillRect(gx, gy, cellSize, cellSize)
        }
      }
    },

    /* ─── 趋势折线图 ─── */
    _drawTrendChart() {
      const info = this._ctx('trend-canvas')
      if (!info) return
      const { ctx, w, h } = info

      ctx.clearRect(0, 0, w, h)

      const days = this.data.trendDays
      const history = statsStorage.getHistory(days)

      let maxVal = 1
      history.forEach(d => { if (d.total > maxVal) maxVal = d.total })

      const pad = { l: 6, r: 6, t: 10, b: 6 }
      const chartW = w - pad.l - pad.r
      const chartH = h - pad.t - pad.b

      if (history.length < 2) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('—', w / 2, h / 2)
        return
      }

      // 折线
      ctx.beginPath()
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const points = history.map((d, i) => ({
        x: pad.l + (i / (history.length - 1)) * chartW,
        y: pad.t + chartH - ((d.total || 0) / maxVal) * chartH,
        val: d.total || 0,
      }))

      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()

      // 面积填充
      const last = points[points.length - 1]
      ctx.lineTo(last.x, pad.t + chartH)
      ctx.lineTo(pad.l, pad.t + chartH)
      ctx.closePath()

      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + chartH)
      grad.addColorStop(0, 'rgba(76, 175, 80, 0.15)')
      grad.addColorStop(1, 'rgba(76, 175, 80, 0)')
      ctx.fillStyle = grad
      ctx.fill()

      // 数据点
      points.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
        ctx.fillStyle = '#4CAF50'
        ctx.fill()
      })
    },

    /* ─── 分享图标 ─── */
    _drawShareIcon() {
      const info = this._ctx('share-canvas')
      if (!info) return
      const { ctx, w, h } = info

      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = '#EAEAEA'
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const cx = w / 2
      // 方框（卡片）
      const bx = w * 0.2, by = h * 0.35
      const bw = w * 0.6, bh = h * 0.4
      ctx.strokeRect(bx, by, bw, bh)

      // 从卡片中心向上的箭头
      ctx.beginPath()
      ctx.moveTo(cx, by)
      ctx.lineTo(cx - 6, by + 8)
      ctx.moveTo(cx, by)
      ctx.lineTo(cx + 6, by + 8)
      ctx.stroke()

      // 弧线（代表分享辐射）
      ctx.beginPath()
      ctx.arc(cx, by + 4, 10, -Math.PI * 0.5, Math.PI * 0.5, false)
      ctx.stroke()
    },

    /* ─── 事件处理 ─── */

    onOverlayTap() {
      this.triggerEvent('close')
    },

    onClose() {
      this.triggerEvent('close')
    },

    onTrendTabTap(e) {
      const days = parseInt(e.currentTarget.dataset.days, 10)
      this.setData({ trendDays: days })
      setTimeout(() => this._drawTrendChart(), 50)
    },

    onShare() {
      // 简化：通知用户分享（实际需调用 wx.shareAppMessage）
      wx.showToast({ title: '截图已保存', icon: 'none' })
    },
  },
})
