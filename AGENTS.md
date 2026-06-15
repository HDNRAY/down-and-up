# 解压计数器 · 项目开发指南

> 本项目是 AGENTS.md 驱动的 AI 辅助开发。此文件是所有开发行为的参考原点。
> 开始新任务前先读此文件，确保架构一致性。

---

## 一、项目概述

**产品**：解压计数器 — 一款极简无文字界面的微信小程序。
**核心理念**：不是"会发声的计数器"，而是"有数字的指尖解压玩具"。
**技术栈**：微信小程序原生框架（WXML + WXSS + JS）+ Canvas 2D。

---

## 二、架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 框架 | 微信原生小程序 | 轻量，API 完备，上线流程简单 |
| 渲染 | WXML 外围 + Canvas 交互区 | WXML 处理文字/布局，Canvas 处理自定义图形动画 |
| 动画 | requestAnimationFrame + 手写弹簧物理 | 无第三方依赖，精确控制手感 |
| 音效 | Web Audio API 程序化生成 | 无需外置音频文件，包体小 |
| 震动 | wx.vibrateShort / vibrateLong | 微信原生 API，无需额外权限 |
| 存储 | wx.getStorageSync / setStorageSync | 简洁的同步 API |
| 状态管理 | 页面级状态机 | 单页面+单交互区，无需全局状态库 |

---

## 三、文件组织约定

```
miniapp/
├── AGENTS.md                       # 本文件 — 设计指南
├── app.js                          # 小程序入口
├── app.json                        # 全局配置
├── app.wxss                        # CSS 变量 + 全局 reset
├── project.config.json             # 开发者工具配置
├── pages/
│   └── index/                      # 唯一主页面
│       ├── index.js                # 页面逻辑（状态机、触摸、计数）
│       ├── index.wxml              # WXML 布局（零内联样式）
│       ├── index.wxss              # 页面样式（全 class 选择器）
│       └── index.json              # 页面配置
├── components/
│   ├── reset-button/               # 归零按钮组件
│   │   ├── reset-button.js/wxml/wxss/json
│   └── stats-panel/                # 统计面板组件
│       ├── stats-panel.js/wxml/wxss/json
├── utils/
│   ├── renderer.js                 # Canvas 2D 绘制工具库
│   ├── spring.js                   # 弹簧物理 / 惯性引擎
│   ├── audio.js                    # 程序化音效生成
│   ├── haptics.js                  # 震动封装
│   └── storage.js                  # 本地存储
└── assets/
    └── audio/                      # 预录音效（备用，优先程序化生成）
```

### 命名规则

| 类别 | 规则 | 示例 |
|------|------|------|
| .js 文件 | kebab-case | `spring.js`, `stats-panel.js` |
| 类名 | PascalCase | `PressMode`, `SpringPhysics` |
| 函数/变量 | camelCase | `drawCircle()`, `isPressing` |
| CSS 类名 | kebab-case | `.count-number`, `.dot-indicator` |
| CSS 变量 | `--kebab-case` | `--bg-primary`, `--green-main` |
| 常量 | UPPER_SNAKE | `MAX_SCALE_SPEED`, `FRICTION` |

---

## 四、组件树

```
Page (pages/index)
├── .page-wrapper                  # 全屏容器，暗色背景 + safe-area
│   ├── .top-bar                   # 顶部信息区（fixed）
│   │   ├── .count-number          # 居中巨大数字 (<text>)
│   │   ├── reset-button (custom)  # 归零按钮组件
│   │   └── .calendar-icon         # 日历图标入口
│   ├── #interaction-canvas        # Canvas 交互区 (flex:1)
│   │   ├── PressMode              # 按压模式渲染（绿色圆形按钮）
│   │   ├── ScrollMode             # 滚动模式渲染（金属滚轮）
│   │   └── PullMode               # 拉拽模式渲染（橡胶带）
│   ├── .bottom-bar                # 底部固定区
│   │   └── .mode-indicators       # 三圆点（● ⌇ ↕）
│   └── stats-panel (custom)       # 统计面板（条件渲染，遮罩+滑入）
```

---

## 五、数据流

```
用户触摸 (touchstart/touchmove/touchend)
  │
  ▼
TouchDispatcher (index.js)
  ├── 命中 Canvas 区域 → currentMode.handleTouch(event)
  │     ├── 更新 modeCount (+1 / 按刻度增加)
  │     ├── 触发 FeedbackSystem：
  │     │     ├── AudioEngine.play(soundName)
  │     │     └── HapticEngine.trigger(type)
  │     └── 返回 { count, feedback }
  │
  ├── 命中归零按钮 → resetAll()
  │     ├── 播放归零音效（沙沙消散）
  │     ├── heavy 震动
  │     ├── 数字归零动画（缩→消→弹）
  │     └── Storage.resetToday()
  │
  └── 命中底部指示器 → switchMode(index)
        └── 切换 currentMode + 更新 UI 选中态

count 变更 → setData({ displayCount }) → WXML 绑定更新
每天首次操作 → Storage.initDay() → 创建今日记录
每次变更 → Storage.append(count)
```

---

## 六、反馈系统规格

### 音效表（程序化生成）

| 音效 ID | 波形 | 时长 | 频率 | 效果 |
|---------|------|------|------|------|
| `click` | 正弦波 + 指数衰减 | 50-80ms | 800Hz ±5%随机 | 绿色按钮按压 |
| `reset-press` | 正弦波 + 指数衰减 | 40ms | 1200Hz | 归零按钮按下 |
| `reset-sand` | 白噪声 + 带通滤波 | 200ms | 2-4kHz | 归零沙沙消散 |
| `ratchet` | 方波 + 快速衰减 | 30ms | 600Hz | 滚轮刻度 |
| `stretch` | 正弦波 + 渐升频率 | 100-300ms | 300→800Hz | 拉带绷紧 |
| `snap` | 宽频冲击 + 快速衰减 | 80ms | 全频 | 拉带弹回 |

### 震动表

| 触发 | API | 参数 |
|------|-----|------|
| 绿色按钮按下 | vibrateShort | type: 'light' |
| 归零按钮按下 | vibrateShort | type: 'light' |
| 归零事件 | vibrateShort | type: 'heavy' |
| 滚轮刻度 | vibrateShort | type: 'medium' |
| 拉带第1格 | vibrateShort | type: 'light' |
| 拉带第2格 | vibrateShort | type: 'medium' |
| 拉带第3格 | vibrateShort | type: 'heavy' |
| 拉带第4格 | vibrateShort | type: 'heavy' |
| 拉带弹回 | vibrateLong | — |

---

## 七、编码规范

### WXML
- **零内联样式**：禁止 `style="..."` 属性，所有样式走 class
- **语义化 class**：`.count-number`, `.mode-indicator`, `.reset-btn`
- **条件渲染用 wx:if**：`<view wx:if="{{showStats}}">`
- **列表用 wx:for**：`<view wx:for="{{modes}}" wx:key="id">`

### WXSS
- **全 class 选择器**：禁止标签选择器（除 `page {}` reset 外）
- **CSS 变量集中管理**：所有颜色/尺寸在 `app.wxss` 定义 `--*` 变量
- **rpx 单位**：尺寸用 rpx 适配屏幕，Canvas 内用 px（通过 DPR 换算）
- **BEM 风格 class**：`.component__element--modifier`

### JavaScript
- **ES6+ 语法**：const/let, arrow function, class, destructuring
- **无大量重复代码**：三种模式共享 renderer.js 工具函数
- **Canvas 绘制函数收归 utils/renderer.js**，模式类只做组合和交互逻辑
- **setData 最小化**：只 set 变化的数据，不 set 整个对象

### 注释规范
- 每个 class 前 JSDoc 说明职责
- 复杂物理公式旁加注释
- WXML 中关键 block 前加 HTML 注释 `<!-- 计数数字 -->`

---

## 八、微信小程序限制备忘

| 限制 | 应对 |
|------|------|
| Canvas 2D 需在 `onReady` 后初始化 | 使用 `wx.createSelectorQuery()` 获取 node |
| 音频需用户交互后才可播放 | `wx.createInnerAudioContext()` 在 touchstart 时初始化 |
| 震动 API 有频率限制 | 两次振动间隔至少 50ms |
| 本地存储上限约 10MB | 只存每日 count 汇总，不存明细 |
| 自定义组件通信 | 通过 properties + triggerEvent |
| 小程序包体上限 2MB（主包） | 无第三方依赖，程序化音效，充分压缩 |

---

## 九、颜色系统

```
--bg-primary:    #1A1A2E    /* 深色背景 */
--bg-secondary:  #16213E    /* 次级背景 */
--text-primary:  #EAEAEA    /* 主文字/数字 */
--green-main:    #4CAF50    /* 绿色按钮主色 */
--green-light:   #81C784    /* 绿色按钮高光 */
--orange-reset:  #FF7043    /* 归零按钮暖橙红 */
--orange-light:  #FFAB91    /* 归零按钮高光 */
--metal-base:    #78909C    /* 滚轮金属基底 */
--metal-highlight:#B0BEC5   /* 滚轮金属高光 */
--strap-yellow:  #FFC107    /* 拉带黄色 */
--strap-coral:   #FF6B6B    /* 拉带极限红 */
--mode-off:      #555555    /* 模式指示器未选中 */
--mode-on:       #EAEAEA    /* 模式指示器选中 */
--overlay:       rgba(0,0,0,0.6)  /* 遮罩层 */
```

---

## 十、开发顺序（已计划）

| 序号 | 内容 | 产出 |
|------|------|------|
| 0 | ✅ AGENTS.md | 本文件 |
| 1 | 项目脚手架 | app.js/json/wxss, project.config.json, 页面骨架 |
| 2 | Canvas 渲染引擎 + 弹簧物理 | renderer.js, spring.js |
| 3 | 音效 + 震动系统 | audio.js, haptics.js |
| 4 | 主页面 WXML 布局 | index.wxml + index.wxss |
| 5 | 归零按钮组件 | reset-button 组件 |
| 6 | 三种交互模式 | PressMode / ScrollMode / PullMode |
| 7 | 主页面逻辑串联 | 状态机 + 触摸 + 反馈 |
| 8 | 统计面板 + 存储 | stats-panel + storage.js |
