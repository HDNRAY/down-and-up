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
        // 爆炸计时与复位 — 独立于触摸状态，保证始终推进
        if (this.exploded) {
            this.explodeTimer += dt
            // ~400ms 后自动刷新雷点，不等烟花放完也不等手指抬起
            if (this.explodeTimer > 0.4) {
                this.exploded = false
                this.particles = []
                this.proximityMs = 0
                this._setMine()
            }
        }

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
                if (this.haptic) this.haptic.burst()
                if (this.onCountChange) this.onCountChange(1)
            }
        } else {
            this.proximityMs = Math.max(0, this.proximityMs - dt * 200)
        }

        this._vibeByDistance(d)
    }

    _vibeByDistance(d) {
        const now = Date.now()
        const maxDist = Math.sqrt(this.width * this.width + this.height * this.height)
        const t = Math.min(d / maxDist, 1) // 0=贴脸 1=最远

        // 指数曲线：近处急速脉冲，远处缓慢衰减，手感层次分明
        const interval = 30 + Math.pow(t, 0.5) * 270

        // 震动强度随距离连续变化
        let type = 'light'
        if (t < 0.2) type = 'heavy'
        else if (t < 0.5) type = 'medium'

        if (now - this._lastVibeTime > interval) {
            this._lastVibeTime = now
            if (this.haptic && this.haptic[type]) this.haptic[type]()
        }
    }

    _spawnParticles() {
        const count = 50 + Math.floor(Math.random() * 30) // 50-80
        const colors = ['#FF4444', '#FF8844', '#FFCC44', '#44FF44', '#4488FF', '#FF44FF', '#FFFFFF']
        const shapes = ['circle', 'star', 'sparkle', 'line']
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 80 + Math.random() * 140
            this.particles.push({
                x: this.mineX,
                y: this.mineY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.8 + Math.random() * 1.0,
                maxLife: 0.8 + Math.random() * 1.0,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 1.5 + Math.random() * 3.5,
                shape: shapes[Math.floor(Math.random() * shapes.length)],
            })
        }
    }

    /* ─── 按形状绘制粒子 ─── */
    _drawParticle(ctx, p, alpha) {
        const s = p.size * alpha
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        ctx.strokeStyle = p.color

        switch (p.shape) {
            case 'star': {
                // 四角星
                const r = s
                ctx.beginPath()
                for (let j = 0; j < 8; j++) {
                    const a = (j * Math.PI) / 4 - Math.PI / 2
                    const rad = j % 2 === 0 ? r : r * 0.35
                    const px = p.x + Math.cos(a) * rad
                    const py = p.y + Math.sin(a) * rad
                    j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
                }
                ctx.closePath()
                ctx.fill()
                break
            }
            case 'sparkle': {
                // 十字火花
                const len = s * 1.2
                ctx.lineWidth = Math.max(1, s * 0.4)
                ctx.lineCap = 'round'
                ctx.beginPath()
                ctx.moveTo(p.x - len, p.y)
                ctx.lineTo(p.x + len, p.y)
                ctx.moveTo(p.x, p.y - len)
                ctx.lineTo(p.x, p.y + len)
                ctx.stroke()
                break
            }
            case 'line': {
                // 拖尾线段 — 沿速度方向
                const len = s * 2
                const angle = Math.atan2(p.vy, p.vx)
                ctx.lineWidth = Math.max(1, s * 0.5)
                ctx.lineCap = 'round'
                ctx.beginPath()
                ctx.moveTo(p.x - Math.cos(angle) * len, p.y - Math.sin(angle) * len)
                ctx.lineTo(p.x + Math.cos(angle) * len * 0.5, p.y + Math.sin(angle) * len * 0.5)
                ctx.stroke()
                break
            }
            case 'circle':
            default: {
                // 圆形（默认）
                ctx.beginPath()
                ctx.arc(p.x, p.y, s, 0, Math.PI * 2)
                ctx.fill()
                break
            }
        }

        ctx.restore()
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

        // 粒子（多样形状 + 速度衰减）
        for (const p of this.particles) {
            p.vx *= 0.96
            p.vy *= 0.96
            p.x += p.vx * 0.016
            p.y += p.vy * 0.016
            p.vy += 80 * 0.016
            p.life -= 0.016
            if (p.life <= 0) continue
            const alpha = Math.max(0, p.life / p.maxLife)
            this._drawParticle(ctx, p, alpha)
        }

        // 爆炸微光（仅外层浅光晕）
        if (this.exploded) {
            const flash = Math.max(0, 1 - this.explodeTimer / 0.35)
            ctx.save()
            ctx.globalAlpha = flash * 0.18
            ctx.fillStyle = '#FFDD88'
            ctx.beginPath()
            ctx.arc(this.mineX, this.mineY, 60 + (1 - flash) * 50, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        }

        if (!this.touching || !this.mineSet) return

        const detectX = this.fingerX
        const detectY = this.fingerY - 80
        const dx = detectX - this.mineX
        const dy = detectY - this.mineY
        const d = Math.sqrt(dx * dx + dy * dy)

        // 同心圆（在手指上方探测）— 手指任意位置均显示，远处淡近处浓
        const maxDist = Math.sqrt(this.width * this.width + this.height * this.height)
        const tNorm = Math.min(d / maxDist, 1)
        // 近处 4 环 → 远处 3 环
        const ringCount = Math.max(3, Math.floor(4 * (1 - tNorm * 0.25)))
        const offsetY = -80
        // 亮3空1 柔和脉冲：缓入→长亮→渐暗→短暗
        const cycleMs = 300 + d * 0.3
        const phase = (Date.now() % cycleMs) / cycleMs
        let flashPulse
        if (phase < 0.1) {
            flashPulse = 0.25 + 0.65 * (phase / 0.1) // fade in
        } else if (phase < 0.75) {
            flashPulse = 0.9 // hold bright
        } else if (phase < 0.9) {
            flashPulse = 0.9 - 0.65 * ((phase - 0.75) / 0.15) // fade out
        } else {
            flashPulse = 0.25 // hold dim
        }
        ctx.save()
        for (let i = 0; i < ringCount; i++) {
            const r = i * 18 + 12
            const alpha = Math.max(0, 0.35 * (1 - tNorm * 0.85) - i * 0.04)
            if (alpha < 0.01) break
            ctx.globalAlpha = alpha * flashPulse
            // 连续渐变：近距离红色 → 远距离蓝色
            const R = Math.round(255 - 187 * tNorm)
            const G = Math.round(68 + 68 * tNorm)
            const B = Math.round(34 + 221 * tNorm)
            ctx.strokeStyle = `rgb(${R},${G},${B})`
            ctx.lineWidth = 2.5
            ctx.beginPath()
            ctx.arc(this.fingerX, this.fingerY + offsetY, r, 0, Math.PI * 2)
            ctx.stroke()
        }
        ctx.restore()

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
        this.explodeTimer = 0
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
        // 烟花继续播放，抬手不消失
    }

    _findTouch(e) {
        if (!e.touches) return null
        return e.touches[0] || null
    }
}
