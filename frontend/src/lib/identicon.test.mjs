import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createIdenticonDataUrl,
  createIdenticonModel,
} from './identicon.js'

test('createIdenticonModel returns a stable mirrored 5x5 pattern', () => {
  const first = createIdenticonModel('alice')
  const second = createIdenticonModel('alice')

  assert.deepEqual(second, first)
  assert.equal(first.cells.length, 25)

  for (let y = 0; y < 5; y += 1) {
    assert.equal(first.cells[y * 5], first.cells[y * 5 + 4])
    assert.equal(first.cells[y * 5 + 1], first.cells[y * 5 + 3])
  }
})

test('createIdenticonDataUrl returns an SVG data url with deterministic colors', () => {
  const url = createIdenticonDataUrl('alice')

  assert.equal(url, createIdenticonDataUrl('alice'))
  assert.match(url, /^data:image\/svg\+xml,/)

  const svg = decodeURIComponent(url.replace('data:image/svg+xml,', ''))
  assert.match(svg, /<svg/)
  assert.match(svg, /#/)
  assert.match(svg, /<rect/)
})
