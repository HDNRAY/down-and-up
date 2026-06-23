/**
 * 拉拽模式 v4 — 答案之书文字带
 *
 * 画面中上方有一个嵌入底座的扁平开口（硬币槽感觉）
 *       开口下方垂着一条皮带，向下拖拽把皮带拉出
 *       皮带上显示随机"答案之书"短句，文字随拉环移动
 *       拉到底（文字全部出现）触发 +1
 *       松手弹回
 *
 * 交互：整个画布均可拖拽
 */

import { Spring } from './spring.js'
import { clearCanvas, pathRoundRect, drawModeHint } from './renderer.js'
import { pickAnswer } from './answers.js'

export class PullMode {
    constructor(config) {
        this.width = config.width
        this.height = config.height
        this.audio = config.audioEngine
        this.haptic = config.hapticEngine
        this.onCountChange = config.onCountChange

        // 布局缓存（由 _calcLayout 填充）
        this.cx = 0
        this.slotY = 0
        this.plateW = 0
        this.plateH = 0
        this.slotW = 0
        this.slotH = 0
        this.MAX_PULL = 0
        this.strapW = 0

        // 拖拽状态
        this.pullOffset = 0
        this._isDragging = false
        this._touchId = null
        this._dragStartY = 0

        // 弹回弹簧
        this.snapSpring = new Spring({ stiffness: 500, damping: 14, mass: 1 })
        this._isSnapping = false

        // 答案之书
        this.currentAnswer = ''
        this._fullPullCounted = false

        // 末端震动
        this._endVibeTimer = 0
        this.MIN_VISIBLE = 20

        // 玩法提示
        this.hintText = '拉开答案'
        this._hintCount = 0
        this._hintFlashTime = 0
    }

    _calcLayout() {
        const w = this.width,
            h = this.height
        this.cx = w / 2
        this.slotY = h * 0.24
        this.plateW = w * 0.46
        this.plateH = 26
        this.slotW = w * 0.4
        this.slotH = 8
        this.MAX_PULL = h * 0.25
        this.strapW = this.slotW * 0.8
    }

    update(dt) {
        this._calcLayout()
        const sd = Math.min(dt, 0.05)

        if (this._isSnapping) {
            this.snapSpring.update(sd)
            this.pullOffset = this.snapSpring.value

            if (this.snapSpring.isAtRest) {
                this.pullOffset = 0
                this._isSnapping = false
                this.snapSpring.setValue(0)
            }
        } else if (this._isDragging) {
            // 拉到底才 +1（文字全部露出时）
            const bottomThreshold = this.MAX_PULL * 0.92
            if (this.pullOffset >= bottomThreshold && !this._fullPullCounted) {
                this._fullPullCounted = true
                this._hintCount++
                this._hintFlashTime = Date.now()
                if (this.onCountChange) this.onCountChange(1)
                // 双连 heavy 震动 — 略过频率限制
                if (this.haptic) {
                    this.haptic.heavy()
                    setTimeout(() => {
                        if (this.haptic) this.haptic.heavy()
                    }, 30)
                }
                if (this.audio) this.audio.play('snap')
            }

            // 末端连续轻震
            const t = this.pullOffset / this.MAX_PULL
            if (t > 0.7) {
                const interval = Math.max(50, 300 - (t - 0.7) * 850)
                this._endVibeTimer += dt * 1000
                if (this._endVibeTimer > interval) {
                    this._endVibeTimer = 0
                    if (this.haptic) this.haptic.light()
                }
            } else {
                this._endVibeTimer = 0
            }
        }
    }

    render(ctx) {
        try {
            const w = this.width,
                h = this.height
            clearCanvas(ctx, w, h)

            drawModeHint(ctx, this.hintText, this._hintCount, this.cx, this.height * 0.8, this._hintFlashTime)

            this._drawPlate(ctx)
            this._drawBag(ctx)
            if (this.currentAnswer && this._isDragging && this.pullOffset > this.MAX_PULL * 0.88) {
                this._drawAnswerText(ctx)
            }
        } catch (e) {
            console.warn('PullMode.render error:', e)
        }
    }

    /* ─── 底座板 + 开口 ─── */
    _drawPlate(ctx) {
        const cx = this.cx
        const py = this.slotY
        const pw = this.plateW,
            ph = this.plateH
        const r = ph / 2

        // 底座主体
        ctx.save()
        ctx.beginPath()
        pathRoundRect(ctx, cx - pw / 2, py - ph / 2, pw, ph, r)
        const g = ctx.createLinearGradient(cx, py - ph / 2, cx, py + ph / 2)
        g.addColorStop(0, '#4A3C2E')
        g.addColorStop(0.45, '#2A2018')
        g.addColorStop(1, '#1A140E')
        ctx.fillStyle = g
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 12
        ctx.shadowOffsetY = 4
        ctx.fill()
        ctx.restore()

        // 底座边框
        ctx.save()
        ctx.beginPath()
        pathRoundRect(ctx, cx - pw / 2, py - ph / 2, pw, ph, r)
        ctx.strokeStyle = 'rgba(255,220,140,0.12)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()

        // 开口（深色槽）
        const sh = this.slotH,
            sw = this.slotW
        const sr = sh / 2
        ctx.save()
        ctx.beginPath()
        pathRoundRect(ctx, cx - sw / 2, py - sh / 2, sw, sh, sr)
        ctx.fillStyle = '#0A0A0A'
        ctx.shadowColor = 'rgba(0,0,0,0.9)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetY = 2
        ctx.fill()
        ctx.restore()
    }

    /* ─── 皮带 ─── */
    _drawBag(ctx) {
        const cx = this.cx
        const pull = this.pullOffset
        const displayPull = pull + this.MIN_VISIBLE

        const topY = this.slotY
        const sw = this.strapW
        const half = sw / 2
        const bottomY = topY + displayPull
        const bodyH = displayPull

        if (bodyH < 2) return

        ctx.save()

        // 皮带填充
        const strapColor = '#D4A030'
        ctx.fillStyle = strapColor
        ctx.fillRect(cx - half, topY, sw, bodyH)

        // 拉环（跑道形，宽度与皮带一致）
        const loopH = sw * 0.4
        const loopR2 = sw * 0.15
        ctx.beginPath()
        pathRoundRect(ctx, cx - half, bottomY + 3, sw, loopH, loopR2)
        ctx.strokeStyle = strapColor
        ctx.lineWidth = 24
        ctx.stroke()

        ctx.restore()
    }

    /* ─── 答案文字（随拉环整体移动 + clip 裁剪） ─── */
    _drawAnswerText(ctx) {
        const cx = this.cx
        const pull = this.pullOffset
        const displayPull = pull + this.MIN_VISIBLE

        const topY = this.slotY
        const sw = this.strapW
        const half = sw / 2
        const bodyH = displayPull

        const text = this.currentAnswer

        // 判断是否需要换行
        const wrap = text.length > 6
        const lines = wrap ? this._wrapText(text) : [text]
        const maxLineLen = Math.max(...lines.map((l) => l.length))

        // 计算字号：以最长行为基准
        const maxFontSizeByWidth = sw * 0.15
        const maxFontSizeByLen = (sw / maxLineLen) * 1.5
        let fontSize = Math.min(maxFontSizeByWidth, maxFontSizeByLen)
        fontSize = Math.max(10, Math.min(26, fontSize))

        ctx.save()

        // clip 到皮带矩形区域 — 槽口以上的文字不可见
        ctx.beginPath()
        ctx.rect(cx - half, topY, sw, bodyH)
        ctx.clip()

        // 文字样式
        ctx.fillStyle = '#FFE0A0'
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // 文字阴影
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 3
        ctx.shadowOffsetY = 1

        // 文字竖直居中于皮带区域（随拉环整体移动）
        const lineHeight = fontSize * 1.3
        const totalH = lines.length * lineHeight
        const startY2 = topY + (bodyH - totalH) / 2 + lineHeight / 2
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], cx, startY2 + i * lineHeight)
        }

        ctx.restore()

        // 槽口渐变遮罩（固定位置不随皮带移动）
        // 文字从槽口拉出时经过此区域渐变显现
        ctx.save()
        const fadeHeight = 25
        const fadeGrad = ctx.createLinearGradient(0, topY, 0, topY + fadeHeight)
        fadeGrad.addColorStop(0, 'rgba(212,160,48,1)')
        fadeGrad.addColorStop(0.5, 'rgba(212,160,48,0.6)')
        fadeGrad.addColorStop(1, 'rgba(212,160,48,0)')
        ctx.fillStyle = fadeGrad
        ctx.fillRect(cx - half, topY, sw, fadeHeight)
        ctx.restore()
    }

    /** 将文字按字符均分两行 */
    _wrapText(text) {
        const mid = Math.ceil(text.length / 2)
        return [text.slice(0, mid), text.slice(mid)]
    }

    /* ─── 触摸：整个画布均可拖拽 ─── */

    handleTouchStart(e) {
        try {
            const touch = e.touches[0]
            if (!touch) return
            // 取消任何正在进行的 snap
            this._isSnapping = false
            this.snapSpring.setValue(0)

            this._touchId = touch.identifier
            this._dragStartY = touch.y
            this._isDragging = false
            this._fullPullCounted = false
            this._endVibeTimer = 0

            // 选取新的答案
            this.currentAnswer = pickAnswer()
        } catch (err) {
            console.warn('PullMode.touchStart error:', err)
        }
    }

    handleTouchMove(e) {
        try {
            if (this._touchId === null || this._touchId === undefined) return
            const touch = this._findTouch(e)
            if (!touch) return

            const rawDy = touch.y - this._dragStartY
            if (Math.abs(rawDy) < 6 && !this._isDragging) return
            this._isDragging = true

            // 渐进阻力：拉得越远，手指移动产生效果越小
            const t = Math.min(rawDy / this.MAX_PULL, 1)
            const resistance = 1 - t * 0.55
            const effectiveDy = rawDy * resistance

            this.pullOffset = Math.max(0, Math.min(this.MAX_PULL, effectiveDy))
        } catch (err) {
            console.warn('PullMode.touchMove error:', err)
        }
    }

    handleTouchEnd() {
        try {
            this._touchId = null

            if (!this._isDragging || this.pullOffset < 8) {
                this.pullOffset = 0
                this._isDragging = false
                return
            }

            // 弹回（计数已在拖动时完成）
            this.snapSpring.setValue(this.pullOffset)
            this.snapSpring.velocity = -(this.pullOffset * 3.5 + 80)
            this.snapSpring.target = 0
            this._isSnapping = true
            this._isDragging = false

            if (this.audio) this.audio.play('snap')
        } catch (err) {
            console.warn('PullMode.touchEnd error:', err)
        }
    }

    _triggerHaptic(count) {
        if (!this.haptic) return
        const types = ['light', 'medium', 'heavy']
        const t = types[Math.min(count - 1, 2)]
        if (this.haptic[t]) this.haptic[t]()
        if (count >= 3) {
            setTimeout(() => {
                if (this.haptic && this.haptic.heavy) this.haptic.heavy()
            }, 80)
        }
    }

    reset() {
        this._isDragging = false
        this._touchId = null
        this.pullOffset = 0
        this._isSnapping = false
        this._fullPullCounted = false
        this._endVibeTimer = 0
        this.currentAnswer = ''
        this._hintCount = 0
        this._hintFlashTime = 0
        this.snapSpring.setValue(0)
        this.snapSpring.velocity = 0
    }

    _findTouch(e) {
        if (!e.touches) return null
        for (const t of e.touches) {
            if (t.identifier === this._touchId) return t
        }
        return e.touches[0] || null
    }
}
