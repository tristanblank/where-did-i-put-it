#!/usr/bin/env node
/**
 * Generates the three Android adaptive-icon layers from the app mark.
 *
 *   node scripts/android-icons.js
 *
 * The source is assets/images/icon.png — the iOS icon, which is a
 * full-bleed 1024 square: the white crates-and-house-pin mark on the brand
 * cobalt. It cannot be used on Android as-is, and the reason is the whole
 * point of this script.
 *
 * Android masks adaptive icons to a shape the launcher chooses — circle,
 * squircle, rounded square, teardrop. The canvas is 108dp, of which only
 * the central 72dp is ever drawn and only the central **66dp** is
 * guaranteed to survive every mask. A full-bleed square fed into that
 * loses its corners, and this mark keeps its crates near the edges, so
 * cropping it to 512 would slice them off.
 *
 * So the mark is lifted off its background, measured, and scaled until it
 * fits inside the 66dp circle rather than the 66dp square. That is the
 * conservative reading — content in the corners of the safe *square* still
 * gets clipped by a circular mask — and it is why the mark ends up smaller
 * than the iOS one looks. It is not a mistake; it is the safe zone.
 *
 * The lift works because the source is two colours. Every pixel sits on
 * the cobalt-to-white axis, so its luminance *is* its coverage: cobalt
 * reads as 0, white as 1, and the antialiased edges land in between and
 * keep their softness.
 *
 * sharp is a devDependency — see the note in store-screenshots.js.
 */

const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'images');
const SRC = path.join(OUT, 'icon.png');

// The brand cobalt, sampled from the mark's own field. Matches the splash
// backgroundColor in app.json — keep the three in step.
const COBALT = { r: 37, g: 71, b: 208 };

// Adaptive icons are specified in dp: 108 canvas, 66 guaranteed-visible.
const SAFE = 66 / 108;

/**
 * Lifts the white mark off the cobalt field, returning a premultiplied
 * white silhouette cropped to its own bounds.
 */
async function silhouette() {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const floor = lum(COBALT.r, COBALT.g, COBALT.b);
  const range = 255 - floor;

  const out = Buffer.alloc(w * h * 4);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const a = Math.max(0, Math.min(1, (lum(data[i], data[i + 1], data[i + 2]) - floor) / range));
      const o = (y * w + x) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = Math.round(a * 255);

      // The source square is antialiased against nothing at its outer
      // edge, leaving a 2px pale fringe that reads as coverage. Ignore a
      // margin so it can't inflate the bounds.
      if (a > 0.5 && x > 5 && y > 5 && x < w - 6 && y < h - 6) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract(box)
    .png()
    .toBuffer();
  return { png, box };
}

/**
 * Scales the mark so that every opaque pixel falls inside the safe circle,
 * then centres it on a transparent canvas of `size`.
 *
 * The fit is measured rather than assumed: the limit is the furthest
 * opaque pixel from the centre, which for this mark is the tip of the
 * house pin, not any corner of its bounding box.
 */
async function layer(mark, size, file) {
  const { data, info } = await sharp(mark)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  let reach = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * c + 3] > 127) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > reach) reach = d;
      }
    }
  }

  const scale = (size * SAFE) / 2 / reach;
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  const resized = await sharp(mark).resize(tw, th).png().toBuffer();

  const info2 = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(path.join(OUT, file));

  console.log(
    `✓ ${file}  ${info2.width}x${info2.height}  mark ${tw}x${th} ` +
      `(${((tw / size) * 100).toFixed(0)}% wide, safe circle ${(SAFE * 100).toFixed(0)}%)`
  );
}

async function background(size, file) {
  // Flat cobalt. The mark carries the whole design; a background that does
  // anything else would fight the foreground through every mask shape.
  const info = await sharp({
    create: { width: size, height: size, channels: 4, background: { ...COBALT, alpha: 1 } },
  })
    .png()
    .toFile(path.join(OUT, file));
  console.log(`✓ ${file}  ${info.width}x${info.height}`);
}

async function main() {
  const { png, box } = await silhouette();
  console.log(`  mark lifted at ${box.width}x${box.height} from ${box.left},${box.top}`);

  await background(512, 'android-icon-background.png');
  await layer(png, 512, 'android-icon-foreground.png');
  // Themed icons on Android 13+. Same silhouette; the system recolours it,
  // so the white here is a stencil rather than a colour choice.
  await layer(png, 432, 'android-icon-monochrome.png');
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
