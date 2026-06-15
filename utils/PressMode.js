/**
 * 按压模式 — 震感扫雷
 * 随机雷点，靠近震动，准心停留 → 爆炸
 */

import { clearCanvas } from './renderer.js'

export class PressMode {
    constructor(config) {
        this.width = config.width
        this.height = config.height
        this.audio = config.audioEngine
        this.haptic = config.hapticEngine
        this.onCountChange = config.onCountChange

        this.mineX = -1
        this.mineY = -1
        this.mineSet = false
        this.fingerX = 0
        this.fingerY = 0
        this.touching = false
        this.proximityMs = 0
        this.exploded = false
        this._lastVibeTime = 0
        this.particles = []
    }

    _setMine() {
        const margin = this.width * 0.12
        this.mineX = margin + Math.random() * (this.width - margin * 2)
        this.mineY = 80 + Math.random() * (this.height - 160)
        this.mineSet = true
    }

    update(dt) {
        if (!this.touching || !this.mineSet) {
            this.proximityMs = 0
            return
        }

        const detectX = this.fingerX
        const detectY = this.fingerY - 80
        const dx = detectX - this.mineX
        const dy = detectY - this.mineY
        const d = Math.sqrt(dx * dx + dy * dy)

        if (d < 25) {
            this.proximityMs += dt * 1000
            if (this.proximityMs > 600 && !this.exploded) {
                this.exploded = true
                this.explodeTimer = 0
                this._spawnParticles()
                if (this.haptic) this.haptic.heavy()
                if (this.onCountChange) this.onCountChange(1)
            }
        } else {
            this.proximityMs = Math.max(0, this.proximityMs - dt * 200)
        }

        this._vibeByDistance(d)

        if (this.exploded) this.explodeTimer += dt
    }

    _vibeByDistance(d) {
        const now = Date.now()
        let interval = 0
        let type = 'light'

        if (d < 40) {
            interval = 60
            type = 'heavy'
        } else if (d < 80) {
            interval = 100
            type = 'medium'
        } else if (d < 130) {
            interval = 180
            type = 'light'
        } else if (d < 200) {
            interval = 300
            type = 'light'
        } else return

        if (now - this._lastVibeTime > interval) {
            this._lastVibeTime = now
            if (this.haptic && this.haptic[type]) this.haptic[type]()
        }
    }

    _spawnParticles() {
        const colors = ['#FF4444', '#FF8844', '#FFCC44', '#44FF44', '#4488FF', '#FF44FF', '#FFFFFF']
        for (let i = 0; i < 35; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 40 + Math.random() * 120
            this.particles.push({
                x: this.mineX,
                y: this.mineY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.6 + Math.random() * 0.8,
                maxLife: 0.6 + Math.random() * 0.8,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 1.5 + Math.random() * 3,
            })
        }
    }

    render(ctx) {
        const w = this.width,
            h = this.height
        clearCanvas(ctx, w, h)

        // 背景网格
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 0.5
        for (let x = 0; x < w; x += 28) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
            ctx.stroke()
        }
        for (let y = 0; y < h; y += 28) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
        }
        ctx.restore()

        // 粒子
        for (const p of this.particles) {
            p.x += p.vx * 0.016
            p.y += p.vy * 0.016
            p.vy += 80 * 0.016
            p.life -= 0.016
            if (p.life <= 0) continue
            const alpha = Math.max(0, p.life / p.maxLife)
            ctx.save()
            ctx.globalAlpha = alpha
            ctx.fillStyle = p.color
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        }

        // 爆炸闪光
        if (this.exploded) {
            const flash = Math.max(0, 1 - this.explodeTimer / 0.4)
            ctx.save()
            ctx.globalAlpha = flash * 0.3
            ctx.fillStyle = '#FFDD88'
            ctx.beginPath()
            ctx.arc(this.mineX, this.mineY, 60 + (1 - flash) * 40, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        }

        if (!this.touching || !this.mineSet) return

        const detectX = this.fingerX
        const detectY = this.fingerY - 80
        const dx = detectX - this.mineX
        const dy = detectY - this.mineY
        const d = Math.sqrt(dx * dx + dy * dy)

        // 同心圆（在手指上方探测）
        if (d < 160) {
            const ringCount = Math.max(3, Math.floor((160 - d) / 20))
            const offsetY = -80
            ctx.save()
            for (let i = 0; i < ringCount; i++) {
                const r = i * 12 + 10
                const alpha = Math.max(0, 0.3 - (d / 160) * 0.25 - i * 0.05)
                if (alpha < 0.01) break
                ctx.globalAlpha = alpha
                ctx.strokeStyle = d < 50 ? '#FF6644' : d < 100 ? '#FFAA44' : '#88CCFF'
                ctx.lineWidth = 1.2
                ctx.beginPath()
                ctx.arc(this.fingerX, this.fingerY + offsetY, r, 0, Math.PI * 2)
                ctx.stroke()
            }
            ctx.restore()
        }

        // 极近时雷点提示
        if (d < 50) {
            ctx.save()
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 100)
            ctx.globalAlpha = pulse * (1 - d / 50)
            ctx.strokeStyle = '#FF2222'
            ctx.lineWidth = 2
            const c = 10
            ctx.beginPath()
            ctx.moveTo(this.mineX - c, this.mineY)
            ctx.lineTo(this.mineX + c, this.mineY)
            ctx.moveTo(this.mineX, this.mineY - c)
            ctx.lineTo(this.mineX, this.mineY + c)
            ctx.stroke()
            ctx.restore()
        }
    }

    /* ─── 触摸 ─── */

    handleTouchStart(e) {
        const t = e.touches[0]
        if (!t) return
        if (!this.mineSet || e.touches.length >= 2) this._setMine()

        this.fingerX = t.x
        this.fingerY = t.y
        this.touching = true
        this.exploded = false
        this.particles = []
        this.proximityMs = 0
    }

    handleTouchMove(e) {
        const t = e.touches[0]
        if (!t) return
        this.fingerX = t.x
        this.fingerY = t.y
    }

    handleTouchEnd() {
        this.touching = false
        this.proximityMs = 0
        // 爆炸后重置雷点
        if (this.exploded) {
            this.mineSet = false
        }
        this.mineSet = false
        this.touching = false
        this.exploded = false
        this.particles = []
        this.proximityMs = 0
    }

    _findTouch(e) {
        if (!e.touches) return null
        return e.touches[0] || null
    }
}
