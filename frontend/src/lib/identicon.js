const COLORS = [
  ['#0f766e', '#ccfbf1'],
  ['#2563eb', '#dbeafe'],
  ['#7c3aed', '#ede9fe'],
  ['#db2777', '#fce7f3'],
  ['#ea580c', '#ffedd5'],
  ['#16a34a', '#dcfce7'],
  ['#4f46e5', '#e0e7ff'],
  ['#be123c', '#ffe4e6'],
]

function hashString(value) {
  const input = value || 'windchat'
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createIdenticonModel(seed) {
  const hash = hashString(seed)
  const palette = COLORS[hash % COLORS.length]
  const cells = []
  let bits = hash

  for (let y = 0; y < 5; y += 1) {
    const row = []
    for (let x = 0; x < 3; x += 1) {
      row.push(Boolean(bits & 1))
      bits >>>= 1
      if (bits === 0) bits = hashString(`${seed}:${y}:${x}`)
    }
    const mirrored = [row[0], row[1], row[2], row[1], row[0]]
    cells.push(...mirrored)
  }

  if (!cells.some(Boolean)) cells[12] = true

  return {
    background: palette[1],
    cells,
    foreground: palette[0],
  }
}

export function createIdenticonDataUrl(seed) {
  const { background, cells, foreground } = createIdenticonModel(seed)
  const size = 100
  const cell = 18
  const offset = 5
  const rects = cells
    .map((filled, index) => {
      if (!filled) return ''
      const x = offset + (index % 5) * cell
      const y = offset + Math.floor(index / 5) * cell
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${foreground}"/>`
    })
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${background}"/>${rects}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
