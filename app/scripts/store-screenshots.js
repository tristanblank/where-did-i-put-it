#!/usr/bin/env node
/**
 * Turns raw iPhone screenshots into App Store Connect assets.
 *
 * Exists because this project is developed on Windows, where there is no
 * iOS Simulator — screenshots get taken on a physical phone, at whatever
 * resolution that phone happens to be, and App Store Connect rejects
 * anything that isn't an exact pixel match for one of its slots.
 *
 *   node scripts/store-screenshots.js
 *   node scripts/store-screenshots.js --preset iphone-6.5
 *   node scripts/store-screenshots.js --in ~/Desktop/shots --out ./upload
 *
 * sharp is a devDependency. It's a native Node module, but nothing in the
 * app imports it, so Metro never reaches it and it stays out of the
 * shipped bundle; it also has no expo-module.config.json or podspec, so
 * neither Expo nor React Native autolinking picks it up for the native
 * build. (`npx --package=sharp` looks like it should avoid the dependency
 * altogether, but it only puts the package's binaries on PATH — the
 * module isn't require()-able from here, so that route just fails.)
 */

const fs = require('fs');
const path = require('path');

// App Store Connect's accepted sizes change periodically; confirm against
// the slots actually shown in App Store Connect before a submission.
// iphone-6.9 is the current baseline — Apple scales it down for smaller
// devices, so it's usually the only iPhone set you need to upload.
const PRESETS = {
  'iphone-6.9': { width: 1320, height: 2868, label: '6.9" iPhone (15/16 Pro Max)' },
  'iphone-6.7': { width: 1290, height: 2796, label: '6.7" iPhone (14/15 Plus, Pro Max)' },
  'iphone-6.5': { width: 1242, height: 2688, label: '6.5" iPhone (11 Pro Max, XS Max)' },
  'ipad-13': { width: 2064, height: 2752, label: '13" iPad' },
};

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg']);

function parseArgs(argv) {
  const args = { preset: 'iphone-6.9', in: 'store-assets/raw', out: null };
  for (let i = 0; i < argv.length; i++) {
    const next = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        throw new Error(`${argv[i]} needs a value`);
      }
      i++;
      return v;
    };
    if (argv[i] === '--preset') args.preset = next();
    else if (argv[i] === '--in') args.in = next();
    else if (argv[i] === '--out') args.out = next();
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return args;
}

function usage() {
  console.log(`
Resize raw phone screenshots into App Store Connect assets.

  --preset <name>   ${Object.keys(PRESETS).join(' | ')}   (default: iphone-6.9)
  --in <dir>        source screenshots         (default: store-assets/raw)
  --out <dir>       destination                (default: store-assets/<preset>)

Presets:
${Object.entries(PRESETS)
  .map(([k, v]) => `  ${k.padEnd(12)} ${v.width}x${v.height}  ${v.label}`)
  .join('\n')}
`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    usage();
    process.exit(1);
  }
  if (args.help) return usage();

  const preset = PRESETS[args.preset];
  if (!preset) {
    console.error(`✗ Unknown preset "${args.preset}". Options: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  const inDir = path.resolve(args.in);
  const outDir = path.resolve(args.out ?? path.join('store-assets', args.preset));

  if (!fs.existsSync(inDir)) {
    console.error(`✗ No such directory: ${inDir}`);
    console.error(`  Drop your phone screenshots in there and re-run.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(inDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.error(`✗ No .png/.jpg files in ${inDir}`);
    process.exit(1);
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error(`✗ sharp isn't installed. Run:\n`);
    console.error(`    npm install\n`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Clear previous output first. Names are derived from the input files,
  // so renaming a source between runs (1-home.png after home.png) leaves
  // the old result sitting there looking exactly as legitimate as the new
  // one — and the failure mode is uploading a duplicate set to the App
  // Store. This directory is entirely derived; nothing here is worth
  // keeping.
  const stale = fs.readdirSync(outDir).filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  for (const f of stale) fs.unlinkSync(path.join(outDir, f));
  if (stale.length > 0) {
    console.log(`  (cleared ${stale.length} file${stale.length === 1 ? '' : 's'} from a previous run)`);
  }

  console.log(`\n${preset.label} — ${preset.width}x${preset.height}`);
  console.log(`${inDir}\n  ->  ${outDir}\n`);

  const targetRatio = preset.width / preset.height;
  let warnings = 0;

  for (const [i, file] of files.entries()) {
    const src = path.join(inDir, file);
    const meta = await sharp(src).metadata();
    const ratio = meta.width / meta.height;
    const drift = Math.abs(ratio - targetRatio) / targetRatio;

    // Modern iPhones all sit within a hair of 0.461, so `cover` trims a
    // couple of pixels at most and nothing visible is lost. A genuinely
    // different aspect ratio — an iPad shot, a landscape grab — would get
    // its edges cropped off instead, which is worth saying out loud
    // rather than silently shipping to the App Store.
    const suspect = drift > 0.02;
    if (suspect) warnings++;

    // Screenshots must be flat RGB: an alpha channel is a rejection
    // reason, and iOS occasionally produces one.
    const outName = `${String(i + 1).padStart(2, '0')}-${path.parse(file).name}.png`;
    await sharp(src)
      .resize(preset.width, preset.height, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(path.join(outDir, outName));

    const note = suspect ? `  ⚠ aspect ratio off by ${(drift * 100).toFixed(1)}% — check for cropping` : '';
    console.log(`  ${outName}   ${meta.width}x${meta.height} -> ${preset.width}x${preset.height}${note}`);
  }

  console.log(`\n✓ ${files.length} file${files.length === 1 ? '' : 's'} written to ${outDir}`);
  if (warnings > 0) {
    console.log(`⚠ ${warnings} had an unexpected aspect ratio — open those before uploading.`);
  }
  console.log(`\nBefore uploading, check that none of them show your household invite code.\n`);
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
