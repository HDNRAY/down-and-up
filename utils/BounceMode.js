/**
 * 颠乒乓球模式 — 陀螺仪 + 触摸控制
 * 标签：BOUNCE
 *
 * 斜侧视角，球拍双态（上倾/下倾）
 * 触摸/手腕上抖 → 球拍上抬 → 击球
 * 力度固定，不依赖按压力度/时间/速度
 * miss 时回到初始态，计数不受影响
 */

import { clearCanvas } from './renderer.js'

const GRAVITY = 1500
const LAUNCH_SPEED = 900
const RAISE_DURATION = 0.12
const PADDLE_Y_RATIO = 0.85
const BALL_RADIUS = 10
const PADDLE_OFFSET_X = 35
const MISS_Y_OFFSET = 80

export class BounceMode {
    constructor(config) {
        this.width = config.width
        this.height = config.height
        this.audio = config.audioEngine
        this.haptic = config.hapticEngine
        this.onCountChange = config.onCountChange

        this._lastBeta = null
        this._flickDetected = false
        this._releaseDetected = false
        this._pendingRelease = false

        this._paddleAnim = 0
        this._paddlePhase = 'down'
        this._stateTimer = 0

        this._ballY = 0
        this._ballVy = 0
        this._onPaddle = true
        this._firstHit = true
        this._hitCooldown = 0

        this._paddleY = 0
        this._paddleX = 0

        this._calcLayout()
    }

    _calcLayout() {
        this._paddleY = this.height * PADDLE_Y_RATIO
        this._paddleX = this.width / 2 + PADDLE_OFFSET_X
    }

    setTilt(beta) {
        if (this._lastBeta !== null) {
            const delta = beta - this._lastBeta
            if (delta > 8) {
                this._flickDetected = true
                // 陀螺仪是瞬间动作，抬起完成后立即放下
                this._pendingRelease = true
            }
        }
        this._lastBeta = beta
    }

    update(dt) {
        this._calcLayout()
        const sd = Math.min(dt, 0.05)

        // 球在拍上时停在拍面位置
        if (this._onPaddle) {
            this._ballY = this._faceSurfaceY()
        }

        // 触摸/抬手控制
        if (this._flickDetected) {
            if (this._paddlePhase === 'down' || this._paddlePhase === 'lowering') {
                this._paddlePhase = 'raising'
                this._stateTimer = 0
            }
            this._flickDetected = false
        }
        if (this._releaseDetected) {
            if (this._paddlePhase === 'raising') {
                this._pendingRelease = true
            } else if (this._paddlePhase === 'up') {
                this._paddlePhase = 'lowering'
                this._stateTimer = 0
            }
            this._releaseDetected = false
        }

        if (this._paddlePhase === 'raising') {
            this._stateTimer += sd
            this._paddleAnim = Math.min(1, this._stateTimer / RAISE_DURATION)
            if (this._paddleAnim >= 1) {
                this._paddleAnim = 1
                this._paddlePhase = 'up'
                if (this._onPaddle) this._hitBall()
                // 轻点后立即松下：完成抬起到顶后再放下
                if (this._pendingRelease) {
                    this._pendingRelease = false
                    this._paddlePhase = 'lowering'
                    this._stateTimer = 0
                }
            }
        } else if (this._paddlePhase === 'lowering') {
            this._stateTimer += sd
            this._paddleAnim = Math.max(0, 1 - this._stateTimer / RAISE_DURATION)
            if (this._paddleAnim <= 0) {
                this._paddleAnim = 0
                this._paddlePhase = 'down'
            }
        }

        if (!this._onPaddle) {
            this._ballVy += GRAVITY * sd
            this._ballY += this._ballVy * sd

            // 掉出场外 → miss
            if (this._ballY > this._paddleY + MISS_Y_OFFSET) {
                this._ballY = this._faceSurfaceY()
                this._ballVy = 0
                this._onPaddle = true
                this._firstHit = true
            }

            // 冷却期内不接球
            if (this._hitCooldown > 0) {
                this._hitCooldown -= sd
            } else {
                const catchY = this._faceSurfaceY()
                if (this._ballY >= catchY) {
                    this._ballY = catchY
                    this._ballVy = 0

                    if (this._flickDetected || this._paddlePhase === 'raising') {
                        this._flickDetected = false
                        this._hitBall()
                    } else {
                        this._onPaddle = true
                        this._ballY = this._faceSurfaceY()
                        this._ballVy = 0
                        this._firstHit = true
                    }
                }
            }
        }

        this._flickDetected = false
    }

    _hitBall() {
        this._onPaddle = false
        this._hitCooldown = 0.3
        // 力度固定，不依赖按住时长或陀螺仪速度
        this._ballVy = -LAUNCH_SPEED

        if (!this._firstHit) {
            if (this.onCountChange) this.onCountChange(1)
            if (this.haptic) this.haptic.medium()
            if (this.audio) this.audio.play('click')
        }
        this._firstHit = false
    }

    /** 计算拍面中心的屏幕 Y（球应停在此处） */
    _faceSurfaceY() {
        const angle = ((0.5 - this._paddleAnim) * Math.PI) / 1.5
        const faceSide = this._paddleAnim < 0.5 ? 1 : -1
        const centerY = this._paddleY + faceSide * 30 * Math.cos(angle)
        return centerY
    }

    render(ctx) {
        const w = this.width
        const h = this.height
        clearCanvas(ctx, w, h)

        const px = this._paddleX
        const py = this._paddleY

        const angle = ((0.5 - this._paddleAnim) * Math.PI) / 1.5

        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(angle)

        // 手柄（黄色，中心在锚点）
        ctx.fillStyle = '#D4A030'
        ctx.fillRect(-4.5, -13.5, 9, 27)

        // 拍面（红色椭圆）
        const faceSide = this._paddleAnim < 0.5 ? 1 : -1
        ctx.fillStyle = '#FF4444'
        ctx.beginPath()
        ctx.ellipse(0, faceSide * 30, 16.5, 24, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()

        // 乒乓球（黄色 + 高光）
        ctx.save()
        const bx = w / 2
        const by = this._ballY
        const grad = ctx.createRadialGradient(
            bx - BALL_RADIUS * 0.3,
            by - BALL_RADIUS * 0.3,
            BALL_RADIUS * 0.1,
            bx,
            by,
            BALL_RADIUS,
        )
        grad.addColorStop(0, '#FFFFFF')
        grad.addColorStop(0.2, '#FFD54F')
        grad.addColorStop(0.7, '#FFB300')
        grad.addColorStop(1, '#E6A000')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    handleTouchStart() {
        this._flickDetected = true
    }
    handleTouchMove() {}
    handleTouchEnd() {
        this._releaseDetected = true
    }

    reset() {
        this._paddleAnim = 0
        this._paddlePhase = 'down'
        this._onPaddle = true
        this._ballY = this._faceSurfaceY()
        this._ballVy = 0
        this._lastBeta = null
        this._flickDetected = false
        this._releaseDetected = false
        this._pendingRelease = false
        this._firstHit = true
        this._hitCooldown = 0
    }
}
