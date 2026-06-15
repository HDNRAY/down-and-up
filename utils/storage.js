/**
 * 解压计数器 - 本地存储管理系统
 * 按日存储计数数据 + 详细事件日志
 *
 * 存储结构：
 *   counter_stats_date_{YYYY-MM-DD} → { total, press, scroll, pull }
 *   counter_stats_index              → [ 'YYYY-MM-DD', ... ] 最近 30 天
 *   counter_log                      → [ { timestamp, date, time, mode, delta, total, location }, ... ]
 */

const STORAGE_PREFIX = 'counter_stats_'
const INDEX_KEY = STORAGE_PREFIX + 'index'
const LOG_KEY = 'counter_log'
const MAX_DAYS = 30
const MAX_LOG = 2000

class StatsStorage {
    constructor() {
        this._today = this._getTodayStr()
        this._todayData = null
    }
    _getTodayStr() {
        const d = new Date()
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }

    /** 获取今日存储 key */
    _todayKey() {
        return STORAGE_PREFIX + this._today
    }

    /** 获取日期 key */
    _dateKey(dateStr) {
        return STORAGE_PREFIX + dateStr
    }

    /**
    /**
     * 记录计数事件（含详细日志）
     * @param {number} delta - 本次增量
     * @param {string} mode - 'press' | 'scroll' | 'pull'
     * @param {number} total - 当前总计数
     * @param {object} modeCounts - { press, scroll, pull }
     */
    record(delta, mode, total, modeCounts) {
        // 更新日统计
        try {
            const key = this._todayKey()
            let data = wx.getStorageSync(key)

            if (!data || typeof data !== 'object') {
                data = { total: 0, press: 0, scroll: 0, pull: 0 }
                this._addToIndex(this._today)
            }

            if (total > data.total) data.total = total
            if (modeCounts.press > data.press) data.press = modeCounts.press
            if (modeCounts.scroll > data.scroll) data.scroll = modeCounts.scroll
            if (modeCounts.pull > data.pull) data.pull = modeCounts.pull

            wx.setStorageSync(key, data)
            this._todayData = data
        } catch (e) {
            console.warn('StatsStorage: write error', e)
        }

        // 写入详细日志
        try {
            const now = new Date()
            const pad2 = (n) => String(n).padStart(2, '0')
            const entry = {
                timestamp: now.getTime(),
                date: this._getTodayStr(),
                time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`,
                mode,
                delta,
                total,
            }

            let log = []
            try {
                log = wx.getStorageSync(LOG_KEY) || []
            } catch {}
            if (!Array.isArray(log)) log = []
            log.push(entry)
            if (log.length > MAX_LOG) log = log.slice(-MAX_LOG)
            wx.setStorageSync(LOG_KEY, log)
        } catch (e) {
            console.warn('StatsStorage: log error', e)
        }
    }

    /** 今日归零（重置今日数据） */
    resetToday() {
        try {
            const data = { total: 0, press: 0, scroll: 0, pull: 0 }
            wx.setStorageSync(this._todayKey(), data)
            this._todayData = data
        } catch (e) {
            console.warn('StatsStorage: reset error', e)
        }
    }

    /** 获取今日数据 */
    getToday() {
        if (this._todayData) return this._todayData
        try {
            const data = wx.getStorageSync(this._todayKey())
            this._todayData = data || { total: 0, press: 0, scroll: 0, pull: 0 }
            return this._todayData
        } catch {
            return { total: 0, press: 0, scroll: 0, pull: 0 }
        }
    }

    /**
     * 获取历史数据
     * @param {number} days - 最近 N 天（7 或 30）
     * @returns {Array<{ date, total, press, scroll, pull }>}
     */
    getHistory(days = 7) {
        const result = []
        const today = new Date()

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            const dateStr = `${y}-${m}-${day}`

            let data = { total: 0, press: 0, scroll: 0, pull: 0 }
            try {
                const stored = wx.getStorageSync(this._dateKey(dateStr))
                if (stored && typeof stored === 'object') {
                    data = stored
                }
            } catch {}

            result.push({ date: dateStr, ...data })
        }

        return result
    }

    /** 获取今日总计数 */
    getTodayTotal() {
        return this.getToday().total || 0
    }

    /**
     * 获取事件日志
     * @param {number} [limit=200] - 最多返回条数
     * @returns {Array}
     */
    getLogs(limit = 200) {
        try {
            const log = wx.getStorageSync(LOG_KEY) || []
            return Array.isArray(log) ? log.slice(-limit) : []
        } catch {
            return []
        }
    }

    /** 添加到日期索引 */
    _addToIndex(dateStr) {
        try {
            let index = wx.getStorageSync(INDEX_KEY)
            if (!Array.isArray(index)) index = []

            if (!index.includes(dateStr)) {
                index.push(dateStr)
                // 只保留最近 MAX_DAYS 天
                if (index.length > MAX_DAYS) {
                    const removed = index.shift()
                    // 清理过期数据
                    try {
                        wx.removeStorageSync(this._dateKey(removed))
                    } catch {}
                }
                wx.setStorageSync(INDEX_KEY, index)
            }
        } catch (e) {
            console.warn('StatsStorage: index error', e)
        }
    }
}

// 单例导出
const statsStorage = new StatsStorage()
export default statsStorage
