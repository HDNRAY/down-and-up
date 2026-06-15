/**
 * 解压计数器 - 程序化音效引擎
 * 使用 Web Audio API（wx.createWebAudioContext）程序化生成所有音效
 * 零外部音频文件依赖
 *
 * 支持的音效：
 *   click      - 绿色按钮按压（正弦波 + 指数衰减）
 *   resetPress - 归零按钮按下（偏高短促正弦波）
 *   resetSand  - 归零触发（白噪声 + 带通滤波）
 *   ratchet    - 滚轮刻度（方波 + 快速衰减）
 *   stretch    - 拉带绷紧（渐升频率）
 *   snap       - 拉带弹回（宽频冲击）
 *   modeSwitch - 切换模式（轻柔滑音）
 */

class AudioEngine {
  constructor() {
    this.ctx = null
    this._initialized = false
    this._muted = false

    // 延迟初始化标记（需用户交互后初始化）
    this._pendingInit = false
  }

  /**
   * 初始化音频上下文（必须在用户手势中调用）
   * 小程序限制：需在 touchstart / touchend 等手势中首次调用
   */
  init() {
    if (this._initialized) return

    try {
      // 使用小程序专用 Web Audio API
      this.ctx = wx.createWebAudioContext()
      this._initialized = true

      // 设置默认音量
      if (this.ctx && this.ctx.destination) {
        this._masterGain = this.ctx.createGain()
        this._masterGain.gain.value = 0.3
        this._masterGain.connect(this.ctx.destination)
      }
    } catch (e) {
      console.warn('AudioEngine: WebAudioContext init failed', e)
      this._initialized = false
    }
  }

  /** 延迟初始化（手势外调用，标记到下次手势） */
  lazyInit() {
    if (!this._initialized) {
      this._pendingInit = true
    }
  }

  get muted() {
    return this._muted
  }

  set muted(val) {
    this._muted = val
  }

  /** 切换静音 */
  toggle() {
    this._muted = !this._muted
    return this._muted
  }

  /**
   * 播放音效
   * @param {'click'|'resetPress'|'resetSand'|'ratchet'|'stretch'|'snap'|'modeSwitch'} name
   */
  play(name) {
    if (this._muted) return
    if (!this._initialized) {
      // 尝试初始化（可能在手势中）
      try {
        this.init()
      } catch {
        return
      }
    }
    if (!this.ctx) return

    try {
      switch (name) {
        case 'click':
          this._playClick()
          break
        case 'resetPress':
          this._playResetPress()
          break
        case 'resetSand':
          this._playResetSand()
          break
        case 'ratchet':
          this._playRatchet()
          break
        case 'stretch':
          this._playStretch()
          break
        case 'snap':
          this._playSnap()
          break
        case 'modeSwitch':
          this._playModeSwitch()
          break
      }
    } catch (e) {
      // 静默失败 — 音频不应阻塞交互
      console.debug('AudioEngine play error:', e)
    }
  }

  /* ─── 内部音效生成 ─── */

  /** 获取目标（masterGain 或直接 destination） */
  _getDestination() {
    return this._masterGain || this.ctx.destination
  }

  /**
   * 创建基础振荡器
   * @param {number} freq - 频率 Hz
   * @param {string} type - 波形类型
   * @param {number} duration - 时长 秒
   * @param {number} volume - 音量 0~1
   * @param {Function} [freqMod] - (t:0→1) => number 频率调制
   */
  _createOsc(freq, type, duration, volume, freqMod) {
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = type
    osc.frequency.value = freq

    // 频率调制
    if (freqMod) {
      const freqParam = osc.frequency
      freqParam.setValueAtTime(freq, now)
      // 使用 automation 实现扫频
      const endFreq = freqMod(1)
      freqParam.linearRampToValueAtTime(endFreq, now + duration)
    }

    // 指数衰减包络
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    osc.connect(gain)
    gain.connect(this._getDestination())

    osc.start(now)
    osc.stop(now + duration + 0.05)
  }

  /** 绿色按钮 "咔嗒" — 800Hz 正弦 + 快速衰减 */
  _playClick() {
    const freq = 800 + (Math.random() - 0.5) * 80 // ±5% 随机防疲劳
    this._createOsc(freq, 'sine', 0.06, 0.4)
  }

  /** 归零按钮 "嗒" — 1200Hz 偏高电子感 */
  _playResetPress() {
    this._createOsc(1200, 'sine', 0.04, 0.35)
  }

  /** 归零 "沙沙消散" — 带通白噪声 + 频率下降 */
  _playResetSand() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const duration = 0.25

    // 用噪声 + 带通滤波器模拟沙沙声
    const bufferSize = this.ctx.sampleRate * duration
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)

    // 填充白噪声，加入指数衰减
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize
      const envelope = Math.exp(-t * 8) // 快速衰减
      data[i] = (Math.random() * 2 - 1) * envelope * 0.6
    }

    const source = this.ctx.createBufferSource()
    source.buffer = buffer

    // 带通滤波器
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 3000
    filter.Q.value = 0.8

    // 频率衰减自动化
    filter.frequency.setValueAtTime(4000, now)
    filter.frequency.exponentialRampToValueAtTime(500, now + duration)

    source.connect(filter)
    filter.connect(this._getDestination())
    source.start(now)
    source.stop(now + duration + 0.05)
  }

  /** 棘轮 "咔" — 600Hz 方波 + 极短 */
  _playRatchet() {
    this._createOsc(600, 'square', 0.03, 0.25)
  }

  /** 拉带绷紧 — 300→800Hz 渐升正弦 */
  _playStretch() {
    this._createOsc(300, 'sine', 0.12, 0.3, (t) => 300 + t * 500)
  }

  /** 拉带弹回 "啪" — 宽频冲击 */
  _playSnap() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const duration = 0.08

    // 用极短白噪声冲击模拟 "啪"
    const bufferSize = Math.ceil(this.ctx.sampleRate * duration)
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 30) // 极快衰减
    }

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this._getDestination())
    source.start(now)
  }

  /** 模式切换滑音 — 两个短音滑过 */
  _playModeSwitch() {
    this._createOsc(500, 'sine', 0.04, 0.2)
    // 延迟第二个音（使用 setTimeout 但通过 ctx 时间线）
    const now = this.ctx.currentTime
    const osc2 = this.ctx.createOscillator()
    const gain2 = this.ctx.createGain()

    osc2.type = 'sine'
    osc2.frequency.value = 700

    gain2.gain.setValueAtTime(0, now + 0.05)
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.06)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

    osc2.connect(gain2)
    gain2.connect(this._getDestination())
    osc2.start(now + 0.05)
    osc2.stop(now + 0.12)
  }

  /** 释放资源 */
  destroy() {
    if (this.ctx && this.ctx.close) {
      try { this.ctx.close() } catch {}
    }
    this.ctx = null
    this._initialized = false
  }
}

// 单例导出
const audioEngine = new AudioEngine()
export default audioEngine
