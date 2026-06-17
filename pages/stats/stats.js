/**
 * 统计页面 — 3 Panel
 * 1. 大数字：今日总计 / 各模式 / 本周本月今年
 * 2. 主题河流图：从首次使用至今，每小时各模式活动堆积
 * 3. 数据特点：有趣的行为洞察
 */
import statsStorage from '../../utils/storage'
import { analyze } from '../../utils/insights'

const MODES = ['press', 'pull', 'bounce']
const MODE_LABELS = { press: '按', pull: '拉', bounce: '抬' }
const MODE_COLORS = { press: '#4CAF50', pull: '#FFC107', bounce: '#42A5F5', reset: '#FF7043' }
const MODE_ORDER = ['press', 'pull', 'bounce', 'reset']
const MODE_DISPLAY = { press: '按', pull: '拉', bounce: '抬', reset: '归零' }

Page({
    data: {
        // Panel 1
        todayTotal: '0',
        modeCards: [
            { id: 'press', label: '按', value: '0', color: '#4CAF50' },
            { id: 'pull', label: '拉', value: '0', color: '#FFC107' },
            { id: 'bounce', label: '抬', value: '0', color: '#42A5F5' },
            { id: 'reset', label: '归零', value: '0', color: '#FF7043' },
        ],
        periodLabels: ['本周', '本月', '今年', ''],
        periodData: [],
        // Panel 3
        insights: [],
    },

    onLoad() {
        this._loadPanel1()
    },

    onReady() {
        // Canvas 初始化在 onReady 时执行
        this._initRiverChart()
    },

    onShow() {
        this._loadPanel1()
    },

    /* ========================================
     * PANEL 1 — 大数字
     * ======================================== */

    _loadPanel1() {
        const today = statsStorage.getToday()
        this.setData({
            todayTotal: this._fmt(today.total || 0),
            'modeCards[0].value': this._fmt(today.press || 0),
            'modeCards[1].value': this._fmt(today.pull || 0),
            'modeCards[2].value': this._fmt(today.bounce || 0),
            'modeCards[3].value': this._fmt(today.reset || 0),
        })

        // 本周 / 本月 / 今年 / 这辈子 — 仅总计，不拆类型，预格式化
        const ranges = [7, 30, 365, 3650]
        const periodData = ranges.map((days) => {
            const history = statsStorage.getHistory(days)
            let total = 0
            for (const day of history) {
                total += day.total || 0
            }
            return { total: this._fmt(total) }
        })
        this.setData({ periodData })
    },

    /* ========================================
     * PANEL 2 — 主题河流图 (Canvas)
     * ======================================== */

    _initRiverChart() {
        const data = statsStorage.getHourlyBuckets()
        if (!data || data.hourCount < 2) return

        const query = wx.createSelectorQuery()
        query
            .select('#river-canvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res || !res[0]) return
                const canvas = res[0].node
                const ctx = canvas.getContext('2d')
                const dpr = wx.getSystemInfoSync().pixelRatio
                const width = res[0].width
                const height = res[0].height

                canvas.width = width * dpr
                canvas.height = height * dpr
                ctx.scale(dpr, dpr)

                this._renderRiver(ctx, data, width, height)
                // 河流图画完后做 Panel 3 分析
                const insights = analyze(data, statsStorage.getAllLogs())
                this.setData({ insights })
            })
    },

    _renderRiver(ctx, data, w, h) {
        const { buckets } = data
        const n = buckets.length
        if (n < 2) return

        // 上下对称的河流图
        // 上半：PRESS + PULL 从中间向上堆叠
        // 下半：BOUNCE + 归零 从中间向下堆叠
        const upperModes = ['press', 'pull']
        const lowerModes = ['bounce', 'reset']
        const colors = ['#4CAF50', '#FFC107', '#42A5F5', '#FF7043']

        // 计算每小时的堆叠上限和下限
        const upperStack = buckets.map((b) => upperModes.reduce((s, m) => s + (b[m] || 0), 0))
        const lowerStack = buckets.map((b) => lowerModes.reduce((s, m) => s + (b[m] || 0), 0))
        const maxStack = Math.max(...upperStack.map((v, i) => v + lowerStack[i]), 1)

        const centerY = h / 2
        const maxHalfH = Math.max(h / 2 - 8, 10)
        const scale = maxHalfH / maxStack

        // 3-bin moving average
        const smooth = (arr) => {
            const r = new Array(n).fill(0)
            for (let i = 0; i < n; i++) {
                let sum = 0,
                    cnt = 0
                for (let j = -1; j <= 1; j++) {
                    const idx = i + j
                    if (idx >= 0 && idx < n) {
                        sum += arr[idx]
                        cnt++
                    }
                }
                r[i] = sum / cnt
            }
            return r
        }

        // 绘制上半层（先拉再按，离中心最远的先画）
        let cumUpper = new Array(n).fill(0)
        for (const mode of upperModes) {
            const raw = buckets.map((b) => (b[mode] || 0) + cumUpper[b.hour])
            const smoothTop = smooth(raw)

            const topYs = smoothTop.map((v) => centerY - v * scale)
            const botYs = cumUpper.map((v) => centerY - v * scale)

            this._drawLayer(ctx, topYs, botYs, n, w, colors[MODE_ORDER.indexOf(mode)])
            cumUpper = raw
        }

        // 绘制下半层
        let cumLower = new Array(n).fill(0)
        for (const mode of lowerModes) {
            const raw = buckets.map((b) => (b[mode] || 0) + cumLower[b.hour])
            const smoothBot = smooth(raw)

            const topYs = cumLower.map((v) => centerY + v * scale)
            const botYs = smoothBot.map((v) => centerY + v * scale)

            this._drawLayer(ctx, topYs, botYs, n, w, colors[MODE_ORDER.indexOf(mode)])
            cumLower = raw
        }
    },

    /** 绘制一层填充区域 */
    _drawLayer(ctx, topYs, botYs, n, w, color) {
        ctx.beginPath()
        ctx.moveTo(0, topYs[0])

        for (let i = 1; i < n; i++) {
            const x = (i / (n - 1)) * w
            const px = ((i - 1) / (n - 1)) * w
            const cpx = (px + x) / 2
            ctx.bezierCurveTo(cpx, topYs[i - 1], cpx, topYs[i], x, topYs[i])
        }

        const lx = w
        ctx.lineTo(lx, botYs[n - 1])
        for (let i = n - 2; i >= 0; i--) {
            const x = (i / (n - 1)) * w
            const nx = ((i + 1) / (n - 1)) * w
            const cpx = (x + nx) / 2
            ctx.bezierCurveTo(cpx, botYs[i + 1], cpx, botYs[i], x, botYs[i])
        }
        ctx.closePath()

        ctx.fillStyle = color
        ctx.globalAlpha = 0.75
        ctx.fill()
    },

    /* ========================================
     * 通用
     * ======================================== */

    onBack() {
        wx.navigateBack()
    },

    _todayStr() {
        const d = new Date()
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    },

    _fmt(n) {
        if (n === 0 || n === undefined || n === null) return '0'
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    },
})
