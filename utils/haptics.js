/**
 * 解压计数器 - 震动管理系统
 * 封装 wx.vibrateShort / wx.vibrateLong
 * 带频率限制（两次震动间隔 ≥ 50ms）和错误兜底
 */

class HapticEngine {
  constructor() {
    this._lastVibrateTime = 0
    this._minInterval = 50 // ms
    this._enabled = true
  }

  /** 开关 */
  get enabled() {
    return this._enabled
  }

  set enabled(val) {
    this._enabled = val
  }

  toggle() {
    this._enabled = !this._enabled
    return this._enabled
  }

  /**
   * 轻震动 — 对应 light
   * 用于：绿色按钮按压、归零按钮按压、拉带第1格
   */
  light() {
    this._vibrate('light')
  }

  /**
   * 中震动 — 对应 medium
   * 用于：滚轮刻度、拉带第2格
   */
  medium() {
    this._vibrate('medium')
  }

  /**
   * 重震动 — 对应 heavy
   * 用于：归零触发、拉带第3/4格
   */
  heavy() {
    this._vibrate('heavy')
  }

  /**
   * 长震动 — 约 40ms
   * 用于：归零事件、拉带弹回
   */
  long() {
    if (!this._enabled) return
    if (!this._rateLimit()) return

    try {
      wx.vibrateLong()
      this._lastVibrateTime = Date.now()
    } catch (e) {
      // 不支持或权限不足，静默失败
      console.debug('HapticEngine: vibrateLong not supported')
    }
  }

  /** 内部：短震动 */
  _vibrate(type) {
    if (!this._enabled) return
    if (!this._rateLimit()) return

    try {
      wx.vibrateShort({ type })
      this._lastVibrateTime = Date.now()
    } catch (e) {
      // 降级：某些设备不支持 type 参数
      try {
        wx.vibrateShort()
        this._lastVibrateTime = Date.now()
      } catch {
        console.debug('HapticEngine: vibrateShort not supported')
      }
    }
  }

  /** 频率限制 */
  _rateLimit() {
    const now = Date.now()
    if (now - this._lastVibrateTime < this._minInterval) {
      return false
    }
    return true
  }
}

// 单例导出
const hapticEngine = new HapticEngine()
export default hapticEngine
