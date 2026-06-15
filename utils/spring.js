/**
 * 解压计数器 - 弹簧物理 & 缓动引擎
 * 模拟弹性动画、惯性减速、缓动函数
 * 所有值在逻辑坐标空间计算（无 DPR 概念）
 */

/* ========================================
 * 弹簧系统（Spring）
 * ======================================== */

/**
 * 弹簧物理 — 模拟弹性动画
 * 用于按钮按下弹回、数字果冻弹跳、归零弹性等
 *
 * 使用隐式欧拉积分（足够稳定，性能开销低）
 *
 * @example
 * const spring = new Spring({ stiffness: 180, damping: 12 })
 * spring.target = 1  // 弹簧向 1 运动
 * spring.update(0.016) // 每帧调用
 * console.log(spring.value) // 当前值
 */
export class Spring {
  /**
   * @param {object} [opts]
   * @param {number} [opts.stiffness=180] - 刚度（越大越硬，回弹越快）
   * @param {number} [opts.damping=12]  - 阻尼（越大晃动越少）
   * @param {number} [opts.mass=1]     - 质量（越大越慢）
   * @param {number} [opts.precision=0.5] - 静止判定精度
   */
  constructor(opts = {}) {
    this.stiffness = opts.stiffness || 180
    this.damping = opts.damping || 12
    this.mass = opts.mass || 1
    this.precision = opts.precision || 0.5

    // 状态
    this.value = opts.initialValue || 0
    this.velocity = 0
    this._target = opts.initialValue || 0
  }

  /** 目标值（设置时不会突变） */
  get target() {
    return this._target
  }

  set target(val) {
    this._target = val
  }

  /** 是否已静止 */
  get isAtRest() {
    return Math.abs(this.value - this._target) < this.precision &&
           Math.abs(this.velocity) < this.precision
  }

  /**
   * 每帧更新物理
   * @param {number} dt - 时间步长（秒），建议 0.016
   */
  update(dt) {
    if (this.isAtRest) {
      this.value = this._target
      this.velocity = 0
      return
    }

    // 限制 dt 防止爆炸
    const safeDt = Math.min(dt, 0.05)

    // F = -kx - bv (胡克定律 + 阻尼)
    const displacement = this.value - this._target
    const force = -this.stiffness * displacement - this.damping * this.velocity

    // a = F / m
    const acceleration = force / this.mass

    // 隐式欧拉积分
    this.velocity += acceleration * safeDt
    this.value += this.velocity * safeDt
  }

  /**
   * 瞬间设置值并重置速度
   * @param {number} val
   */
  setValue(val) {
    this.value = val
    this.velocity = 0
  }

  /** 重置到目标值 */
  reset() {
    this.value = this._target
    this.velocity = 0
  }
}

/* ========================================
 * 惯性系统（Inertia）
 * ======================================== */

/**
 * 惯性物理 — 模拟动量减速
 * 用于滚轮手指离开后的惯性滑动、吸附
 *
 * @example
 * const inertia = new Inertia({ friction: 0.92 })
 * inertia.velocity = 500  // 初始速度
 * inertia.update(0.016)   // 每帧调用
 * console.log(inertia.value) // 累计位移
 */
export class Inertia {
  /**
   * @param {object} [opts]
   * @param {number} [opts.friction=0.92] - 摩擦系数（每帧乘算衰减，<1）
   * @param {number} [opts.maxSpeed=800]  - 最大速度（px/s）
   * @param {number} [opts.snapThreshold=3] - 吸附阈值（速度低于此值静止）
   */
  constructor(opts = {}) {
    this.friction = opts.friction || 0.92
    this.maxSpeed = opts.maxSpeed || 800
    this.snapThreshold = opts.snapThreshold || 3

    this.value = 0
    this.velocity = 0
    this._isMoving = false
  }

  get isMoving() {
    return this._isMoving
  }

  /**
   * 施加速度（受 maxSpeed 限制）
   * @param {number} v
   */
  setVelocity(v) {
    this.velocity = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, v))
    this._isMoving = Math.abs(this.velocity) > this.snapThreshold
  }

  /** 增加速度 */
  addVelocity(dv) {
    this.setVelocity(this.velocity + dv)
  }

  /**
   * 每帧更新
   * @param {number} dt
   * @returns {number} 当前帧位移 delta
   */
  update(dt) {
    if (!this._isMoving) return 0

    // 摩擦减速
    this.velocity *= Math.pow(this.friction, dt * 60)

    // 静止判定
    if (Math.abs(this.velocity) < this.snapThreshold) {
      this.velocity = 0
      this._isMoving = false
      return 0
    }

    const delta = this.velocity * dt
    this.value += delta
    return delta
  }

  /** 停止 */
  stop() {
    this.velocity = 0
    this._isMoving = false
  }

  /** 重置 */
  reset() {
    this.value = 0
    this.velocity = 0
    this._isMoving = false
  }
}

/* ========================================
 * 缓动函数（Easing）
 * ======================================== */

/**
 * 标准缓动函数集合
 * 所有函数签名: (t: 0→1) => number
 * 用于 Canvas 手绘动画 transition
 */

export const Easing = {
  /** 线性 */
  linear: (t) => t,

  /** 二次缓出 */
  easeOutQuad: (t) => t * (2 - t),

  /** 三次缓出 */
  easeOutCubic: (t) => {
    const t1 = t - 1
    return t1 * t1 * t1 + 1
  },

  /** 弹性缓出（类似果冻弹跳） */
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t
    const c4 = (2 * Math.PI) / 3
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },

  /** 弹跳缓出（像球落地） */
  easeOutBounce: (t) => {
    const n1 = 7.5625
    const d1 = 2.75
    if (t < 1 / d1) return n1 * t * t
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  },

  /** 回退缓出（略过目标再弹回） */
  easeOutBack: (t) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    const t1 = t - 1
    return t1 * t1 * ((c3 + 1) * t1 + c3) + 1
  },
}

/**
 * 基于持续时间和缓动函数的动画驱动
 *
 * @example
 * const anim = new Tween({ duration: 300, easing: Easing.easeOutElastic })
 * anim.start(0, 1)
 * // 每帧调用
 * anim.update(dtMs) // dt 为毫秒
 * if (!anim.done) { value = anim.value }
 */
export class Tween {
  /**
   * @param {object} [opts]
   * @param {number} [opts.duration=300] - 动画时长（毫秒）
   * @param {Function} [opts.easing] - 缓动函数，默认 easeOutQuad
   */
  constructor(opts = {}) {
    this.duration = opts.duration || 300
    this.easing = opts.easing || Easing.easeOutQuad
    this._startValue = 0
    this._endValue = 0
    this._elapsed = 0
    this._isPlaying = false
  }

  get done() {
    return !this._isPlaying
  }

  get value() {
    if (!this._isPlaying) return this._endValue
    const t = Math.min(this._elapsed / this.duration, 1)
    return this._startValue + (this._endValue - this._startValue) * this.easing(t)
  }

  get progress() {
    return Math.min(this._elapsed / this.duration, 1)
  }

  /**
   * 启动动画
   * @param {number} from - 起始值
   * @param {number} to - 结束值
   * @param {number} [duration] - 可选覆写时长
   */
  start(from, to, duration) {
    this._startValue = from
    this._endValue = to
    this._elapsed = 0
    this._isPlaying = true
    if (duration !== undefined) this.duration = duration
  }

  /**
   * 更新动画状态
   * @param {number} dtMs - 时间增量（毫秒）
   * @returns {number} 当前值
   */
  update(dtMs) {
    if (!this._isPlaying) return this._endValue
    this._elapsed += dtMs
    if (this._elapsed >= this.duration) {
      this._isPlaying = false
      this._elapsed = this.duration
    }
    return this.value
  }

  /** 停止动画 */
  stop() {
    this._isPlaying = false
  }
}

/* ========================================
 * 范围工具
 * ======================================== */

/**
 * 将值限制在 [min, max] 间
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 线性插值
 */
export function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * 将值从一个范围映射到另一个范围
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin)
  return outMin + (outMax - outMin) * Math.min(1, Math.max(0, t))
}
