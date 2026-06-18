/**
 * 数据特点分析引擎
 * 输入：河流图小时桶数据 + 原始日志
 * 输出：行为洞察列表（按权重排序）
 */

const MODES = ['press', 'pull', 'bounce']
const MODE_ORDER = ['press', 'pull', 'bounce', 'reset']
const MODE_LABELS = { press: '按', pull: '拉', bounce: '抬' }

/**
 * 主入口
 * @param {Object} riverData - getHourlyBuckets() 返回值
 * @param {Array} logs - getAllLogs() 返回值
 * @returns {Array<{ icon, title, desc, weight }>}
 */
export function analyze(riverData, logs) {
    if (!riverData || logs.length < 20) return []

    const findings = []

    // 各模式总次数
    const modeTotal = { press: 0, pull: 0, bounce: 0, reset: 0 }
    for (const b of riverData.buckets) {
        for (const m of MODE_ORDER) modeTotal[m] += b[m] || 0
    }
    const allTotal = Object.values(modeTotal).reduce((a, b) => a + b, 0)
    if (allTotal === 0) return []

    // ─── 1. 模式偏好（某模式 > 60% 才算偏好，且至少 50 次） ───
    for (const m of MODES) {
        const pct = Math.round((modeTotal[m] / allTotal) * 100)
        if (pct > 60 && modeTotal[m] >= 50) {
            const info = MODE_FINDINGS[m]
            findings.push({
                icon: info.icon,
                title: info.title,
                desc: `${MODE_LABELS[m]} 占了你所有操作的 ${pct}%，${info.desc}`,
                weight: pct,
            })
        }
    }

    // ─── 2. 时段偏好（从日志按小时统计） ───
    // 时段定义：各时段可包含多个不连续区间
    const SLOTS = [
        { key: 'night', label: '🌙 深夜', ranges: [[22, 6]] },
        {
            key: 'commute',
            label: '🚇 通勤',
            ranges: [
                [6, 9],
                [17, 19],
            ],
        },
        {
            key: 'work',
            label: '💼 上班',
            ranges: [
                [9, 12],
                [14, 17],
            ],
        },
        { key: 'lunch', label: '🍚 中饭', ranges: [[12, 14]] },
        { key: 'dinner', label: '🍜 晚饭', ranges: [[19, 22]] },
    ]

    // 按模式统计各时段操作数
    const slotDist = {}
    for (const m of MODES) {
        slotDist[m] = { night: 0, commute: 0, work: 0, lunch: 0, dinner: 0 }
    }

    for (const log of logs) {
        if (!MODES.includes(log.mode)) continue
        const hour = _parseHour(log.time)
        if (hour === -1) continue
        for (const slot of SLOTS) {
            for (const [start, end] of slot.ranges) {
                let inSlot = false
                if (start < end) inSlot = hour >= start && hour < end
                else inSlot = hour >= start || hour < end
                if (inSlot) {
                    slotDist[log.mode][slot.key]++
                    break
                }
            }
        }
    }

    const SLOT_TIPS = {
        press: {
            night: '深夜还在按，是不是失眠了？',
            commute: '通勤路上也不忘按一下',
            work: '上班摸鱼按一按，解解压',
            lunch: '边吃饭边按，真会利用时间',
            dinner: '晚饭时间也在按，你是有多紧张',
        },
        pull: {
            night: '你总是在深夜寻求答案···',
            commute: '通勤路上拉一拉，今天运势如何？',
            work: '上班偷偷拉答案之书，遇到难题了？',
            lunch: '午饭时间拉绳，在思考人生？',
            dinner: '晚饭时拉答案之书，有心事？',
        },
        bounce: {
            night: '深夜还在颠球，你是真的热爱',
            commute: '通勤路上颠球，活力满满',
            work: '上班偷偷颠球，摸鱼高手',
            lunch: '午休颠球，饭后运动',
            dinner: '晚饭后颠球消消食',
        },
    }

    for (const m of MODES) {
        const dist = slotDist[m]
        const total = Object.values(dist).reduce((a, b) => a + b, 0)
        if (total === 0) continue
        let bestSlot = null,
            bestPct = 0
        for (const [k, v] of Object.entries(dist)) {
            const pct = Math.round((v / total) * 100)
            if (pct > bestPct) {
                bestPct = pct
                bestSlot = k
            }
        }
        if (bestPct > 35 && total >= 30) {
            const slotObj = SLOTS.find((s) => s.key === bestSlot)
            const tip = (SLOT_TIPS[m] && SLOT_TIPS[m][bestSlot]) || ''
            findings.push({
                icon: slotObj ? slotObj.label.split(' ')[0] : '🕐',
                title: slotObj ? slotObj.label.split(' ').slice(1).join('') : '',
                desc: tip,
                weight: bestPct,
            })
        }
    }

    // ─── 3. 爆发窗口（1-3小时内的集中操作） ───
    const { buckets } = riverData
    const n = buckets.length
    if (n >= 3) {
        // 滑动窗口：1h, 2h, 3h
        const windows = [1, 2, 3]
        let bestBurst = { count: 0, window: 0, startHour: 0, modes: {} }

        for (const w of windows) {
            for (let i = 0; i <= n - w; i++) {
                let sum = 0
                const modeCounts = {}
                for (let j = 0; j < w; j++) {
                    for (const m of MODE_ORDER) {
                        const v = buckets[i + j][m] || 0
                        sum += v
                        modeCounts[m] = (modeCounts[m] || 0) + v
                    }
                }
                if (sum > bestBurst.count) {
                    bestBurst = { count: sum, window: w, startHour: i, modes: modeCounts }
                }
            }
        }

        // 平均值
        const avgPerHour = allTotal / Math.max(1, n)
        if (bestBurst.count > avgPerHour * bestBurst.window * 3 && bestBurst.count >= 15) {
            // 找爆发期占比最高的模式（排除 reset）
            let topMode = null,
                topPct = 0
            for (const m of MODES) {
                const pct = Math.round(((bestBurst.modes[m] || 0) / bestBurst.count) * 100)
                if (pct > topPct) {
                    topPct = pct
                    topMode = m
                }
            }
            const modeInfo = topMode ? `${MODE_LABELS[topMode]} ${topPct}%` : ''

            const ratio = Math.round(bestBurst.count / (avgPerHour * bestBurst.window))
            // 换算具体日期时间
            const burstStartMs = riverData.startTime + bestBurst.startHour * 3600000
            const d = new Date(burstStartMs)
            const y = d.getFullYear()
            const mo = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            const h = String(d.getHours()).padStart(2, '0')
            const endH = String((d.getHours() + bestBurst.window) % 24).padStart(2, '0')
            const dateStr = `${y}-${mo}-${day} ${h}:00-${endH}:00`
            findings.push({
                icon: '💥',
                title: '爆发型选手',
                desc: `你曾在 ${dateStr} 连续 ${bestBurst.window} 小时内操作了 ${bestBurst.count} 次（${modeInfo}），是平均水平的 ${ratio} 倍`,
                weight: Math.min(bestBurst.count, 80),
            })
        }
    }

    // ─── 4. 归零分析 ───
    const resetCount = modeTotal.reset || 0

    // 从不归零 — 需要达到一定操作量才有意义
    if (resetCount === 0) {
        if (allTotal >= 99999) {
            findings.push({
                icon: '🏆',
                title: '终极不归零',
                desc: `操作了 ${_fmt(allTotal)} 次从未归零，这是什么样的意志力`,
                weight: 100,
            })
        } else if (allTotal >= 10000) {
            findings.push({
                icon: '🧹',
                title: '从不归零',
                desc: `操作了 ${_fmt(allTotal)} 次从未按过归零，一往无前`,
                weight: 90,
            })
        } else if (allTotal >= 1000) {
            findings.push({
                icon: '🧹',
                title: '从不归零',
                desc: `操作了 ${_fmt(allTotal)} 次从未按过归零`,
                weight: 70,
            })
        }
    }

    // 按 weight 降序排列，取 top 6
    findings.sort((a, b) => b.weight - a.weight)
    return findings.slice(0, 6)
}

// ─── 辅助 ───

const MODE_FINDINGS = {
    press: { icon: '🟢', title: '解压狂魔', desc: '你是绿色按钮的重度用户' },
    pull: { icon: '📖', title: '答案之友', desc: '你很喜欢从答案之书寻找指引' },
    bounce: { icon: '🏓', title: '乒乓小将', desc: '颠球是你的最爱' },
}

function _parseHour(timeStr) {
    if (!timeStr) return -1
    const parts = timeStr.split(':')
    return parseInt(parts[0], 10)
}

function _fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
