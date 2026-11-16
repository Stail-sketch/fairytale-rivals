import { fingerprintColors, fingerprintIds, gridSize } from './rivals-card-fingerprints.js'

const layouts = [[10, 3], [6, 5], [5, 6]]
const featureLength = gridSize * gridSize * 3
let samples

function whiteLines({ data, width, height }) {
  const groups = []
  const minimum = Math.max(150, width * .38)
  const gap = Math.max(3, Math.round(width * .005))
  for (let y = 0; y < height; y++) {
    let start = 0
    let last = -gap - 1
    let count = 0
    function finish() {
      const span = last - start + 1
      if (span < minimum || count < span * .89) return
      const previous = groups.at(-1)
      if (previous && y <= previous.bottom + 1 &&
          Math.abs(previous.left - start) < width * .015 && Math.abs(previous.right - last) < width * .015) {
        previous.bottom = y
        previous.left = Math.min(previous.left, start)
        previous.right = Math.max(previous.right, last)
      } else groups.push({ top: y, bottom: y, left: start, right: last })
    }
    for (let x = 0, offset = y * width * 4; x < width; x++, offset += 4) {
      if (data[offset] < 211 || data[offset + 1] < 211 || data[offset + 2] < 211) continue
      if (x - last > gap) {
        finish()
        start = x
        count = 0
      }
      last = x
      count++
    }
    finish()
  }
  return groups.sort((a, b) => (b.right - b.left) - (a.right - a.left)).slice(0, 36)
}

function blueSum({ data, width, height }) {
  const stride = width + 1
  const blue = new Uint32Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let count = 0
    for (let x = 0, offset = y * width * 4; x < width; x++, offset += 4) {
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      count += Number(r < 134 && g > 108 && b > 142 && g - r > 37 && b - r > 60 && b > g - 14)
      blue[(y + 1) * stride + x + 1] = blue[y * stride + x + 1] + count
    }
  }
  return (x, y, right, bottom) => {
    const left = Math.max(0, Math.min(width, Math.round(x)))
    const top = Math.max(0, Math.min(height, Math.round(y)))
    right = Math.max(left, Math.min(width, Math.round(right)))
    bottom = Math.max(top, Math.min(height, Math.round(bottom)))
    return blue[bottom * stride + right] - blue[bottom * stride + left] -
      blue[top * stride + right] + blue[top * stride + left]
  }
}

function frameCandidates(image) {
  const lines = whiteLines(image)
  const frames = []
  for (const start of lines) for (const end of lines) {
    const width = (start.right - start.left + end.right - end.left) / 2
    if (end.top <= start.bottom || Math.abs(start.left - end.left) > width * .026 ||
        Math.abs(start.right - end.right) > width * .026) continue
    frames.push({ x: (start.left + end.left) / 2, y: start.bottom + 1, width, height: end.top - start.bottom - 1, framed: true })
  }
  frames.push({ x: 0, y: 0, width: image.width, height: image.height, framed: false })
  return frames
}

// When video decorations or the in-game skin hide the frame edges, the blue
// cost badges still give the two pitches of the card grid.
function badgeRows(image, blue) {
  const scale = Math.max(2, Math.round(image.width / 480))
  const columns = Math.ceil(image.width / scale)
  const rows = Math.ceil(image.height / scale)
  const active = new Uint8Array(columns * rows)
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    active[y * columns + x] = blue(x * scale, y * scale, (x + 1) * scale, (y + 1) * scale) >= scale * scale / 4
  }

  const bands = new Map()
  const queue = []
  for (let index = 0; index < active.length; index++) {
    if (!active[index]) continue
    active[index] = 0
    queue.length = 0
    queue.push(index)
    let left = columns, right = 0, top = rows, bottom = 0
    for (let offset = 0; offset < queue.length; offset++) {
      const current = queue[offset]
      const y = Math.floor(current / columns)
      const x = current % columns
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      for (let nextY = Math.max(0, y - 1); nextY <= Math.min(y + 1, rows - 1); nextY++) {
        for (let nextX = Math.max(0, x - 1); nextX <= Math.min(x + 1, columns - 1); nextX++) {
          const next = nextY * columns + nextX
          if (!active[next]) continue
          active[next] = 0
          queue.push(next)
        }
      }
    }
    const width = right - left + 1
    const height = bottom - top + 1
    if (queue.length < 6 || width < 2 || height < 2 || width > 17 || height > 16 ||
        width / height < .35 || width / height > 2.3) continue
    const band = bands.get(top) ?? []
    band.push(left * scale)
    bands.set(top, band)
  }
  return [...bands].map(([y, points]) => {
    const neighbors = [...(bands.get(y - 1) ?? []), ...points, ...(bands.get(y + 1) ?? [])]
    return { y: y * scale, anchors: [...new Set(neighbors)], exact: points.length, scale }
  }).filter(band => band.anchors.length >= 4)
    .sort((a, b) => b.anchors.length - a.anchors.length || b.exact - a.exact)
    .slice(0, 14)
}

function gradeGrid(blue, columns, rows, x, y, stepX, stepY, refine = false) {
  const width = stepX * .977
  const height = stepY * .981
  const area = width * height * .046
  let score = 0
  let anchors = 0
  const slots = []
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const left = x + col * stepX
    const top = y + row * stepY
    const badge = blue(left, top, left + width * .257, top + height * .178) / area
    score += Math.min(.42, badge)
    if (badge >= .14) anchors++
    if (refine) {
      // Penalize clipping the top or left edge of a badge.
      const clipped = blue(left - width * .075, top, left, top + height * .165) +
        blue(left, top - height * .04, left + width * .20, top)
      score -= Math.min(.17, clipped / area) * .68
    }
    slots.push({ x: left, y: top, width, height, badge })
  }
  return { score, anchors, rows, columns, slots }
}

function gridFromBadges(image, blue) {
  const bands = badgeRows(image, blue)
  let best = null
  for (const top of bands) for (const bottom of bands) for (const [columns, rows] of layouts) {
    const stepY = (bottom.y - top.y) / (rows - 1)
    if (stepY < 36 || stepY * rows > image.height + top.scale) continue
    for (const aspect of [.786, .793, .800, .807, .814]) {
      const stepX = stepY * aspect
      if (stepX * columns > image.width + top.scale) continue
      for (const anchor of top.anchors) for (let col = 0; col < columns; col++) {
        const start = anchor - col * stepX
        for (const shift of [0, -.035, -.072, -.09]) {
          const x = start + stepX * shift
          if (x < -top.scale || x + stepX * (columns - .04) > image.width + top.scale) continue
          for (const y of [top.y - top.scale, top.y, top.y + top.scale]) {
            if (y < -top.scale || y + stepY * (rows - .03) > image.height + top.scale) continue
            const candidate = gradeGrid(blue, columns, rows, x, y, stepX, stepY, true)
            if (candidate.anchors >= 16 && (!best || candidate.score > best.score)) best = candidate
          }
        }
      }
    }
  }
  return best?.score >= 4.3 ? best : null
}

export function findDeckGrid(image) {
  const blue = blueSum(image)
  let best = null
  for (const frame of frameCandidates(image)) for (const [columns, rows] of layouts) {
    const shape = frame.width * rows / (columns * frame.height)
    if (shape < .73 || shape > .93) continue
    for (const insetX of frame.framed ? [.022, .026, .030] : [.002, .014, .026]) {
      const stepX = frame.width * (1 - insetX * 2) / columns
      const width = stepX * .977
      if (width < 29) continue
      for (const insetY of frame.framed ? [.003, .008, .014] : [.002, .01, .022]) {
        const stepY = frame.height * (1 - insetY * 2) / rows
        const candidate = gradeGrid(blue, columns, rows,
          frame.x + frame.width * insetX, frame.y + frame.height * insetY, stepX, stepY)
        if (!best || candidate.score > best.score) best = candidate
      }
    }
  }
  return best?.score >= 4.3 ? best : gridFromBadges(image, blue)
}

function artSignature(image, slot, dx, dy) {
  const { data, width, height } = image
  const artX = slot.x + slot.width * (.27 + dx)
  const artY = slot.y + slot.height * (.08 + dy)
  const stepX = slot.width * .46 / gridSize
  const stepY = slot.height * .40 / gridSize
  const result = new Float32Array(featureLength)
  for (let row = 0; row < gridSize; row++) for (let col = 0; col < gridSize; col++) {
    const x = Math.max(0, Math.round(artX + col * stepX))
    const y = Math.max(0, Math.round(artY + row * stepY))
    const right = Math.min(width, Math.max(x + 1, Math.round(artX + (col + 1) * stepX)))
    const bottom = Math.min(height, Math.max(y + 1, Math.round(artY + (row + 1) * stepY)))
    const pixels = Math.max(1, (right - x) * (bottom - y))
    const index = (row * gridSize + col) * 3
    for (let py = y; py < bottom; py++) for (let px = x; px < right; px++) {
      const offset = (py * width + px) * 4
      result[index] += data[offset]
      result[index + 1] += data[offset + 1]
      result[index + 2] += data[offset + 2]
    }
    result[index] /= pixels
    result[index + 1] /= pixels
    result[index + 2] /= pixels
  }
  return result
}

function closestCards(image, slot) {
  samples ??= Uint8Array.from(atob(fingerprintColors), char => char.charCodeAt(0))
  const features = [[0, 0], [-.036, 0], [.036, 0], [0, -.025], [0, .025]]
    .map(([dx, dy]) => artSignature(image, slot, dx, dy))
  const scores = fingerprintIds.map((id, index) => {
    const start = index * featureLength
    let best = Infinity
    for (const feature of features) {
      let error = 0
      for (let i = 0; i < featureLength && error < best; i++) {
        const delta = Math.abs(feature[i] - samples[start + i])
        error += delta > 69 ? 69 * (2 * delta - 69) : delta * delta
      }
      best = Math.min(best, error)
    }
    return { id, score: best / (featureLength * 255 ** 2) }
  })
  return scores.sort((a, b) => a.score - b.score).slice(0, 4)
}

function hasArtwork(image, slot) {
  let lit = 0
  for (const row of [.14, .26, .39]) for (const col of [.30, .50, .69]) {
    const x = Math.round(slot.x + slot.width * col)
    const y = Math.round(slot.y + slot.height * row)
    if (x >= image.width || y >= image.height) continue
    const index = (y * image.width + x) * 4
    if (image.data[index] + image.data[index + 1] + image.data[index + 2] > 170) lit++
  }
  return lit >= 4
}

export function readDeckScreenshot(image) {
  const grid = findDeckGrid(image)
  if (!grid) return null
  const slots = grid.slots.map(slot => {
    if (slot.badge < .052 && !hasArtwork(image, slot)) return { ...slot, empty: true, id: null, guesses: [] }
    const guesses = closestCards(image, slot)
    const [first, next] = guesses
    const sure = first && first.score < .030 && (!next || next.score - first.score > Math.max(.005, first.score * .20))
    return { ...slot, id: sure ? first.id : null, guesses }
  })
  // Foil highlights may obscure the art. A sharp copy next to it can corroborate the closest match.
  return { ...grid, slots: slots.map((slot, index) => {
    if (slot.id || !slot.guesses.length) return slot
    const best = slot.guesses[0]
    const neighbors = new Set([slots[index - 1], slots[index + 1]].filter(neighbor =>
      neighbor?.id && neighbor.guesses[0]?.score < .022).map(neighbor => neighbor.id))
    const alternatives = slot.guesses.filter(guess => neighbors.has(guess.id) &&
      guess.score < .046 && guess.score - best.score <= .0015)
    return alternatives.length === 1 ? { ...slot, id: alternatives[0].id } : slot
  }) }
}

export async function scanDeckImage(file) {
  if (!file || file.size > 30 * 1024 * 1024) throw new Error('30 MB以下の画像を選んでください。')
  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('画像を開けませんでした。PNG、JPEG、WebPでお試しください。') }
  try {
    const ratio = Math.min(1, 1920 / bitmap.width, 1600 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.fillStyle = '#000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const result = readDeckScreenshot(context.getImageData(0, 0, canvas.width, canvas.height))
    return { result, canvas }
  } finally {
    bitmap.close()
  }
}

