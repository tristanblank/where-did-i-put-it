#!/usr/bin/env node
/**
 * Generates the two gradient layers of the splash animation.
 *
 *   node scripts/splash-gradients.js
 *
 * Both come straight from design/Stasher splash screen design.zip:
 *
 *   glow  radial-gradient(120% 70% at 50% 34%,
 *                         rgba(255,255,255,.16), rgba(255,255,255,0) 62%)
 *   sheen linear-gradient(100deg, transparent 30%,
 *                         rgba(255,255,255,.55) 50%, transparent 70%)
 *
 * Baked to PNG rather than drawn at runtime. React Native has no gradient
 * primitive, and the alternatives are worse for two static layers: pulling
 * in expo-linear-gradient adds a native module and still can't do the
 * radial one, and the `backgroundImage` gradient syntax is new enough that
 * pinning the app's launch screen to it is a bet with no upside. A pair of
 * PNGs works on every version and stretches without artefacts, because a
 * smooth gradient is exactly the thing that survives being resampled.
 *
 * sharp is a devDependency — see the note in store-screenshots.js.
 */

const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'images');

// The artboard these were designed against.
const W = 430;
const H = 932;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

async function glow() {
  const cx = W * 0.5;
  const cy = H * 0.34;
  const rx = W * 1.2;
  const ry = H * 0.7;
  const data = Buffer.alloc(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const t = Math.sqrt(dx * dx + dy * dy);
      // Two colour stops: .16 at the centre, 0 at 62% of the radius.
      const a = clamp01(1 - t / 0.62) * 0.16;
      const i = (y * W + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }

  const out = path.join(OUT, 'splash-glow.png');
  const info = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
  console.log(`✓ ${path.basename(out)}  ${info.width}x${info.height}`);
}

async function sheen() {
  // Wide and short: it is stretched across the wordmark and swept
  // sideways, so only the horizontal profile matters. The 10° tilt is
  // baked in by projecting each pixel onto the gradient's axis.
  const w = 480;
  const h = 140;
  const angle = ((100 - 90) * Math.PI) / 180;
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const data = Buffer.alloc(w * h * 4);
  // Longest projection across the box, so the stops land at the same
  // fractions CSS would put them at.
  const span = Math.abs(w * ax) + Math.abs(h * ay);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (x * ax + y * ay) / span;
      let a = 0;
      if (p > 0.3 && p < 0.7) {
        // Ramp up to .55 at the midpoint, back down by 70%.
        a = p <= 0.5 ? ((p - 0.3) / 0.2) * 0.55 : ((0.7 - p) / 0.2) * 0.55;
      }
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(clamp01(a) * 255);
    }
  }

  const out = path.join(OUT, 'splash-sheen.png');
  const info = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);
  console.log(`✓ ${path.basename(out)}  ${info.width}x${info.height}`);
}

async function shadow() {
  // The ground shadow: a 150x12 ellipse at 45% black under `blur(9px)`.
  // React Native has no blur filter, and the un-blurred version reads as
  // a hard dark pill under the icon rather than as a shadow — so the blur
  // gets baked in here, with enough padding around the ellipse for it to
  // fall off to nothing instead of being cut square at the edges.
  const w = 200;
  const h = 62;
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="75" ry="6" fill="rgba(0,0,0,0.45)"/></svg>`
  );
  const out = path.join(OUT, 'splash-shadow.png');
  const info = await sharp(svg).blur(9).png().toFile(out);
  console.log(`✓ ${path.basename(out)}  ${info.width}x${info.height}`);
}

Promise.all([glow(), sheen(), shadow()]).catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
