// Powerup icons as SVG: a glossy ball (green = you, red = others,
// blue = everyone) with a yellow symbol, in the style of the original.

const BALL = {
  self: '#00e000',
  others: '#ff0000',
  all: '#0000ff',
};

const Y = '#ffff00';

const GLYPHS = {
  fast: `<path d="M58 14 30 54h18l-8 32 30-44H52z" fill="${Y}"/>`,
  slow: `<path d="M30 46h22v6L38 70h16v7H28v-6l14-18H30z" fill="${Y}"/>
         <path d="M56 30h12v4l-7 9h8v4H55v-4l7-9h-6z" fill="${Y}"/>
         <path d="M68 20h9v3l-5 6h6v3H67v-3l5-6h-4z" fill="${Y}"/>`,
  thin: `<path d="M64 22 36 78" stroke="${Y}" stroke-width="4" stroke-linecap="round"/>`,
  thick: `<ellipse cx="50" cy="50" rx="10" ry="32" transform="rotate(30 50 50)" fill="${Y}"/>`,
  fly: `<ellipse cx="50" cy="56" rx="30" ry="9" fill="none" stroke="#000" stroke-width="5"/>
        <path d="M46 20c14 6-10 16 4 26s-12 16 2 28" fill="none" stroke="${Y}" stroke-width="4" stroke-linecap="round"/>`,
  tunnel: `<path d="M34 30h32v40H34z" fill="none" stroke="${Y}" stroke-width="5" stroke-dasharray="26 8"/>
           <path d="M28 70 70 28" stroke="${Y}" stroke-width="4" stroke-dasharray="14 18"/>`,
  square: `<path d="M30 76V58h10V40H30V24h18v16h10V24h14v28H58v24z" fill="none" stroke="${Y}" stroke-width="4" stroke-linejoin="miter"/>`,
  reverse: `<path d="M74 38H34m0 0 9-8m-9 8 9 8M26 62h40m0 0-9-8m9 8-9 8" fill="none" stroke="${Y}" stroke-width="5" stroke-linecap="round"/>`,
  borders: `<rect x="28" y="28" width="44" height="44" fill="none" stroke="${Y}" stroke-width="5" stroke-dasharray="9 6"/>`,
  clear: `<rect x="28" y="28" width="44" height="44" fill="none" stroke="${Y}" stroke-width="5"/>`,
  more: `<circle cx="38" cy="38" r="13" fill="none" stroke="${Y}" stroke-width="4"/>
         <circle cx="64" cy="44" r="13" fill="none" stroke="${Y}" stroke-width="4"/>
         <circle cx="44" cy="66" r="13" fill="none" stroke="${Y}" stroke-width="4"/>`,
  random: `<g font-family="Verdana,sans-serif" font-weight="bold" fill="${Y}" stroke="#600" stroke-width="1.5">
           <text x="20" y="74" font-size="28">?</text><text x="40" y="60" font-size="28">?</text><text x="60" y="46" font-size="28">?</text></g>`,
};

export function iconSvg(def) {
  const glyph = GLYPHS[def.type];
  const id = `g${def.target}${def.type}`;
  let fill;
  let stroke;
  if (def.target === 'random') {
    fill = `<linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#4040ff"/>
      <stop offset=".45" stop-color="#ff2020"/><stop offset=".65" stop-color="#20d020"/>
      <stop offset="1" stop-color="#fff"/></linearGradient>`;
    stroke = '#0000ff';
  } else {
    const c = BALL[def.target];
    fill = `<radialGradient id="${id}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${c}"/><stop offset=".55" stop-color="${c}" stop-opacity=".75"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".95"/></radialGradient>`;
    stroke = c;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${fill}</defs>`
    + `<circle cx="50" cy="50" r="48" fill="url(#${id})" stroke="${stroke}" stroke-width="2"/>${glyph}</svg>`;
}

// Pre-rendered images for drawing on the canvas.
const cache = new Map();
export function iconImage(def) {
  const key = `${def.target}:${def.type}`;
  if (!cache.has(key)) {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(def))}`;
    cache.set(key, img);
  }
  return cache.get(key);
}
