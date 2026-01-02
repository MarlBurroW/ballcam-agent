import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');

// SVG du logo BallCam - cercle avec gradient violet/bleu/cyan et effet lens
const createSvg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a855f7" />
      <stop offset="50%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="innerGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background circle for better visibility -->
  <circle cx="256" cy="256" r="240" fill="#0f172a" />

  <!-- Outer ring with glow -->
  <circle
    cx="256"
    cy="256"
    r="200"
    stroke="url(#grad)"
    stroke-width="28"
    fill="none"
    filter="url(#glow)"
  />

  <!-- Inner filled ball -->
  <circle
    cx="256"
    cy="256"
    r="110"
    fill="url(#grad)"
    filter="url(#innerGlow)"
  />

  <!-- Camera lens / eye - dark center -->
  <circle cx="256" cy="256" r="50" fill="#0f172a" />

  <!-- Highlight / reflection -->
  <circle cx="230" cy="230" r="18" fill="rgba(255,255,255,0.7)" />
</svg>`;

// Tailles requises pour Tauri
const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

async function generateIcons() {
  console.log('Generating BallCam icons...\n');

  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  // Generate PNG icons
  for (const { name, size } of sizes) {
    const svgBuffer = Buffer.from(createSvg(512));
    const outputPath = join(iconsDir, name);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Created ${name} (${size}x${size})`);
  }

  // Generate ICO for Windows (multiple sizes embedded)
  const icoSizes = [16, 32, 48, 256];
  const icoImages = await Promise.all(
    icoSizes.map(async (size) => {
      const svgBuffer = Buffer.from(createSvg(512));
      return sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toBuffer();
    })
  );

  // Create ICO file manually (simple format)
  const icoBuffer = createIco(icoImages, icoSizes);
  writeFileSync(join(iconsDir, 'icon.ico'), icoBuffer);
  console.log('Created icon.ico (16, 32, 48, 256)');

  // For macOS icns, we just copy the 512 version (Tauri handles conversion)
  const svgBuffer = Buffer.from(createSvg(512));
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(iconsDir, 'icon.icns.png'));
  console.log('Created icon.icns.png (512x512) - convert to .icns with iconutil on macOS');

  console.log('\nDone! Icons generated in src-tauri/icons/');
}

// Simple ICO file creator
function createIco(pngBuffers, sizes) {
  const images = pngBuffers.map((png, i) => ({
    png,
    size: sizes[i],
  }));

  // ICO header: 6 bytes
  // Directory entries: 16 bytes each
  // Image data follows

  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * images.length;

  let dataOffset = headerSize + dirSize;
  const entries = images.map((img) => {
    const entry = {
      size: img.size === 256 ? 0 : img.size, // 256 is stored as 0
      offset: dataOffset,
      dataSize: img.png.length,
    };
    dataOffset += img.png.length;
    return entry;
  });

  const totalSize = dataOffset;
  const buffer = Buffer.alloc(totalSize);

  // ICO Header
  buffer.writeUInt16LE(0, 0);      // Reserved
  buffer.writeUInt16LE(1, 2);      // Type: 1 = ICO
  buffer.writeUInt16LE(images.length, 4); // Image count

  // Directory entries
  entries.forEach((entry, i) => {
    const offset = headerSize + (i * dirEntrySize);
    buffer.writeUInt8(entry.size, offset);        // Width
    buffer.writeUInt8(entry.size, offset + 1);    // Height
    buffer.writeUInt8(0, offset + 2);             // Color palette
    buffer.writeUInt8(0, offset + 3);             // Reserved
    buffer.writeUInt16LE(1, offset + 4);          // Color planes
    buffer.writeUInt16LE(32, offset + 6);         // Bits per pixel
    buffer.writeUInt32LE(entry.dataSize, offset + 8);  // Image size
    buffer.writeUInt32LE(entry.offset, offset + 12);   // Image offset
  });

  // Image data
  images.forEach((img, i) => {
    img.png.copy(buffer, entries[i].offset);
  });

  return buffer;
}

generateIcons().catch(console.error);
