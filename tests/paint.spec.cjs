const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
test.beforeEach(async ({ page }) => { await page.goto('/'); });
async function draw(page, offset = 0) {
  const box = await page.locator('#surface').boundingBox();
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .4 + offset);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5 + offset, { steps: 20 });
  await page.mouse.up();
}
const image = page => page.locator('#surface').evaluate(c => c.toDataURL());
test('draw, undo, redo, erase and layer visibility alter real pixels', async ({ page }) => {
  const blank = await image(page); await draw(page); const painted = await image(page);
  expect(painted).not.toBe(blank);
  await page.locator('#undo').click(); expect(await image(page)).toBe(blank);
  await page.locator('#redo').click(); expect(await image(page)).toBe(painted);
  await page.locator('[data-tool=eraser]').click(); await draw(page); expect(await image(page)).not.toBe(painted);
  await page.locator('#undo').click(); expect(await image(page)).toBe(painted);
  await page.locator('#layers .visibility').click(); expect(await image(page)).toBe(blank);
  await page.locator('#layers .visibility').click(); expect(await image(page)).toBe(painted);
  await page.locator('#add-layer').click(); await expect(page.locator('.layer')).toHaveCount(2);
  await page.locator('[data-tool=brush]').click();
  await draw(page, 70); expect(await image(page)).not.toBe(painted);
});
test('project roundtrip preserves layers and export is a PNG', async ({ page }, testInfo) => {
  await draw(page); await page.locator('#add-layer').click(); await draw(page, 40);
  const before = await image(page);
  const downloadEvent = page.waitForEvent('download'); await page.locator('#save').click();
  const download = await downloadEvent, target = testInfo.outputPath('roundtrip.nawa'); await download.saveAs(target);
  const project = JSON.parse(fs.readFileSync(target, 'utf8')); expect(project.layers).toHaveLength(2);
  await page.locator('#new').click(); expect(await image(page)).not.toBe(before);
  await page.locator('#project-file').setInputFiles(target);
  await expect(page.locator('#status')).toContainText('تم فتح المشروع'); expect(await image(page)).toBe(before);
  const exportEvent = page.waitForEvent('download'); await page.locator('#export').click();
  const png = await exportEvent, pngPath = testInfo.outputPath('artwork.png'); await png.saveAs(pngPath);
  expect(fs.readFileSync(pngPath).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
});
test('stylus pressure changes stroke width and pen-only rejects touch', async ({ page }) => {
  const widths = await page.locator('#surface').evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const emit = (type, x, y, pressure, pointerType = 'pen') => canvas.dispatchEvent(new PointerEvent(type, { clientX: box.x + x * box.width / 1600, clientY: box.y + y * box.height / 1000, pointerId: 77, pointerType, pressure, button: 0, bubbles: true }));
    // Synthetic pointers cannot be captured; mock capture for this pressure calculation only.
    canvas.setPointerCapture = () => {};
    emit('pointerdown', 500, 300, .1); emit('pointerup', 500, 300, 0);
    emit('pointerdown', 800, 300, 1); emit('pointerup', 800, 300, 0);
    const data = canvas.getContext('2d').getImageData(0, 0, 1600, 1000).data;
    const width = x => { let n = 0; for (let y = 270; y < 330; y++) { if (data[(y * 1600 + x) * 4] < 240) n++; } return n; };
    document.getElementById('pen-only').checked = true;
    const before = canvas.toDataURL(); emit('pointerdown', 1100, 300, 1, 'touch'); emit('pointerup', 1100, 300, 0, 'touch');
    return { light: width(500), heavy: width(800), rejectsTouch: before === canvas.toDataURL() };
  });
  expect(widths.heavy).toBeGreaterThan(widths.light * 2); expect(widths.light).toBeGreaterThan(0); expect(widths.rejectsTouch).toBe(true);
});
test('invalid project does not replace existing artwork', async ({ page }) => {
  await draw(page); const before = await image(page);
  await page.locator('#project-file').setInputFiles({ name: 'broken.nawa', mimeType: 'application/json', buffer: Buffer.from('{"format":"bad"}') });
  await expect(page.locator('#status')).toContainText('تعذر فتح المشروع'); expect(await image(page)).toBe(before);
});
test('tablet layout draws and cached interface opens offline', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('#surface')).toBeVisible();
  const blank = await image(page); await draw(page); expect((await image(page)) === blank).toBe(false);
  await page.screenshot({ path: 'test-results/tablet.png' });
  await context.setOffline(false);
});
