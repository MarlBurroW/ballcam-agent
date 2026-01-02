import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');

// ICO file format:
// - ICONDIR header (6 bytes)
// - ICONDIRENTRY for each image (16 bytes each)
// - Image data (PNG or BMP)

async function generateIco() {
  const sizes = [16, 32, 48, 256];
  const images = [];

  // Generate PNG buffers for each size
  for (const size of sizes) {
    const pngBuffer = await sharp(join(iconsDir, '128x128.png'))
      .resize(size, size)
      .png()
      .toBuffer();
    images.push({ size, buffer: pngBuffer });
  }

  // Calculate offsets
  let offset = 6 + (16 * images.length); // Header + entries
  const entries = images.map(img => {
    const entry = {
      width: img.size === 256 ? 0 : img.size,
      height: img.size === 256 ? 0 : img.size,
      buffer: img.buffer,
      offset
    };
    offset += img.buffer.length;
    return entry;
  });

  // Build ICO file
  const headerSize = 6 + (16 * entries.length);
  const totalSize = entries.reduce((acc, e) => acc + e.buffer.length, headerSize);
  const ico = Buffer.alloc(totalSize);

  // ICONDIR header
  ico.writeUInt16LE(0, 0);      // Reserved
  ico.writeUInt16LE(1, 2);      // Type: 1 = ICO
  ico.writeUInt16LE(entries.length, 4); // Number of images

  // ICONDIRENTRY for each image
  entries.forEach((entry, i) => {
    const pos = 6 + (i * 16);
    ico.writeUInt8(entry.width, pos);           // Width
    ico.writeUInt8(entry.height, pos + 1);      // Height
    ico.writeUInt8(0, pos + 2);                 // Color palette
    ico.writeUInt8(0, pos + 3);                 // Reserved
    ico.writeUInt16LE(1, pos + 4);              // Color planes
    ico.writeUInt16LE(32, pos + 6);             // Bits per pixel
    ico.writeUInt32LE(entry.buffer.length, pos + 8);  // Size of image data
    ico.writeUInt32LE(entry.offset, pos + 12);  // Offset to image data
  });

  // Image data
  let dataOffset = headerSize;
  for (const entry of entries) {
    entry.buffer.copy(ico, dataOffset);
    dataOffset += entry.buffer.length;
  }

  writeFileSync(join(iconsDir, 'icon.ico'), ico);
  console.log('Generated icon.ico successfully!');
}

generateIco().catch(console.error);
