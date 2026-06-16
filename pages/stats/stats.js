/**
 * 统计页面 — 纯数据展示
 */
import statsStorage from '../../utils/storage'

Page({
    data: {
        totalDisplay: '0',
        historyDays: 7,
        modeCards: [
            { id: 'press', label: 'press', value: '0' },
            { id: 'scroll', label: 'scroll', value: '0' },
            { id: 'pull', label: 'pull', value: '0' },
            { id: 'reset', label: 'reset', value: '0' },
        ],
        logs: [],
        history: [],
    },

    onLoad() {
        this._loadAll()
    },

    onShow() {
        this._loadAll()
    },

    _loadAll() {
        this._loadToday()
        this._loadLogs()
        this._loadHistory()
    },

    _loadToday() {
        const today = statsStorage.getToday()
        const total = today.total || 0

        this.setData({
            totalDisplay: this._fmt(total),
            'modeCards[0].value': this._fmt(today.press || 0),
            'modeCards[1].value': this._fmt(today.scroll || 0),
            'modeCards[2].value': this._fmt(today.pull || 0),
        })

        // 计算归零次数（从日志中统计今日 reset 事件）
        const allLogs = statsStorage.getLogs(2000)
        const todayStr = this._todayStr()
        const resetCount = allLogs.filter((l) => l.mode === 'reset' && l.date === todayStr).length
        this.setData({ 'modeCards[3].value': String(resetCount) })
    },

    _loadLogs() {
        const allLogs = statsStorage.getLogs(200)
        const todayStr = this._todayStr()
        const todayLogs = allLogs
            .filter((l) => l.date === todayStr)
            .reverse()
            .slice(0, 50)
        this.setData({ logs: todayLogs })
    },

    _loadHistory() {
        const days = this.data.historyDays
        const raw = statsStorage.getHistory(days)
        const history = raw.map((d) => ({
            ...d,
            shortDate: d.date.slice(5),
            total: this._fmt(d.total || 0),
            press: this._fmt(d.press || 0),
            scroll: this._fmt(d.scroll || 0),
            pull: this._fmt(d.pull || 0),
        }))
        this.setData({ history })
    },

    onHistoryTab(e) {
        const days = parseInt(e.currentTarget.dataset.days, 10)
        if (days === this.data.historyDays) return
        this.setData({ historyDays: days })
        this._loadHistory()
    },

    onBack() {
        wx.navigateBack()
    },

    _todayStr() {
        const d = new Date()
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    },

    _fmt(n) {
        if (n === 0 || n === undefined || n === null) return '0'
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    },
})
