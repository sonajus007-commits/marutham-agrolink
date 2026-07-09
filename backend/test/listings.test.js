const test = require('node:test');
const assert = require('node:assert/strict');
const { validateImages, MAX_IMAGES, MAX_IMAGE_CHARS } = require('../utils/listings');

const dataUri = (n = 100) => 'data:image/jpeg;base64,' + 'A'.repeat(n);

test('validateImages accepts what a farmer can legitimately send', async (t) => {
  await t.test('undefined means "not supplied" and leaves the column alone', () => {
    assert.deepEqual(validateImages(undefined), { images: undefined });
  });
  await t.test('null clears the images', () => {
    assert.deepEqual(validateImages(null), { images: [] });
  });
  await t.test('an empty array is fine', () => {
    assert.deepEqual(validateImages([]), { images: [] });
  });
  await t.test('base64 data URIs, which is what the client produces today', () => {
    const imgs = [dataUri(), dataUri()];
    assert.deepEqual(validateImages(imgs), { images: imgs });
  });
  await t.test('http(s) URLs, for when images move to object storage', () => {
    const imgs = ['https://cdn.example.com/tomato.jpg'];
    assert.deepEqual(validateImages(imgs), { images: imgs });
  });
  await t.test('png and webp too', () => {
    assert.equal(validateImages(['data:image/png;base64,AAA']).error, undefined);
    assert.equal(validateImages(['data:image/webp;base64,AAA']).error, undefined);
  });
  await t.test(`exactly ${MAX_IMAGES} images is allowed`, () => {
    assert.equal(validateImages([dataUri(), dataUri(), dataUri()]).error, undefined);
  });
});

test('validateImages rejects what the server must not store', async (t) => {
  await t.test('more than the cap', () => {
    assert.match(validateImages([dataUri(), dataUri(), dataUri(), dataUri()]).error, /At most 3 images/);
  });
  await t.test('an oversized image — the client is not a trustworthy size limit', () => {
    assert.match(validateImages([dataUri(MAX_IMAGE_CHARS + 1)]).error, /under ~110 KB/);
  });
  await t.test('a non-array', () => {
    assert.match(validateImages('data:image/jpeg;base64,AAA').error, /must be an array/);
    assert.match(validateImages({ 0: 'x' }).error, /must be an array/);
  });
  await t.test('a non-string entry', () => {
    assert.match(validateImages([123]).error, /non-empty string/);
    assert.match(validateImages([null]).error, /non-empty string/);
    assert.match(validateImages(['']).error, /non-empty string/);
  });
  await t.test('a javascript: or arbitrary scheme', () => {
    assert.match(validateImages(['javascript:alert(1)']).error, /data URI or an http/);
    assert.match(validateImages(['file:///etc/passwd']).error, /data URI or an http/);
  });
  await t.test('a non-image data URI', () => {
    assert.match(validateImages(['data:text/html;base64,PHNjcmlwdD4=']).error, /data URI or an http/);
  });
});
