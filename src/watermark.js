const sharp = require('sharp');

// ── Stamp timestamp, house, and operative names onto image ────────────────────
async function addWatermark(imageBuffer, { timestamp, house, operatives }) {
  const names = operatives.map(o => o.name).join(', ');

  // Lines to show on the watermark
  const lines = [
    house,
    names,
    timestamp,
  ];

  // Get image dimensions first
  const meta   = await sharp(imageBuffer).metadata();
  const width  = meta.width  || 800;
  const height = meta.height || 600;

  const fontSize  = Math.max(20, Math.round(width * 0.035)); // responsive font size
  const lineH     = Math.round(fontSize * 1.6);
  const padding   = Math.round(fontSize * 0.7);
  const boxH      = lineH * lines.length + padding * 2;
  const boxY      = height - boxH;

  // Build SVG overlay with semi-transparent black bar + white text
  const svgLines = lines.map((line, i) =>
    `<text
      x="${padding}"
      y="${padding + lineH * i + fontSize}"
      font-family="Arial, sans-serif"
      font-size="${fontSize}"
      font-weight="bold"
      fill="white"
      opacity="0.95"
    >${escapeXml(line)}</text>`
  ).join('\n');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${boxY}" width="${width}" height="${boxH}"
            fill="black" opacity="0.55" rx="0"/>
      <g transform="translate(0, ${boxY})">
        ${svgLines}
      </g>
    </svg>
  `;

  const watermarked = await sharp(imageBuffer)
    .composite([{
      input:  Buffer.from(svg),
      gravity: 'south',
      blend:  'over',
    }])
    .jpeg({ quality: 88 })
    .toBuffer();

  return watermarked;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { addWatermark };
