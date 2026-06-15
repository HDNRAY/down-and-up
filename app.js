// 解压计数器 - 小程序入口
App({
    globalData: {
        theme: {
            bgPrimary: '#1A1A2E',
            bgSecondary: '#16213E',
            textPrimary: '#EAEAEA',
            greenMain: '#4CAF50',
            greenLight: '#81C784',
            orangeReset: '#FF7043',
            orangeLight: '#FFAB91',
            metalBase: '#78909C',
            metalHighlight: '#B0BEC5',
            strapYellow: '#FFC107',
            strapCoral: '#FF6B6B',
        },
        pixelRatio: 2,
        screenWidth: 375,
        screenHeight: 667,
        safeAreaTop: 44,
        safeAreaBottom: 34,
    },
    onLaunch() {
        // 使用新版 API（getSystemInfoSync 已弃用）
        const windowInfo = wx.getWindowInfo()
        this.globalData.pixelRatio = windowInfo.pixelRatio
        this.globalData.screenWidth = windowInfo.screenWidth
        this.globalData.screenHeight = windowInfo.screenHeight
        this.globalData.safeAreaTop = windowInfo.safeArea.top
        this.globalData.safeAreaBottom = windowInfo.screenHeight - windowInfo.safeArea.bottom
    },
})
