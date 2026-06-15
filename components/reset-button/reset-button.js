/**
 * 解压计数器 - 归零按钮组件
 * 小圆形按钮，暖橙红渐变，逆时针回转箭头图标
 * 按下：弹性缩放 + 音效 + light震动 → 归零触发：沙沙音效 + heavy震动 + 数字动画
 *
 * 事件：
 *   reset - 归零操作触发，父页面监听
 */

// 动态引入音频和震动（解决 Component 中无法直接用 import）
let audioEngine = null
let hapticEngine = null

Component({
    properties: {},

    data: {
        pressed: false,
    },

    lifetimes: {
        attached() {
            // 延迟引用 utils（小程序 Component 路径需从 app 上下文解析）
            this._initAudioAndHaptic()
        },
        ready() {
            this._initCanvas()
            this._drawButton(1)
        },
    },

    methods: {
        /** 初始化音频和震动引擎引用 */
        _initAudioAndHaptic() {
            try {
                // 通过全局获取（在 app.js 或页面中挂载）
                const app = getApp()
                if (app.audioEngine) {
                    audioEngine = app.audioEngine
                }
                if (app.hapticEngine) {
                    hapticEngine = app.hapticEngine
                }
            } catch (e) {
                // 静默 — 音频/震动是增强功能，不阻塞交互
            }
        },

        /** 初始化 Canvas */
        _initCanvas() {
            const query = this.createSelectorQuery()
            query
                .select('#reset-btn-canvas')
                .fields({ node: true, size: true })
                .exec((res) => {
                    if (!res || !res[0]) return
                    const node = res[0].node
                    this._canvas = node
                    this._ctx = node.getContext('2d')

                    const dpr = wx.getWindowInfo().pixelRatio
                    this._dpr = dpr
                    node.width = res[0].width * dpr
                    node.height = res[0].height * dpr
                    this._ctx.scale(dpr, dpr)
                    this._size = res[0].width
                    this._drawButton(1)
                })
        },

        /**
         * 绘制归零按钮
         * @param {number} scale - 缩放比例（按下 0.9，松开 1.0）
         */
        _drawButton(scale) {
            const ctx = this._ctx
            if (!ctx) return

            const size = this._size || 72
            const cx = size / 2
            const cy = size / 2
            const r = size * 0.42 * scale

            ctx.clearRect(0, 0, size, size)

            // ─── 圆形主体：深红色 ───
            ctx.save()
            ctx.shadowColor = 'rgba(180, 20, 20, 0.5)'
            ctx.shadowBlur = 10
            ctx.shadowOffsetY = 2

            const grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r)
            grad.addColorStop(0, '#EE4444')
            grad.addColorStop(1, '#991111')

            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.fillStyle = grad
            ctx.fill()
            ctx.restore()

            // ─── 表面高光 ───
            ctx.save()
            ctx.beginPath()
            ctx.ellipse(cx - r * 0.2, cy - r * 0.25, r * 0.3, r * 0.22, -0.5, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
            ctx.fill()
            ctx.restore()

            // ─── 逆时针回转箭头图标 ───
            ctx.save()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
            ctx.lineWidth = 2.5
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            const arrowR = r * 0.45
            // 圆弧（约 270° 逆时针）
            ctx.beginPath()
            ctx.arc(cx, cy, arrowR, -Math.PI * 0.3, Math.PI * 0.8, true) // anticlockwise
            ctx.stroke()

            // 箭头头部
            const tipAngle = Math.PI * 0.8
            const tipX = cx + Math.cos(tipAngle) * arrowR
            const tipY = cy + Math.sin(tipAngle) * arrowR
            ctx.beginPath()
            ctx.moveTo(tipX, tipY)
            ctx.lineTo(tipX + 4, tipY - 5)
            ctx.lineTo(tipX - 5, tipY - 2)
            ctx.closePath()
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
            ctx.fill()
            ctx.restore()
        },

        /** 按下 */
        onTouchStart() {
            this.setData({ pressed: true })
            this._drawButton(0.9)

            // 归零按钮按下音效 + 震动
            if (audioEngine && audioEngine.play) {
                audioEngine.play('resetPress')
            }
            if (hapticEngine && hapticEngine.light) {
                hapticEngine.light()
            }
        },

        /** 松开 → 触发归零 */
        onTouchEnd() {
            this.setData({ pressed: false })
            this._drawButton(1)

            // 触发归零事件给父页面
            this.triggerEvent('reset')

            // 归零沙沙音效 + heavy 震动（由父页面 onReset 触发）
            // 父页面 onReset 中会播放 resetSand 和 heavy 震动
        },

        /**
         * 播放归零反馈（父页面调用）
         * 供 index.js 的 onReset 调用
         */
        playResetFeedback() {
            if (audioEngine && audioEngine.play) {
                audioEngine.play('resetSand')
            }
            if (hapticEngine && hapticEngine.heavy) {
                hapticEngine.heavy()
            }
        },
    },
})
