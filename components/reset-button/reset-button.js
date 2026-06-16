/**
 * 解压计数器 - 归零按钮组件（简化版）
 * 圆形按钮，暗红底色 + 回转箭头，与统计按钮风格一致
 * 按下：弹性缩放 + 音效 + light震动 → 归零触发：沙沙音效 + heavy震动
 *
 * 事件：
 *   reset - 归零操作触发，父页面监听
 */

let audioEngine = null
let hapticEngine = null

Component({
    properties: {},

    data: {
        pressed: false,
    },

    lifetimes: {
        attached() {
            this._initAudioAndHaptic()
        },
    },

    methods: {
        _initAudioAndHaptic() {
            try {
                const app = getApp()
                if (app.audioEngine) audioEngine = app.audioEngine
                if (app.hapticEngine) hapticEngine = app.hapticEngine
            } catch (e) {}
        },

        /** 按下 */
        onTouchStart() {
            this.setData({ pressed: true })
            if (audioEngine) audioEngine.play('resetPress')
            if (hapticEngine) hapticEngine.light()
        },

        /** 松开 → 触发归零 */
        onTouchEnd() {
            this.setData({ pressed: false })
            this.triggerEvent('reset')
        },

        /** 播放归零反馈（父页面调用） */
        playResetFeedback() {
            if (audioEngine) audioEngine.play('resetSand')
            if (hapticEngine) hapticEngine.heavy()
        },
    },
})
