import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import test from 'node:test'
import { categoryImage } from '../src/lib/shop-images.ts'

test('each category assigns all six example images consistently to store IDs', () => {
  for (const category of ['NAIL', 'HAIR', 'EYELASH', 'SKIN']) {
    const images = new Set()
    for (let index = 0; index < 60; index++) {
      const id = `new-store-${index}`
      const image = categoryImage(id, category)
      assert.match(image, new RegExp(`^/images/shops/${category.toLowerCase()}-[1-6]\\.webp$`))
      assert.equal(categoryImage(id, category), image)
      images.add(image)
    }
    assert.equal(images.size, 6)
    for (const image of images) assert.ok(statSync(new URL(`../public${image}`, import.meta.url)).size > 1000)
  }
})
