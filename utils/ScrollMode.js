/**
 * 滚动模式 — 音量键大刻度
 * 大间距棘轮，重摩擦阻尼感
 * 滑动超过 50% 进位，不到弹回
 */

import { Spring } from './spring.js'
import { clearCanvas } from './renderer.js'

export class ScrollMode {
    constructor(config) {
        this.width = config.width
        this.height = config.height
        this.audio = config.audioEngine
        this.haptic = config.hapticEngine
        this.onCountChange = config.onCountChange

        this.TICK_SPACING = 60
        this.TICK_COUNT = 5
        this.DETENT_THRESHOLD = 0.5

        this.inertia = {
            velocity: 0,
            friction: 0.94,
        }

        this.snapSpring = new Spring({ stiffness: 500, damping: 28 })
        this._isSnapping = false

        this._scrollOffset = 0
        this._lastTickIndex = 0

        this._isDragging = false
        this._lastTouchY = 0
        this._touchId = null

        this._tickPulse = 0
    }

    _calcLayout() {
        this.wheelCx = this.width / 2
        this.wheelCy = this.height / 2
        this.wheelW = this.width * 0.4
        this.wheelH = this.height * 0.72
    }

    _nearestTick(offset) {
        return Math.round(offset / this.TICK_SPACING) * this.TICK_SPACING
    }

    update(dt) {
        this._calcLayout()
        const sd = Math.min(dt, 0.05)

        if (this._isSnapping) {
            this.snapSpring.update(sd)
            this._scrollOffset = this.snapSpring.value
            if (this.snapSpring.isAtRest) {
                this._scrollOffset = this._nearestTick(this._scrollOffset)
                this._isSnapping = false
            }
            if (this._tickPulse > 0) {
                this._tickPulse *= Math.pow(0.8, sd * 60)
                if (this._tickPulse < 0.01) this._tickPulse = 0
            }
            return
        }

        if (!this._isDragging) {
            this.inertia.velocity *= this.inertia.friction
            if (Math.abs(this.inertia.velocity) < 1) this.inertia.velocity = 0
            const delta = this.inertia.velocity * sd
            if (delta !== 0) {
                this._scrollOffset += delta
                this._checkTickCrossing(delta)
            }
        }

        // 脉冲衰减
        if (this._tickPulse > 0) {
            this._tickPulse *= Math.pow(0.8, sd * 60)
            if (this._tickPulse < 0.01) this._tickPulse = 0
        }
    }

    render(ctx) {
        const w = this.width,
            h = this.height
        clearCanvas(ctx, w, h)

        const cx = this.wheelCx,
            cy = this.wheelCy
        const hw = this.wheelW,
            hh = this.wheelH
        const rx = cx - hw / 2,
            ry = cy - hh / 2
        const radius = hw / 2

        // 主体背景
        ctx.save()
        ctx.beginPath()
        this._roundRect(ctx, rx, ry, hw, hh, radius)
        ctx.clip()

        const grad = ctx.createLinearGradient(0, ry, 0, ry + hh)
        grad.addColorStop(0, '#2A2A2A')
        grad.addColorStop(0.2, '#444')
        grad.addColorStop(0.5, '#555')
        grad.addColorStop(0.8, '#444')
        grad.addColorStop(1, '#2A2A2A')
        ctx.fillStyle = grad
        ctx.fillRect(rx, ry, hw, hh)
        ctx.restore()

        // 大刻度（等长）
        const spacing = (hh * 0.75) / this.TICK_COUNT
        const startY = ry + hh * 0.125

        ctx.save()
        for (let i = -2; i <= this.TICK_COUNT + 2; i++) {
            const y = startY + ((i * spacing + this._scrollOffset) % (hh * 0.75))
            let wy = ((((y - startY) % (hh * 0.75)) + hh * 0.75) % (hh * 0.75)) + startY
            if (wy < ry - spacing || wy > ry + hh + spacing) continue

            const tw = hw * 0.45
            const tx1 = rx + (hw - tw) / 2
            const tx2 = tx1 + tw

            ctx.strokeStyle = '#999'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(tx1, wy)
            ctx.lineTo(tx2, wy)
            ctx.stroke()
        }
        ctx.restore()

        // 左侧指示三角（指向滚轮）
        ctx.save()
        ctx.fillStyle = '#888'
        ctx.beginPath()
        ctx.moveTo(rx - 2, cy)
        ctx.lineTo(rx - 8, cy - 7)
        ctx.lineTo(rx - 8, cy + 7)
        ctx.closePath()
        ctx.fill()
        ctx.restore()

        // 脉冲闪光
        if (this._tickPulse > 0.05) {
            ctx.save()
            ctx.globalAlpha = this._tickPulse * 0.4
            const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, hh * 0.3)
            pg.addColorStop(0, 'rgba(200,200,200,0.2)')
            pg.addColorStop(1, 'rgba(200,200,200,0)')
            ctx.fillStyle = pg
            ctx.beginPath()
            ctx.arc(cx, cy, hh * 0.3, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        }
    }

    _roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, Math.min(w, h) / 2)
        ctx.moveTo(x + rr, y)
        ctx.lineTo(x + w - rr, y)
        ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
        ctx.lineTo(x + w, y + h - rr)
        ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
        ctx.lineTo(x + rr, y + h)
        ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
        ctx.lineTo(x, y + rr)
        ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5)
        ctx.closePath()
    }

    /* ─── 触摸 ─── */

    handleTouchStart(e) {
        const t = e.touches[0]
        if (!t) return
        this._isDragging = true
        this._lastTouchY = t.y
        this._touchId = t.identifier
        this.inertia.velocity = 0
        this._isSnapping = false
    }

    handleTouchMove(e) {
        if (!this._isDragging) return
        const t = this._findTouch(e)
        if (!t) return
        const dy = t.y - this._lastTouchY
        this._lastTouchY = t.y
        this._scrollOffset += dy
        this.inertia.velocity += dy * 80
        this._checkTickCrossing(dy)
    }

    handleTouchEnd() {
        if (!this._isDragging) return
        this._isDragging = false
        this._touchId = null

        const tickProgress = (this._scrollOffset % this.TICK_SPACING) / this.TICK_SPACING
        const absProgress = Math.abs(tickProgress)
        if (absProgress > 0.01) {
            const dir = tickProgress > 0 ? 1 : -1
            const target =
                absProgress > this.DETENT_THRESHOLD
                    ? this._nearestTick(this._scrollOffset + dir * this.TICK_SPACING * 0.1)
                    : this._nearestTick(this._scrollOffset)
            if (Math.abs(this._scrollOffset - target) > 0.5) {
                this._isSnapping = true
                this.snapSpring.setValue(this._scrollOffset)
                this.snapSpring.target = target
                this.inertia.velocity = 0
            }
        }
    }

    _checkTickCrossing(delta) {
        const ct = Math.floor(this._scrollOffset / this.TICK_SPACING)
        const lt = this._lastTickIndex
        if (ct !== lt) {
            const diff = Math.abs(ct - lt)
            if (diff > 0 && diff < 12) {
                if (this.onCountChange) this.onCountChange(diff)
                if (this.audio) this.audio.play('ratchet')
                if (this.haptic) this.haptic.medium()
                this._tickPulse = 1
            }
            this._lastTickIndex = ct
        }
    }

    reset() {
        this._isDragging = false
        this._touchId = null
        this._isSnapping = false
        this._scrollOffset = 0
        this._lastTickIndex = 0
        this._tickPulse = 0
        this.inertia.velocity = 0
    }

    _findTouch(e) {
        if (!e.touches) return null
        for (const t of e.touches) {
            if (t.identifier === this._touchId) return t
        }
        return e.touches[0] || null
    }
}
