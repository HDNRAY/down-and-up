/**
 * 拉拽模式 v3 — 扁口皮带
 *
 * 画面中上方有一个嵌入底座的扁平开口（硬币槽感觉）
 *       开口下方垂着一条棕色皮带，向下拖拽把皮带拉出
 *       皮带等宽，底部有一个拉环
 *       皮带有 3 个刻度横线，每拉过一个刻度触发震动
 *       松手弹回，弹回速度/震感与拉距成正比
 *       末端有连续轻震
 *
 * 交互：整个画布均可拖拽
 */

import { Spring } from './spring.js'
import { clearCanvas, pathRoundRect } from './renderer.js'

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
        this.snapSpring = new Spring({ stiffness: 320, damping: 18 })
        this._isSnapping = false

        // 震动粒子
        this.shakeAmt = 0

        // 刻度
        this.DOT_COUNT = 3
        this._lastDotReached = 0
        this._endVibeTimer = 0
        this.MIN_VISIBLE = 20
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
        this._dotSpacing = this.MAX_PULL / this.DOT_COUNT
    }

    update(dt) {
        this._calcLayout()
        const sd = Math.min(dt, 0.05)

        if (this._isSnapping) {
            this.snapSpring.update(sd)
            this.pullOffset = Math.max(0, this.snapSpring.value)

            const settled = (this.snapSpring.isAtRest && this.pullOffset < 0.5) || this.pullOffset < 0.5

            if (settled) {
                this.pullOffset = 0
                this._isSnapping = false
                this.snapSpring.setValue(0)
                this.shakeAmt = 0
            }
        } else if (this._isDragging) {
            // 逐格计数 + 震动
            const dot = Math.floor(this.pullOffset / this._dotSpacing)
            if (dot > this._lastDotReached && dot <= this.DOT_COUNT) {
                const delta = dot - this._lastDotReached
                this._lastDotReached = dot
                if (this.onCountChange) this.onCountChange(delta)
                if (this.haptic) {
                    const v = ['light', 'medium', 'heavy']
                    this.haptic[v[Math.min(dot - 1, 2)]]()
                }
                if (this.audio) this.audio.play('click')
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

        if (this.shakeAmt > 0.5) {
            this.shakeAmt *= Math.pow(0.8, dt * 60)
        } else {
            this.shakeAmt = 0
        }
    }

    render(ctx) {
        try {
            const w = this.width,
                h = this.height
            clearCanvas(ctx, w, h)

            const sx = this.shakeAmt > 0.5 ? (Math.random() - 0.5) * this.shakeAmt : 0
            const sy = this.shakeAmt > 0.5 ? (Math.random() - 0.5) * this.shakeAmt * 0.5 : 0
            ctx.save()
            ctx.translate(sx, sy)

            this._drawPlate(ctx)
            this._drawBag(ctx)

            ctx.restore()
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

        // 开口内边缘微光（拉拽时变亮）
        const glowAlpha = Math.min(0.5, (this.pullOffset / this.MAX_PULL) * 0.5)
        if (glowAlpha > 0.01) {
            ctx.save()
            ctx.beginPath()
            pathRoundRect(ctx, cx - sw / 2, py - sh / 2, sw, sh, sr)
            ctx.strokeStyle = `rgba(255, 200, 80, ${glowAlpha})`
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.restore()
        }
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

        // 粗布填充
        const fabricColor = '#D4A030'
        ctx.fillStyle = fabricColor
        ctx.fillRect(cx - half, topY, sw, bodyH)

        // 布纹
        ctx.strokeStyle = 'rgba(60,40,15,0.12)'
        ctx.lineWidth = 0.5
        for (let y = topY + 4; y < bottomY; y += 5) {
            ctx.beginPath()
            ctx.moveTo(cx - half + 2, y)
            ctx.lineTo(cx + half - 2, y)
            ctx.stroke()
        }

        // 拉环（跑道形）
        // 拉环（水平跑道形，宽度与皮带一致）
        const loopH = sw * 0.4
        const loopR2 = sw * 0.15
        ctx.beginPath()
        pathRoundRect(ctx, cx - half, bottomY + 3, sw, loopH, loopR2)
        ctx.strokeStyle = fabricColor
        ctx.lineWidth = 24
        ctx.stroke()

        ctx.restore()
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
            this._lastDotReached = 0
            this._endVibeTimer = 0
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

            const cnt = this._lastDotReached
            this.shakeAmt = cnt >= 3 ? 10 : cnt * 3
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
        this._pendingCount = 0
        this._lastDotReached = 0
        this._endVibeTimer = 0
        this.snapSpring.setValue(0)
        this.snapSpring.velocity = 0
        this.shakeAmt = 0
    }

    _findTouch(e) {
        if (!e.touches) return null
        for (const t of e.touches) {
            if (t.identifier === this._touchId) return t
        }
        return e.touches[0] || null
    }
}
