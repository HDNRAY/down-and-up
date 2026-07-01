/**
 * 统计页面 — 3 Panel
 * 1. 大数字：今日总计 / 各模式 / 本周本月今年
 * 2. 星轨图：每天一颗星，螺旋排列，缓缓自转
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
        this._initBackArrow()
        this._initStarChart()
        this._startLoadingAnimation()
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
     * 返回箭头
     * ======================================== */

    _initBackArrow() {
        const query = wx.createSelectorQuery()
        query.select('#back-arrow-canvas').fields({ node: true, size: true }).exec((res) => {
            if (!res || !res[0]) return
            const node = res[0].node
            const ctx = node.getContext('2d')
            const dpr = wx.getWindowInfo().pixelRatio
            const w = res[0].width
            const h = res[0].height
            node.width = w * dpr
            node.height = h * dpr
            ctx.scale(dpr, dpr)

            ctx.clearRect(0, 0, w, h)
            ctx.strokeStyle = 'rgba(234, 234, 234, 0.6)'
            ctx.lineWidth = 2
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            // ← 箭头
            const cx = w / 2, cy = h / 2
            const len = w * 0.25
            ctx.beginPath()
            ctx.moveTo(cx + len, cy - len)
            ctx.lineTo(cx - len * 0.3, cy)
            ctx.lineTo(cx + len, cy + len)
            ctx.stroke()
        })
    },

    /* ========================================
     * Loading 动画（星轨计算前的占位）
     * ======================================== */

    _startLoadingAnimation() {
        this._loadingAnimId = null
        this._loadingStart = Date.now()

        const loop = () => {
            try {
                const ctx = this._starCtx
                const w = this._starW
                const h = this._starH
                if (!ctx || !w || !h) return

                const t = (Date.now() - this._loadingStart) / 800
                const pulse = Math.sin(t * Math.PI) * 0.3 + 0.4  // 0.1~0.7

                ctx.clearRect(0, 0, w, h)
                const cx = w / 2, cy = h / 2
                const r = Math.min(w, h) * 0.06

                // 光晕
                ctx.beginPath()
                ctx.arc(cx, cy, r * 3, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.06})`
                ctx.fill()

                // 圆点
                ctx.beginPath()
                ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`
                ctx.fill()
            } catch (e) {
                console.warn('Loading anim error:', e)
            }

            if (this._loadingAnimId !== 'STOP') {
                this._loadingAnimId = setTimeout(loop, 50)
            }
        }
        loop()
    },

    _stopLoadingAnimation() {
        this._loadingAnimId = 'STOP'
        // 清除 loading 画的残影
        const ctx = this._starCtx
        if (ctx && this._starW && this._starH) {
            ctx.clearRect(0, 0, this._starW, this._starH)
        }
    },

    /* ========================================
     * PANEL 2 — 星空图 (Canvas)
     * ======================================== */

    _initStarChart() {
        this._starCanvas = null
        this._starCtx = null
        this._starAnimId = null
        this._starRotation = 0

        const query = wx.createSelectorQuery()
        query
            .select('#river-canvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res || !res[0]) return
                const canvas = res[0].node
                const ctx = canvas.getContext('2d')
                const dpr = wx.getWindowInfo().pixelRatio
                const w = res[0].width
                const h = res[0].height

                canvas.width = w * dpr
                canvas.height = h * dpr
                ctx.scale(dpr, dpr)

                this._starCanvas = canvas
                this._starCtx = ctx
                this._starW = w
                this._starH = h

                // 延迟计算，不阻碍页面切换
                setTimeout(() => {
                    this._starData = this._buildStarData()
                    this._stopLoadingAnimation()
                    this._startStarAnimation()

                    // 分析数据
                    const data = statsStorage.getHourlyBuckets()
                    if (data) {
                        const insights = analyze(data, statsStorage.getAllLogs())
                        this.setData({ insights })
                    }
                }, 0)
            })
    },

    /** 构造星图数据：只取有活动的天，沿黄金角螺旋排列 */
    _buildStarData() {
        const maxR = Math.min(this._starW, this._starH) / 2 - 12

        // 多取一些天，过滤掉没活动的
        const history = statsStorage.getHistory(60)
        let activeDays = history.filter(d => (d.total || 0) > 0)

        // 根据活跃天数自适应间距：星少→间距大填满画布，星多→间距小
        const count = activeDays.length
        const SPACING = Math.max(4, maxR / Math.max(count, 3))  // 无上限，让稀的星也能撑满画布
        const MAX_VISIBLE = Math.floor(maxR / SPACING)
        activeDays = activeDays.slice(-MAX_VISIBLE)

        // 今天在数组末尾，取最近 7 个自然日标记为 recent
        const todayStr = this._todayStr()
        const recentStartIdx = activeDays.findIndex(d => {
            // 找 7 天前的分界
            const d7 = new Date()
            d7.setDate(d7.getDate() - 7)
            return d.date >= this._fmtDate(d7)
        })

        let maxCount = 1
        for (const d of activeDays) if (d.total > maxCount) maxCount = d.total

        const GOLDEN_ANGLE = 137.508 * Math.PI / 180
        const modeRgb = {
            press:  [102, 187, 106],
            pull:   [255, 213,  79],
            bounce: [ 66, 165, 245],
            reset:  [255, 112,  67],
        }

        const stars = activeDays.map((day, idx) => {
            const angle = idx * GOLDEN_ANGLE
            const radius = (idx + 1) * SPACING
            const total = day.total || 0
            const ratio = maxCount > 0 ? total / maxCount : 0
            const size = 3 + Math.sqrt(ratio) * 11

            const sorted = ['press', 'pull', 'bounce', 'reset']
                .map(k => ({ key: k, count: day[k] || 0 }))
                .filter(m => m.count > 0)
                .sort((a, b) => b.count - a.count)

            const colors = sorted.map(m => `rgb(${modeRgb[m.key].join(',')})`)

            return {
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
                count: total,
                ratio,
                colors,
                size,
                recent: recentStartIdx >= 0 && idx >= recentStartIdx,
            }
        })

        return { stars, maxCount }
    },

    _todayStr() {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    },

    _fmtDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    },

    /** 启动星空动画循环 */
    _startStarAnimation() {
        let lastTime = Date.now()

        const loop = () => {
            try {
                const now = Date.now()
                const dt = Math.min((now - lastTime) / 1000, 0.05)
                lastTime = now

                this._starRotation += dt * 0.03 // 每帧转 0.03 rad ≈ 1.7°/s

                this._renderStars()
            } catch (e) {
                console.warn('Star animation error:', e)
                lastTime = Date.now()
            }

            if (this._starCanvas && this._starCanvas.requestAnimationFrame) {
                this._starAnimId = this._starCanvas.requestAnimationFrame(loop)
            }
        }

        if (this._starCanvas && this._starCanvas.requestAnimationFrame) {
            this._starAnimId = this._starCanvas.requestAnimationFrame(loop)
        } else {
            loop()
        }
    },

    /** 渲染星轨图 */
    _renderStars() {
        const ctx = this._starCtx
        const w = this._starW
        const h = this._starH
        if (!ctx || !w || !h) return

        // 安全守卫：数据还没准备好
        if (!this._starData || !this._starData.stars) return

        ctx.clearRect(0, 0, w, h)
        ctx.save()

        const cx = w / 2
        const cy = h / 2

        // 全图移到画布中心，缓缓自转
        ctx.translate(cx, cy)
        ctx.rotate(this._starRotation)

        const stars = this._starData.stars
        if (stars.length < 2) {
            ctx.restore()
            return
        }

        // ─── 连线：沿时间顺序连接有游玩的天（无空白节点） ───
        for (let i = 1; i < stars.length; i++) {
            ctx.beginPath()
            ctx.moveTo(stars[i - 1].x, stars[i - 1].y)
            ctx.lineTo(stars[i].x, stars[i].y)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
            ctx.lineWidth = 0.5
            ctx.stroke()
        }

        // 近 7 天连线更亮
        const recentStars = stars.filter(s => s.recent)
        for (let i = 1; i < recentStars.length; i++) {
            ctx.beginPath()
            ctx.moveTo(recentStars[i - 1].x, recentStars[i - 1].y)
            ctx.lineTo(recentStars[i].x, recentStars[i].y)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
            ctx.lineWidth = 0.7
            ctx.stroke()
        }

        // ─── 星星（年轮式同心环） ───
        const pulse = Math.sin(Date.now() / 800) * 0.06 + 0.94  // 呼吸幅度减半

        for (const star of stars) {
            const s = Math.max(star.size * pulse, 2)
            const cols = star.colors
            if (!cols || cols.length === 0) continue

            // 光晕（用主色）
            if (s > 5) {
                ctx.beginPath()
                ctx.arc(star.x, star.y, s * 1.8, 0, Math.PI * 2)
                ctx.fillStyle = cols[0].replace('rgb', 'rgba').replace(')', ',0.1)')
                ctx.fill()
            }

            // 年轮：最外层 = 最多模式，最内层 = 最少模式
            // 半径比例：外圈 1.0, 中圈 0.6, 内圈 0.3
            const rings = [
                { r: s,        color: cols[0] },
                { r: s * 0.6,  color: cols.length > 1 ? cols[1] : cols[0] },
                { r: s * 0.3,  color: cols.length > 2 ? cols[2] : (cols[1] || cols[0]) },
            ]

            ctx.shadowColor = cols[0].replace('rgb', 'rgba').replace(')', ',0.4)')
            ctx.shadowBlur = s * 1.5

            for (const ring of rings) {
                if (ring.r < 1.5) continue
                ctx.beginPath()
                ctx.arc(star.x, star.y, ring.r, 0, Math.PI * 2)
                ctx.fillStyle = ring.color
                ctx.fill()
            }

            ctx.shadowBlur = 0

            // 白色高亮芯
            if (s > 4) {
                ctx.beginPath()
                ctx.arc(star.x, star.y, Math.max(s * 0.2, 1), 0, Math.PI * 2)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
                ctx.fill()
            }
        }

        ctx.restore()
    },

    onUnload() {
        if (this._starAnimId && this._starCanvas) {
            this._starCanvas.cancelAnimationFrame(this._starAnimId)
            this._starAnimId = null
        }
    },

    /* ========================================
     * 通用
     * ======================================== */

    onBack() {
        wx.navigateBack()
    },

    _fmt(n) {
        if (n === 0 || n === undefined || n === null) return '0'
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    },
})
