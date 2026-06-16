// 解压计数器 - 主页面逻辑 v5
// 走马灯只有占位图，单个真 canvas 覆盖活跃模式

import { PressMode } from '../../utils/PressMode'
import { ScrollMode } from '../../utils/ScrollMode'
import { PullMode } from '../../utils/PullMode'
import { BounceMode } from '../../utils/BounceMode'
import audioEngine from '../../utils/audio'
import hapticEngine from '../../utils/haptics'
import statsStorage from '../../utils/storage'

const app = getApp()
app.audioEngine = audioEngine
app.hapticEngine = hapticEngine

const MODE_LIST = [
    { id: 'pull', label: 'PULL' },
    { id: 'scroll', label: 'SCROLL' },
    { id: 'press', label: 'PRESS' },
    { id: 'bounce', label: 'BOUNCE' },
]

Page({
    data: {
        currentMode: 'pull',
        currentModeIndex: 0,
        modes: MODE_LIST,
        safeAreaTop: 44,
        safeAreaBottom: 34,
        // 滚筒数字
        digitSlots: [0, 0, 0, 0, 0].map(() => ({ translateY: 0 })),
        digits10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    },

    onLoad() {
        const windowInfo = wx.getWindowInfo()
        this.pixelRatio = app.globalData.pixelRatio || windowInfo.pixelRatio

        // 计算安全区，确保内容在右上角导航按钮下方
        let topOffset = 44
        try {
            const menu = wx.getMenuButtonBoundingClientRect()
            topOffset = menu.bottom + 8
        } catch (_) {
            topOffset = (windowInfo.safeArea.top || 44) + 32
        }
        const safeAreaTop = app.globalData.safeAreaTop || topOffset

        const safeAreaBottom =
            app.globalData.safeAreaBottom ||
            windowInfo.screenHeight - (windowInfo.safeArea.bottom || windowInfo.screenHeight) ||
            34
        this.setData({
            safeAreaTop: safeAreaTop,
            safeAreaBottom: safeAreaBottom + 8,
        })

        this.count = 0
        this.modeCounts = { pull: 0, scroll: 0, press: 0 }
        this.modeInstances = {}
        this._loopCancelled = false
        this._pageWidth = 0
        this._activeModeId = 'pull'
        this._canvasNode = null
        this._canvasCtx = null
    },

    onReady() {
        this._initModeArea()
    },

    onUnload() {
        this._loopCancelled = true
        this._stopBounceGyro()
        audioEngine.destroy()
    },

    /* ========================================
     * 初始化模式画布
     * ======================================== */

    _initModeArea() {
        wx.createSelectorQuery()
            .select('.mode-area')
            .boundingClientRect((rect) => {
                if (!rect) return
                const w = rect.width
                const h = rect.height - 56
                this._pageWidth = w
                this._initCanvas(w, h)
                this._initModeInstances(w, h)
                this._startMainLoop()
            })
            .exec()
    },

    _initCanvas(pageW, pageH) {
        const dpr = this.pixelRatio
        wx.createSelectorQuery()
            .select('#mode-canvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res || !res[0]) return
                const node = res[0].node
                const ctx = node.getContext('2d')
                node.width = pageW * dpr
                node.height = pageH * dpr
                ctx.scale(dpr, dpr)
                this._canvasNode = node
                this._canvasCtx = ctx
            })
    },

    _initModeInstances(pageW, pageH) {
        const cfg = {
            width: pageW,
            height: pageH,
            audioEngine,
            hapticEngine,
            onCountChange: (delta) => this._onCountChange(delta),
        }
        this.modeInstances = {
            press: new PressMode(cfg),
            scroll: new ScrollMode(cfg),
            pull: new PullMode(cfg),
            bounce: new BounceMode(cfg),
        }
    },

    _switchMode(id) {
        if (id === this._activeModeId) return
        const old = this.modeInstances[this._activeModeId]
        if (old && old.reset) old.reset()

        // 陀螺仪开关
        if (id === 'bounce') {
            this._startBounceGyro()
        } else {
            this._stopBounceGyro()
        }

        this._activeModeId = id
        this.setData({ currentMode: id, currentModeIndex: MODE_LIST.findIndex((m) => m.id === id) })
        audioEngine.play('modeSwitch')
    },

    _startMainLoop() {
        if (this._loopCancelled) return
        let lastTime = Date.now()
        const loop = () => {
            if (this._loopCancelled) return
            const now = Date.now()
            const dt = Math.min((now - lastTime) / 1000, 0.05)
            lastTime = now
            try {
                const inst = this.modeInstances[this._activeModeId]
                if (inst && this._canvasCtx) {
                    inst.update(dt)
                    inst.render(this._canvasCtx)
                }
            } catch (e) {
                console.warn('Render loop error:', e)
                lastTime = Date.now()
            }
            loop._timer = setTimeout(loop, 33)
        }
        loop._timer = setTimeout(loop, 33)
    },

    /* ========================================
     * 触摸 — canvas（模式交互）
     * ======================================== */

    onCanvasTouch(e) {
        audioEngine.init()
        const inst = this.modeInstances[this.data.currentMode]
        if (inst) inst.handleTouchStart(e)
    },

    onCanvasTouchMove(e) {
        const inst = this.modeInstances[this.data.currentMode]
        if (inst) inst.handleTouchMove(e)
    },

    onCanvasTouchEnd(e) {
        const inst = this.modeInstances[this.data.currentMode]
        if (inst) inst.handleTouchEnd(e)
    },

    onModeTap(e) {
        const mode = e.currentTarget.dataset.mode
        if (mode === this.data.currentMode) return
        this._switchMode(mode)
    },

    /* ========================================
     * 模式选择器横滑
     * ======================================== */

    onSelectorTouchStart(e) {
        this._selStartX = e.touches[0]?.x || 0
        this._selSwiped = false
    },

    onSelectorTouchMove(e) {
        if (this._selSwiped) return
        const dx = (e.touches[0]?.x || 0) - this._selStartX
        if (Math.abs(dx) > 20) {
            this._selSwiped = true
            const ci = this.data.currentModeIndex
            const ni = (ci + (dx > 0 ? -1 : 1) + 4) % 4
            this._switchMode(MODE_LIST[ni].id)
        }
    },

    onSelectorTouchEnd() {
        this._selSwiped = false
    },

    /* ========================================
     * 陀螺仪 — BOUNCE 模式
     * ======================================== */

    _startBounceGyro() {
        try {
            wx.startDeviceMotionListening({
                interval: 'ui',
                success: () => {
                    this._gyroHandler = (res) => {
                        const inst = this.modeInstances['bounce']
                        if (inst && inst.setTilt) inst.setTilt(res.beta)
                    }
                    wx.onDeviceMotionChange(this._gyroHandler)
                },
            })
        } catch (e) {
            console.warn('Gyro start failed:', e)
        }
    },

    _stopBounceGyro() {
        try {
            if (this._gyroHandler) {
                wx.offDeviceMotionChange(this._gyroHandler)
                this._gyroHandler = null
            }
            wx.stopDeviceMotionListening()
        } catch (e) {
            // 静默
        }
    },

    /* ========================================
     * 计数 → 滚筒数字更新
     * ======================================== */

    _onCountChange(delta) {
        this.count += delta
        this.modeCounts[this.data.currentMode] += delta
        statsStorage.record(delta, this.data.currentMode, this.count, this.modeCounts)
        this._updateDigitSlots(this.count)
    },

    _updateDigitSlots(count) {
        const displayNum = ((count % 100000) + 100000) % 100000
        const str = String(displayNum).padStart(5, '0')
        const slots = str.split('').map((d) => ({ translateY: `${-parseInt(d) * 10}%` }))
        this.setData({ digitSlots: slots })
    },

    /* ========================================
     * 归零
     * ======================================== */

    onReset() {
        statsStorage.recordReset(this.count)
        this.count = 0
        this.modeCounts = { pull: 0, scroll: 0, press: 0 }
        this._updateDigitSlots(0)
        const inst = this.modeInstances[this.data.currentMode]
        if (inst) inst.reset()
        statsStorage.resetToday()
        audioEngine.play('resetSand')
        hapticEngine.heavy()
    },

    /* ========================================
     * 统计页导航
     * ======================================== */

    onStatsTap() {
        wx.navigateTo({ url: '/pages/stats/stats' })
    },
})
