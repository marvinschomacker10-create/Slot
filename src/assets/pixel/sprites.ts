import { PixelCanvas } from './canvas';

/**
 * Original school-themed pixel-art symbols (32 x 32), drawn with primitives so they
 * can be adjusted in code. Palette loosely based on the classic 16-colour fantasy
 * console palette, plus a few shades.
 */
const P = {
  ink: '#1a1c2c',
  white: '#fff1e8',
  lgray: '#c2c3c7',
  gray: '#8b8b99',
  dgray: '#4a4a5a',
  red: '#e8203f',
  dred: '#9e1030',
  brown: '#ab5236',
  dbrown: '#743a24',
  wood: '#e8b56a',
  yellow: '#ffec27',
  gold: '#ffa300',
  dgold: '#c26f00',
  lyellow: '#fff6a6',
  green: '#00c43a',
  dgreen: '#007a3d',
  blue: '#29adff',
  dblue: '#1d6fb8',
  lblue: '#c7efff',
  pink: '#ff77a8',
  lpink: '#ffb3cc',
  dpink: '#cf4d7f',
  skin: '#ffccaa',
  skinShade: '#e39d78',
  skinLight: '#ffe6d1',
  violet: '#7b3fb0',
  dviolet: '#542a80',
  hairDark: '#4e2f22',
} as const;

const SIZE = 32;
const canvas = () => new PixelCanvas(SIZE, SIZE);

/** Lineal - wooden ruler with tick marks. */
function ruler(): PixelCanvas {
  const c = canvas();
  c.along(4, 28, 28, 4, (u, v, len) => {
    if (Math.abs(v) > 4 || u < 0.6 || u > len - 0.6) return null;
    if (v > 2.6) return P.dgold;
    if (v < -3.2) return P.lyellow;
    // Tick marks on the upper edge: a long one every fourth step.
    const step = 2.85;
    const k = Math.round(u / step);
    const near = Math.abs(u - k * step) < 0.5;
    if (near && k > 0 && u < len - 2 && v < (k % 4 === 0 ? 0.2 : -1.8)) return P.dbrown;
    return P.wood;
  });
  return c.outline(P.ink);
}

/** Bleistift - hexagonal pencil with eraser. */
function pencil(): PixelCanvas {
  const c = canvas();
  c.along(3, 29, 29, 3, (u, v, len) => {
    const half = 4;
    if (u < 8) {
      // Sharpened cone: graphite tip, then bare wood.
      if (Math.abs(v) > (u / 8) * half + 0.3) return null;
      return u < 3.4 ? P.dgray : P.wood;
    }
    if (u > len - 5) {
      const end = len - u;
      if (Math.abs(v) > half - (end < 1.5 ? 1.5 - end : 0) * 1.6) return null;
      return v < -1.6 ? P.lpink : P.pink;
    }
    if (Math.abs(v) > half) return null;
    if (u > len - 9) return Math.floor(u) % 2 === 0 ? P.lgray : P.gray;
    if (v < -1.4) return P.yellow;
    if (v > 1.4) return P.dgold;
    return P.gold;
  });
  return c.outline(P.ink);
}

/** Radiergummi - two-coloured eraser block. */
function eraser(): PixelCanvas {
  const c = canvas();
  const split = 17;
  // top face
  c.polygon(
    [
      [4, 15],
      [9, 10],
      [split + 5, 10],
      [split, 15],
    ],
    '#7cc8ff',
  );
  c.polygon(
    [
      [split, 15],
      [split + 5, 10],
      [30, 10],
      [25, 15],
    ],
    P.lpink,
  );
  // front face
  c.rect(4, 15, split - 4, 10, P.blue);
  c.rect(split, 15, 25 - split, 10, P.pink);
  // side face
  c.polygon(
    [
      [25, 15],
      [30, 10],
      [30, 20],
      [25, 25],
    ],
    P.dpink,
  );
  // worn, rounded pink end and a seam
  c.set(24, 24, null).set(29, 19, null);
  for (let y = 16; y < 24; y += 2) c.set(split, y, P.dblue);
  c.rect(6, 17, 6, 1, '#7cc8ff');
  // crumbs
  c.set(6, 28, P.lpink).set(9, 29, P.pink).set(13, 28, P.lpink);
  return c.outline(P.ink);
}

/** Kreide - two sticks of chalk with dust. */
function chalk(): PixelCanvas {
  const c = canvas();
  const stick = (ax: number, ay: number, bx: number, by: number, light: string, shade: string) =>
    c.along(ax, ay, bx, by, (u, v, len) => {
      const r = 2.8;
      const endCut = Math.min(u, len - u);
      const w = endCut < 1.2 ? r - (1.2 - endCut) * 1.2 : r;
      if (Math.abs(v) > w) return null;
      return v > 0.9 ? shade : light;
    });
  stick(4, 21, 24, 7, '#f7f7f2', '#cfd2d6');
  stick(8, 28, 28, 14, '#a6dcff', '#5fb4e8');
  c.outline(P.ink);
  for (const [x, y] of [
    [3, 26],
    [5, 28],
    [2, 29],
    [12, 30],
    [16, 31],
    [27, 24],
  ] as const) {
    c.set(x, y, P.lgray);
  }
  return c;
}

/** Schulbuch - school book with label and ribbon. */
function book(): PixelCanvas {
  const c = canvas();
  // page block (right and bottom)
  c.rect(8, 7, 20, 21, '#f6edd6');
  for (let y = 8; y < 27; y += 2) c.rect(25, y, 3, 1, '#d2c39a');
  for (let x = 9; x < 27; x += 2) c.set(x, 27, '#d2c39a');
  // cover
  c.rect(4, 4, 21, 22, P.red);
  c.rect(4, 4, 3, 22, P.dred);
  c.rect(7, 4, 18, 1, '#ff5c6f');
  // label
  c.rect(10, 8, 12, 8, '#f6edd6');
  c.rect(12, 10, 8, 1, P.dred);
  c.rect(12, 12, 6, 1, P.dred);
  c.rect(12, 14, 7, 1, P.gray);
  // gold star sticker
  c.ascii(17, 18, ['..#..', '.###.', '#####', '.###.', '.#.#.'], { '#': P.yellow });
  // bookmark ribbon
  c.rect(19, 26, 3, 4, P.blue).set(20, 29, null);
  return c.outline(P.ink);
}

/** Apfel - the classic apple for the teacher. */
function apple(): PixelCanvas {
  const c = canvas();
  c.ellipse(16, 19.5, 11.5, 10.5, P.red);
  c.ellipse(21.5, 22.5, 6, 6.5, P.dred);
  c.ellipse(18, 18, 9, 8.5, P.red);
  c.rect(15, 9, 3, 2, null);
  c.set(14, 9, null).set(18, 9, null);
  // stem and leaf
  c.line(16, 11, 17, 4, P.dbrown).line(17, 11, 18, 4, P.brown);
  c.ellipse(22.5, 6.5, 4.5, 2.4, P.green);
  c.line(19, 7, 25, 6, P.dgreen);
  // highlight
  c.ellipse(10.5, 15.5, 1.6, 3, P.white);
  c.set(13, 12, P.white);
  return c.outline(P.ink);
}

/** Globus - globe on a stand. */
function globe(): PixelCanvas {
  const c = canvas();
  const cx = 16;
  const cy = 13;
  // meridian ring (left and bottom half)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r >= 11.4 && r <= 12.7 && (x < cx - 2 || y > cy + 6)) c.set(x, y, P.gold);
    }
  }
  c.rect(15, 24, 2, 4, P.brown);
  c.ellipse(16, 29.5, 7, 2, P.brown);
  c.rect(10, 29, 12, 1, P.dbrown);
  // ocean
  c.ellipse(cx, cy, 9.6, 9.6, P.blue);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (c.get(x, y) === P.blue && x + 0.5 - cx + (y + 0.5 - cy) * 0.3 > 5.2) c.set(x, y, P.dblue);
    }
  }
  // land
  const land = (x: number, y: number, rx: number, ry: number) => {
    for (let j = Math.floor(y - ry); j <= y + ry; j++) {
      for (let i = Math.floor(x - rx); i <= x + rx; i++) {
        const dx = (i + 0.5 - x) / rx;
        const dy = (j + 0.5 - y) / ry;
        const cur = c.get(i, j);
        if (dx * dx + dy * dy <= 1 && (cur === P.blue || cur === P.dblue))
          c.set(i, j, cur === P.blue ? P.green : P.dgreen);
      }
    }
  };
  land(12, 9, 3.6, 2.6);
  land(12.5, 12.5, 2, 2.8);
  land(19.5, 15, 3.2, 3.8);
  land(21, 9.5, 1.8, 1.6);
  land(13, 18.5, 2.6, 1.4);
  c.ellipse(11, 7, 1.4, 1.1, P.white);
  return c.outline(P.ink);
}

/** Lehrer - a (fictional) teacher: bald top, glasses, moustache, tweed jacket and tie. */
function teacher(): PixelCanvas {
  const c = canvas();
  // jacket, shirt, tie
  c.ellipse(16, 33, 15, 11, P.brown);
  c.polygon(
    [
      [11.5, 22],
      [20.5, 22],
      [16, 30],
    ],
    P.white,
  );
  c.polygon(
    [
      [15, 23],
      [17, 23],
      [18, 29],
      [16, 31],
      [14, 29],
    ],
    P.red,
  );
  c.rect(15, 23, 2, 2, P.dred);
  c.line(11, 22, 15, 31, P.dbrown).line(20, 22, 17, 31, P.dbrown);
  // neck, ears, head
  c.rect(13, 18, 6, 5, P.skinShade);
  c.ellipse(7.5, 12.5, 1.9, 2.6, P.skinShade);
  c.ellipse(24.5, 12.5, 1.9, 2.6, P.skinShade);
  c.ellipse(16, 11, 8.5, 9.6, P.skin);
  c.set(11, 3, P.skinLight).set(12, 3, P.skinLight).set(11, 4, P.skinLight).set(10, 5, P.skinLight);
  // grey side hair
  c.rect(7, 7, 3, 4, P.lgray).rect(7, 8, 2, 4, P.gray);
  c.rect(22, 7, 3, 4, P.lgray).rect(23, 8, 2, 4, P.gray);
  // eyebrows and glasses
  c.rect(10, 7, 4, 1, P.gray).rect(18, 7, 4, 1, P.gray);
  for (const x0 of [9, 17]) {
    c.rect(x0, 9, 6, 4, P.ink);
    c.rect(x0 + 1, 10, 4, 2, P.lblue);
    c.set(x0 + 3, 10, P.ink).set(x0 + 3, 11, P.ink);
  }
  c.rect(15, 10, 2, 1, P.ink);
  // nose, moustache, mouth
  c.rect(15, 13, 2, 2, P.skinShade);
  c.rect(12, 15, 8, 2, P.gray).set(11, 16, P.gray).set(20, 16, P.gray);
  c.rect(14, 17, 4, 1, P.dred);
  c.rect(12, 19, 8, 1, P.skinShade);
  return c.outline(P.ink);
}

/** Direktorin (Wild) - head teacher with bun, cat-eye glasses and pearls, on a WILD plate. */
function headmistress(): PixelCanvas {
  const c = canvas();
  // hair (back) and bun
  c.ellipse(16, 10, 10, 10, P.hairDark);
  c.ellipse(16, 2.6, 4.2, 2.6, P.hairDark);
  c.rect(14, 3, 4, 1, '#7a4a33');
  // blazer and blouse
  c.ellipse(16, 26, 14, 7, P.violet);
  c.polygon(
    [
      [12, 19],
      [20, 19],
      [16, 24],
    ],
    P.white,
  );
  c.line(12, 19, 15, 23, P.dviolet).line(20, 19, 17, 23, P.dviolet);
  // neck, face, fringe
  c.rect(13, 16, 6, 4, P.skinShade);
  c.ellipse(16, 11, 7.2, 8.2, P.skin);
  c.ellipse(16, 4.8, 8, 3.4, P.hairDark);
  c.set(10, 7, P.hairDark).set(22, 7, P.hairDark);
  // cat-eye glasses
  for (const x0 of [9, 17]) {
    c.rect(x0, 9, 6, 3, P.red);
    c.rect(x0 + 1, 10, 4, 1, P.lblue);
    c.set(x0 + 2, 10, P.ink).set(x0 + 3, 10, P.ink);
  }
  c.set(8, 8, P.red).set(23, 8, P.red);
  c.rect(15, 10, 2, 1, P.red);
  // nose, lips, earrings, pearls
  c.set(16, 13, P.skinShade);
  c.rect(14, 15, 4, 1, P.red);
  c.set(8, 13, P.white).set(23, 13, P.white);
  for (let x = 12; x <= 20; x += 2) c.set(x, 19, P.white);
  // WILD plate
  c.rect(2, 22, 28, 9, P.gold);
  c.rect(2, 22, 28, 1, P.yellow);
  c.rect(2, 30, 28, 1, P.dgold);
  const label = 'WILD';
  c.text(Math.round((SIZE - PixelCanvas.textWidth(label)) / 2), 24, label, P.ink);
  return c.outline(P.ink);
}

/** Schulglocke (Scatter) - ringing school bell. */
function bell(): PixelCanvas {
  const c = canvas();
  // handle and collar
  c.rect(14, 2, 4, 8, P.brown);
  c.rect(14, 2, 1, 8, P.wood);
  c.rect(12, 9, 8, 3, P.dgold);
  // bell body
  c.polygon(
    [
      [11, 11],
      [21, 11],
      [26, 23],
      [6, 23],
    ],
    P.gold,
  );
  c.polygon(
    [
      [12, 12],
      [14, 12],
      [11, 22],
      [8, 22],
    ],
    P.yellow,
  );
  c.rect(4, 23, 24, 3, P.dgold);
  c.rect(5, 23, 22, 1, P.gold);
  // clapper
  c.ellipse(16, 27.5, 2.4, 2.2, P.dgray);
  c.outline(P.ink);
  // ringing marks
  for (const [x, y] of [
    [3, 9],
    [2, 10],
    [4, 12],
    [2, 15],
    [3, 16],
    [28, 9],
    [29, 10],
    [27, 12],
    [29, 15],
    [28, 16],
  ] as const) {
    c.set(x, y, P.yellow);
  }
  return c;
}

const BUILDERS: Readonly<Record<string, () => PixelCanvas>> = {
  RULER: ruler,
  PENCIL: pencil,
  ERASER: eraser,
  CHALK: chalk,
  BOOK: book,
  APPLE: apple,
  GLOBE: globe,
  TEACHER: teacher,
  WILD: headmistress,
  SCATTER: bell,
};

export const PIXEL_SPRITE_IDS = Object.keys(BUILDERS);

export function buildSprite(id: string): PixelCanvas | null {
  const build = BUILDERS[id];
  return build ? build() : null;
}
