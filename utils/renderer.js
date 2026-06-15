/**
 * 解压计数器 - Canvas 2D 绘制工具库
 * 所有自定义图形绘制函数集中在此，三种模式从这里组合使用
 * 无状态纯函数，输入坐标/尺寸/颜色，输出 Canvas 绘制
 */

/**
 * 清理整个 Canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - 逻辑宽度
 * @param {number} h - 逻辑高度
 */
export function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h)
}

/* ========================================
 * 基础形状
 * ======================================== */

/**
 * 绘制圆形（带可选径向渐变填充）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 圆心 x
 * @param {number} cy - 圆心 y
 * @param {number} r - 半径
 * @param {object} options
 * @param {string} [options.fill] - 纯色填充
 * @param {[string, string]} [options.gradient] - [高光色, 阴影色] 径向渐变
 * @param {string} [options.stroke] - 描边色
 * @param {number} [options.lineWidth] - 描边宽度
 * @param {object} [options.shadow] - { color, blur, offsetX, offsetY }
 */
export function drawCircle(ctx, cx, cy, r, options = {}) {
  ctx.save()

  // 阴影
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || 'transparent'
    ctx.shadowBlur = options.shadow.blur || 0
    ctx.shadowOffsetX = options.shadow.offsetX || 0
    ctx.shadowOffsetY = options.shadow.offsetY || 0
  }

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()

  // 渐变填充
  if (options.gradient) {
    const grad = ctx.createRadialGradient(
      cx - r * 0.25, cy - r * 0.25, 0,
      cx, cy, r
    )
    grad.addColorStop(0, options.gradient[0])
    grad.addColorStop(1, options.gradient[1])
    ctx.fillStyle = grad
  } else if (options.fill) {
    ctx.fillStyle = options.fill
  }

  if (options.fill || options.gradient) {
    ctx.fill()
  }

  // 描边
  if (options.stroke) {
    ctx.strokeStyle = options.stroke
    ctx.lineWidth = options.lineWidth || 1
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * 向当前 Canvas 路径追加一个圆角矩形子路径（不自动 beginPath）
 * 微信 Canvas 的 ctx.roundRect() 有兼容性问题，统一用此函数
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r - 统一圆角半径
 */
export function pathRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.min(w, h) / 2)
  // 右上角 → 右下角 → 左下角 → 左上角（用 arc 画精确圆弧）
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false)
  ctx.lineTo(x, y + rr)
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false)
  ctx.closePath()
}

/**
 * 绘制圆角矩形（填充/描边一体）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - 左上 x
 * @param {number} y - 左上 y
 * @param {number} w - 宽度
 * @param {number} h - 高度
 * @param {number} r - 圆角半径
 * @param {object} [options] - 同 drawCircle 的 fill/gradient/stroke/shadow
 */
export function drawRoundRect(ctx, x, y, w, h, r, options = {}) {
  ctx.save()

  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || 'transparent'
    ctx.shadowBlur = options.shadow.blur || 0
    ctx.shadowOffsetX = options.shadow.offsetX || 0
    ctx.shadowOffsetY = options.shadow.offsetY || 0
  }

  ctx.beginPath()
  pathRoundRect(ctx, x, y, w, h, r)

  if (options.gradient) {
    const grad = ctx.createRadialGradient(
      x + w * 0.3, y + h * 0.3, 0,
      x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.7
    )
    grad.addColorStop(0, options.gradient[0])
    grad.addColorStop(1, options.gradient[1])
    ctx.fillStyle = grad
  } else if (options.fill) {
    ctx.fillStyle = options.fill
  }

  if (options.fill || options.gradient) {
    ctx.fill()
  }

  if (options.stroke) {
    ctx.strokeStyle = options.stroke
    ctx.lineWidth = options.lineWidth || 1
    ctx.stroke()
  }

  ctx.restore()
}

/* ========================================
 * 高级图形 — 三种模式专用
 * ======================================== */

/**
 * 绘制按压式绿色按钮（带硅胶质感）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 圆心 x
 * @param {number} cy - 圆心 y
 * @param {number} radius - 半径
 * @param {number} [scale=1] - 当前缩放（按下时 0.95~1）
 * @param {boolean} [pressed=false] - 是否按下态
 */
export function drawPressButton(ctx, cx, cy, radius, scale = 1, pressed = false) {
  const r = radius * scale
  const shadowBlur = pressed ? 8 : 20
  const shadowOpacity = pressed ? 0.15 : 0.3

  // 外发光阴影
  drawCircle(ctx, cx, cy, r, {
    gradient: ['#81C784', '#388E3C'],
    shadow: {
      color: `rgba(76, 175, 80, ${shadowOpacity})`,
      blur: shadowBlur,
      offsetY: pressed ? 2 : 4,
    },
  })

  // 表面高光（左上角小椭圆）
  if (!pressed) {
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx - r * 0.2, cy - r * 0.25, r * 0.35, r * 0.25, -0.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.fill()
    ctx.restore()
  }

  // 中心 "+" 压痕
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  const crossSize = r * 0.2
  ctx.beginPath()
  ctx.moveTo(cx - crossSize, cy)
  ctx.lineTo(cx + crossSize, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - crossSize)
  ctx.lineTo(cx, cy + crossSize)
  ctx.stroke()
  ctx.restore()
}

/**
 * 绘制垂直金属滚轮
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 中心 x
 * @param {number} cy - 中心 y
 * @param {number} width - 滚轮宽度
 * @param {number} height - 滚轮高度
 * @param {number} [offset=0] - 滚动偏移（px），向上为正
 * @param {number} [tickCount=20] - 刻度数量
 */
export function drawScrollWheel(ctx, cx, cy, width, height, offset = 0, tickCount = 20) {
  const rx = cx - width / 2
  const ry = cy - height / 2
  const radius = width / 2  // 垂直滚轮以宽度为圆角基准

  // ─── 主体：金属渐变圆柱（垂直方向） ───
  ctx.save()
  ctx.beginPath()
  pathRoundRect(ctx, rx, ry, width, height, radius)
  ctx.clip()

  // 垂直金属渐变（上→中→下）
  const metalGrad = ctx.createLinearGradient(0, ry, 0, ry + height)
  metalGrad.addColorStop(0, '#455A64')
  metalGrad.addColorStop(0.15, '#78909C')
  metalGrad.addColorStop(0.3, '#B0BEC5')
  metalGrad.addColorStop(0.45, '#ECEFF1')
  metalGrad.addColorStop(0.5, '#FFFFFF')
  metalGrad.addColorStop(0.55, '#ECEFF1')
  metalGrad.addColorStop(0.7, '#B0BEC5')
  metalGrad.addColorStop(0.85, '#78909C')
  metalGrad.addColorStop(1, '#455A64')

  ctx.fillStyle = metalGrad
  ctx.fillRect(rx, ry, width, height)

  // ─── 刻度线（沿垂直方向） ───
  ctx.strokeStyle = '#37474F'
  ctx.lineWidth = 1.5

  const spacing = height * 0.8 / tickCount
  const startY = ry + height * 0.1

  for (let i = -5; i <= tickCount + 5; i++) {
    const y = startY + (i * spacing + offset) % (height * 0.8)

    // 循环偏移
    let wrappedY = ((y - startY) % (height * 0.8) + (height * 0.8)) % (height * 0.8) + startY

    if (wrappedY < ry - spacing || wrappedY > ry + height + spacing) continue

    // 长/短刻度交替（长刻度横跨更宽）
    const isLong = i % 5 === 0
    const tickW = isLong ? width * 0.55 : width * 0.35
    const tickX1 = rx + (width - tickW) / 2
    const tickX2 = tickX1 + tickW

    ctx.beginPath()
    ctx.moveTo(tickX1, wrappedY)
    ctx.lineTo(tickX2, wrappedY)
    ctx.stroke()
  }

  ctx.restore()

  // ─── 左/右边缘高光线 ───
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(rx + 2, ry + 4)
  ctx.lineTo(rx + 2, ry + height - 4)
  ctx.stroke()
  ctx.restore()

  // ─── 三角指示标（左侧） ───
  ctx.save()
  ctx.fillStyle = '#FF7043'
  ctx.shadowColor = 'rgba(255, 112, 67, 0.4)'
  ctx.shadowBlur = 6
  // 三角形指向滚轮中心
  ctx.beginPath()
  ctx.moveTo(rx - 10, cy)
  ctx.lineTo(rx - 2, cy - 8)
  ctx.lineTo(rx - 2, cy + 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * 绘制橡胶拉带
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} topY
 * @param {number} bottomY
 * @param {number} strapWidth
 * @param {number} [pullOffset=0]
 * @param {number} [dotCount=4]
 * @param {number} [clampedLevel=0]
 * @param {boolean} [noColorChange=false] - true=仅变长度不变色
 */
export function drawPullStrap(ctx, cx, topY, bottomY, strapWidth, pullOffset = 0, dotCount = 4, clampedLevel = 0, noColorChange = false) {
  const currentBottomY = bottomY + pullOffset
  const currentHeight = Math.max(currentBottomY - topY, 1)

  const strapColor = noColorChange ? '#FFC107' : '#FFC107' // 保持黄色不变
  const displayWidth = strapWidth // 不变窄

  const strapX = cx - displayWidth / 2

  // ─── 绘制拉带 ───
  ctx.save()
  ctx.shadowColor = 'rgba(255, 193, 7, 0.25)'
  ctx.shadowBlur = 12

  ctx.beginPath()
  pathRoundRect(ctx, strapX, topY, displayWidth, currentHeight, displayWidth / 2)
  ctx.fillStyle = strapColor
  ctx.fill()
  ctx.shadowBlur = 0

  // 纵向防滑纹理
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const lx = strapX + displayWidth * 0.25 * (i + 1)
    ctx.beginPath()
    ctx.moveTo(lx, topY + 8)
    ctx.lineTo(lx, currentBottomY - 8)
    ctx.stroke()
  }
  ctx.restore()

  // ─── 刻度圆点（随拉带等比拉伸） ───
  for (let i = 1; i <= dotCount; i++) {
    const dotY = topY + currentHeight * (i / (dotCount + 1))
    const isClamped = i <= clampedLevel
    ctx.save()
    if (isClamped) {
      ctx.shadowColor = 'rgba(255, 107, 107, 0.5)'
      ctx.shadowBlur = 8
    }
    ctx.beginPath()
    ctx.arc(cx, dotY, isClamped ? 5 : 3.5, 0, Math.PI * 2)
    ctx.fillStyle = isClamped ? '#FF6B6B' : 'rgba(255, 107, 107, 0.5)'
    ctx.fill()
    ctx.restore()
  }

  // ─── 顶部拉环（握持区） ───
  ctx.save()
  ctx.strokeStyle = '#FFC107'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  const ringR = strapWidth * 0.5
  ctx.beginPath()
  ctx.arc(cx, topY - ringR + 2, ringR, Math.PI * 0.1, Math.PI * 0.9, false)
  ctx.stroke()
  ctx.restore()

  // ─── 红色极限警告 ───
  if (clampedLevel >= dotCount) {
    ctx.save()
    ctx.strokeStyle = `rgba(255, 0, 0, ${0.2 + 0.15 * Math.sin(Date.now() / 120)})`
    ctx.lineWidth = 2
    ctx.shadowColor = 'rgba(255, 0, 0, 0.3)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    pathRoundRect(ctx, strapX - 3, topY - 3, displayWidth + 6, currentHeight + 6, displayWidth / 2 + 2)
    ctx.stroke()
    ctx.restore()
  }
}

/* ========================================
 * 数字 & 文本工具
 * ======================================== */

/**
 * 格式化大数字（加千分位逗号）
 * @param {number} num
 * @returns {string}
 */
export function formatCount(num) {
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/* ========================================
 * 颜色工具
 * ======================================== */

/**
 * 十六进制色 → rgba 字符串
 * @param {string} hex - #RRGGBB
 * @param {number} alpha - 0~1
 * @returns {string}
 */
export function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 颜色插值（用于拉伸渐变色）
 * @param {string} colorA - rgb/rgba 字符串
 * @param {string} colorB - rgb/rgba 字符串
 * @param {number} t - 0~1
 * @returns {string}
 */
export function lerpColor(colorA, colorB, t) {
  const parseRGB = (str) => {
    const m = str.match(/(\d+)/g)
    return m ? m.map(Number) : [0, 0, 0]
  }
  const [r1, g1, b1] = parseRGB(colorA)
  const [r2, g2, b2] = parseRGB(colorB)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r}, ${g}, ${b})`
}

/* ========================================
 * Canvas 基础设置
 * ======================================== */

/**
 * 设置 Canvas DPR 缩放
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {number} dpr
 * @param {number} width - 逻辑宽度
 * @param {number} height - 逻辑高度
 */
export function setupCanvas(ctx, canvas, dpr, width, height) {
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
}
