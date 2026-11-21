// Run after npm run build: node --test test/sharp-image-compat.test.cjs
// Real image decoder and compiled upload services; storage and database stay in memory.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { ItemsService } = require('../dist/items/items.service');
const { BusinessesService } = require('../dist/businesses/businesses.service');

function uploadTarget(kind) {
  const uploads = [];
  const storageService = {
    uploadObject: async (object) => uploads.push(object),
    getPublicUrl: (key) => `https://example.invalid/${key}`,
    deleteObject: async () => {},
  };
  const prisma = {
    item: { findFirst: async () => ({ id: 'item' }) },
    itemImage: {
      aggregate: async () => ({ _max: { order: null } }),
      create: async ({ data }) => data,
    },
    business: {
      findUnique: async () => ({ id: 'business', logoObjectKey: null }),
      update: async ({ data }) => ({ id: 'business', ...data }),
    },
  };
  const service = Object.assign(
    Object.create(kind === 'product' ? ItemsService.prototype : BusinessesService.prototype),
    { prisma, storageService },
  );
  return {
    uploads,
    upload: (buffer, mimetype, size = buffer.length) => {
      const file = { buffer, mimetype, size };
      return kind === 'product'
        ? service.uploadImage('business', 'item', file)
        : service.uploadLogo('business', file);
    },
  };
}

const create = () => sharp({ create: {
  width: 1600, height: 800, channels: 4,
  background: { r: 200, g: 70, b: 30, alpha: 0.25 },
} });
const formats = [
  ['JPEG', 'image/jpeg', () => create().flatten().jpeg().toBuffer(), false],
  ['PNG', 'image/png', () => create().png().toBuffer(), true],
  ['WebP', 'image/webp', () => create().webp().toBuffer(), true],
  ['GIF', 'image/gif', () => create().gif().toBuffer(), false],
  ['AVIF', 'image/avif', () => create().avif({ effort: 0 }).toBuffer(), true],
  ['SVG', 'image/svg+xml', async () => Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="red" fill-opacity="0.25"/></svg>',
  ), true],
];

for (const kind of ['product', 'logo']) {
  for (const [format, mime, fixture, alpha] of formats) {
    test(`${kind}: ${format} becomes bounded WebP${alpha ? ' with transparency' : ''}`, async () => {
      const target = uploadTarget(kind);
      await target.upload(await fixture(), mime);
      assert.equal(target.uploads.length, 1);
      const { body, contentType } = target.uploads[0];
      const metadata = await sharp(body).metadata();
      assert.equal(contentType, 'image/webp');
      assert.equal(metadata.format, 'webp');
      const bound = kind === 'product' ? 1200 : 768;
      assert.equal(metadata.width, bound);
      assert.equal(metadata.height, bound / 2);
      if (alpha) {
        assert.equal(metadata.hasAlpha, true);
        const { data, info } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
        const value = data[info.channels - 1];
        assert(value > 0 && value < 255, `alpha must remain fractional, got ${value}`);
      }
    });
  }

  test(`${kind}: applies EXIF orientation and does not enlarge`, async () => {
    const input = await sharp({ create: { width: 80, height: 40, channels: 3, background: 'red' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const target = uploadTarget(kind);
    await target.upload(input, 'image/jpeg');
    const metadata = await sharp(target.uploads[0].body).metadata();
    assert.equal(metadata.width, 40);
    assert.equal(metadata.height, 80);
    assert.equal(metadata.orientation, undefined);
  });

  test(`${kind}: invalid image and oversized upload never reach storage`, async () => {
    const target = uploadTarget(kind);
    await assert.rejects(target.upload(Buffer.from('not an image'), 'image/png'));
    await assert.rejects(target.upload(Buffer.alloc(1), 'image/png', 15 * 1024 * 1024 + 1));
    assert.equal(target.uploads.length, 0);
  });
}

test('native decoder matches the pinned sharp dependency', () => {
  assert.equal(sharp.versions.sharp, require('../package.json').dependencies.sharp);
  console.log('sharp native versions:', JSON.stringify(sharp.versions));
});
