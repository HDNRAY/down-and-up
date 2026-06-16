/**
 * 通用图标按钮组件
 * 圆形按钮，CSS 绘制图标，接收 icon / bgColor 属性
 *
 * 属性：
 *   icon    - 图标类型：'reset'（归零箭头）| 'stats'（柱状图）
 *   bgColor - 背景色 CSS 值（如 'rgba(220,60,60,0.55)'）
 * 事件：
 *   tap - 按钮点击/松开触发
 */
Component({
    properties: {
        icon: { type: String, value: 'stats' },
        bgColor: { type: String, value: 'rgba(0,0,0,0.35)' },
    },

    data: {
        pressed: false,
        computedStyle: '',
    },

    observers: {
        bgColor(val) {
            this.setData({
                computedStyle: `background-color: ${val}; box-shadow: inset 0 1rpx 4rpx rgba(0,0,0,0.6), 0 1rpx 0 rgba(255,255,255,0.06);`,
            })
        },
    },

    lifetimes: {
        attached() {
            this.setData({
                computedStyle: `background-color: ${this.properties.bgColor}; box-shadow: inset 0 1rpx 4rpx rgba(0,0,0,0.6), 0 1rpx 0 rgba(255,255,255,0.06);`,
            })
        },
    },

    methods: {
        onTouchStart() {
            this.setData({ pressed: true })
        },

        onTouchEnd() {
            this.setData({ pressed: false })
            // 不手动 triggerEvent('tap')——WeChat 会自动从 touch 序列生成 tap 事件
        },
    },
})
