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

        this.TICK_COUNT = 4
        this.DETENT_THRESHOLD = 0.5

        this.inertia = {
            velocity: 0,
            friction: 0.7,
        }

        this.snapSpring = new Spring({ stiffness: 500, damping: 24 })
        this._isSnapping = false

        this._scrollOffset = 0
        this._lastCountedTick = 0

        this._isDragging = false
        this._lastTouchY = 0
        this._touchId = null
        this._lastVibeTime = 0

        // 动态计算（每帧 _calcLayout 更新）
        this._tickSpacing = 60
        this._tickAlignOffset = 0
        this._touchBaseOffset = 0
    }

    _calcLayout() {
        this.wheelCx = this.width / 2
        this.wheelCy = this.height / 2
        this.wheelW = this.width * 0.4
        this.wheelH = this.height * 0.72
        // 动态刻度间距 = 视觉间距，保证计数与渲染一致
        this._tickSpacing = (this.wheelH * 0.75) / this.TICK_COUNT
        // 对齐偏移：刻度经过三角指针时计数
        const startY = this.wheelCy - this.wheelH * 0.375
        const tickCenterY = startY + 2 * this._tickSpacing
        this._tickAlignOffset = this.wheelCy - tickCenterY
    }

    _nearestTick(offset) {
        return Math.round(offset / this._tickSpacing) * this._tickSpacing
    }

    update(dt) {
        this._calcLayout()
        const sd = Math.min(dt, 0.05)

        if (this._isSnapping) {
            this.snapSpring.update(sd)
            const prevOffset = this._scrollOffset
            this._scrollOffset = this.snapSpring.value
            // 回弹过程中也检查计数
            const snapDelta = this._scrollOffset - prevOffset
            if (snapDelta > 0.5) this._checkTickCrossing(snapDelta)
            if (this.snapSpring.isAtRest) {
                this._scrollOffset = this._nearestTick(this._scrollOffset)
                this._lastCountedTick = Math.floor(this._scrollOffset / this._tickSpacing)
                this._isSnapping = false
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

        // 金属拉丝纹理
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'
        ctx.lineWidth = 0.5
        for (let x = rx; x < rx + hw; x += 3) {
            ctx.beginPath()
            ctx.moveTo(x, ry)
            ctx.lineTo(x, ry + hh)
            ctx.stroke()
        }
        ctx.restore()

        // 刻度群（长短相间）：每根刻度独立计算进出视野
        // 4 个吸附点，4 段摩擦刻度
        const startY = ry + hh * 0.125

        ctx.save()
        const LINE_COUNT = 11 // 每组 11 条线（增加约 22%）
        const lineSpacing = 4
        const halfLines = (LINE_COUNT - 1) / 2
        for (let i = -3; i <= this.TICK_COUNT + 2; i++) {
            const visualOffset = this._scrollOffset + this._tickAlignOffset + this._tickSpacing * 0.5
            const y = startY + ((i * this._tickSpacing + visualOffset) % (hh * 0.75))
            let wy = ((((y - startY) % (hh * 0.75)) + hh * 0.75) % (hh * 0.75)) + startY
            // 粗筛：中心离太远则跳过整组
            if (wy < ry - lineSpacing * halfLines - 4 || wy > ry + hh + lineSpacing * halfLines + 4) continue

            for (let j = -halfLines; j <= halfLines; j++) {
                const lineY = wy + j * lineSpacing
                // 每根刻度独立进出视野
                if (lineY < ry || lineY > ry + hh) continue

                // 中间长，两边短
                const lengthRatio = 0.5 + 0.5 * (1 - Math.abs(j) / (halfLines + 1))
                const tw = hw * 0.45 * lengthRatio
                if (tw < 3) continue
                const tx1 = rx + (hw - tw) / 2
                const tx2 = tx1 + tw

                ctx.strokeStyle = '#AAA'
                ctx.lineWidth = 1.8
                ctx.lineCap = 'round'
                ctx.beginPath()
                ctx.moveTo(tx1, lineY)
                ctx.lineTo(tx2, lineY)
                ctx.stroke()
            }
        }
        ctx.restore()

        // 左侧指示三角（指向滚轮 + 发光）
        ctx.save()
        // 外发光
        const glowGrad = ctx.createRadialGradient(rx - 6, cy, 0, rx - 6, cy, 20)
        glowGrad.addColorStop(0, 'rgba(200,200,200,0.15)')
        glowGrad.addColorStop(1, 'rgba(200,200,200,0)')
        ctx.fillStyle = glowGrad
        ctx.beginPath()
        ctx.arc(rx - 6, cy, 20, 0, Math.PI * 2)
        ctx.fill()

        // 三角箭头
        ctx.fillStyle = '#AAA'
        ctx.beginPath()
        ctx.moveTo(rx - 2, cy)
        ctx.lineTo(rx - 12, cy - 10)
        ctx.lineTo(rx - 12, cy + 10)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
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
        this._touchBaseOffset = this._scrollOffset
        // 重置计数参考点 — 以刻度经过三角为准
        this._lastCountedTick = Math.floor(this._scrollOffset / this._tickSpacing)
    }

    handleTouchMove(e) {
        if (!this._isDragging) return
        const t = this._findTouch(e)
        if (!t) return
        const dy = t.y - this._lastTouchY
        this._lastTouchY = t.y

        // 渐进阻力：离起点越远，阻力越大
        const distFromStart = Math.abs(this._scrollOffset - this._touchBaseOffset)
        const tFactor = Math.min(distFromStart / (this._tickSpacing * 3), 1)
        let resistance = 1 - tFactor * 0.4

        // 跨格阻力 + 过峰助推：吸附点（刻度间隔中间）阻尼最大
        // 推过峰值后自动滑向下一格
        const nearestDetent = this._nearestTick(this._scrollOffset)
        const halfWay = nearestDetent + this._tickSpacing * 0.5
        const distToMid = Math.abs(this._scrollOffset - halfWay)
        const RESIST_ZONE = this._tickSpacing * 0.4
        let vibeIntensity = 0

        if (distToMid < RESIST_ZONE && distToMid > 0.5) {
            const peakResist = (RESIST_ZONE - distToMid) / RESIST_ZONE
            // 阻尼随靠近峰值递增（最多削弱 55%）
            resistance *= 1 - peakResist * 0.55
            vibeIntensity = peakResist

            // 越过峰值后：自动推向下一格
            if (this._scrollOffset > halfWay + 2) {
                const assist = peakResist * this._tickSpacing * 2.5
                this._scrollOffset += assist * 0.016
            }
        }

        // 阻尼越大震感越强
        if (vibeIntensity > 0.3 && this.haptic) {
            const now = Date.now()
            const vibeInterval = Math.max(40, 200 - vibeIntensity * 160)
            if (!this._lastVibeTime || now - this._lastVibeTime > vibeInterval) {
                this._lastVibeTime = now
                if (vibeIntensity > 0.7) {
                    this.haptic.heavy()
                } else if (vibeIntensity > 0.5) {
                    this.haptic.medium()
                } else {
                    this.haptic.light()
                }
            }
        }

        // 基础阻尼：手指需移动更多距离，滚轮才移动一定距离
        const DAMPING = 0.55
        const adjustedDy = dy * resistance * DAMPING

        // 限制单帧移动量（不超过 0.8 格刻度），防止飞跳
        const maxPerFrame = this._tickSpacing * 0.8
        const clampedDy = Math.max(-maxPerFrame, Math.min(maxPerFrame, adjustedDy))

        this._scrollOffset += clampedDy
        this.inertia.velocity += clampedDy * 80
        // 限制最大速度
        this.inertia.velocity = Math.max(-300, Math.min(300, this.inertia.velocity))
        this._checkTickCrossing(clampedDy)
    }

    handleTouchEnd() {
        if (!this._isDragging) return
        this._isDragging = false
        this._touchId = null

        // 吸附到最近的 detent（刻度间隔的整数倍）
        const nearestDetent = this._nearestTick(this._scrollOffset)
        if (Math.abs(this._scrollOffset - nearestDetent) > 0.5) {
            this._isSnapping = true
            this.snapSpring.setValue(this._scrollOffset)
            this.snapSpring.target = nearestDetent
            this.inertia.velocity = 0
        }
    }

    _checkTickCrossing(delta) {
        // 仅向下滚动（delta > 0）时计数
        if (delta <= 0) return

        const ct = Math.floor(this._scrollOffset / this._tickSpacing)

        if (ct > this._lastCountedTick) {
            const diff = ct - this._lastCountedTick
            const clamped = Math.min(diff, 1)
            if (this.onCountChange) this.onCountChange(clamped)
            if (this.audio) this.audio.play('ratchet')
            if (this.haptic) this.haptic.heavy()
            this._lastCountedTick = ct
        }
    }

    reset() {
        this._isDragging = false
        this._touchId = null
        this._isSnapping = false
        this._scrollOffset = 0
        this._lastCountedTick = 0
        this.inertia.velocity = 0
        this._touchBaseOffset = 0
    }

    _findTouch(e) {
        if (!e.touches) return null
        for (const t of e.touches) {
            if (t.identifier === this._touchId) return t
        }
        return e.touches[0] || null
    }
}
