/* One renderer, shared by the local preview and the Node.js SVG generator. */
(function (root) {
  'use strict';
  // Five-pixel-high, variable-width glyphs leave a quiet row above and below.
  // Each 1 is one highlighted day; a 0 leaves the real contribution visible.
  const FONT = {
    A: ['0110','1001','1111','1001','1001'],
    B: ['1110','1001','1110','1001','1110'],
    C: ['0111','1000','1000','1000','0111'],
    D: ['1110','1001','1001','1001','1110'],
    E: ['1111','1000','1110','1000','1111'],
    F: ['1111','1000','1110','1000','1000'],
    G: ['0111','1000','1011','1001','0111'],
    H: ['1001','1001','1111','1001','1001'],
    I: ['111','010','010','010','111'],
    J: ['0011','0001','0001','1001','0110'],
    K: ['1001','1010','1100','1010','1001'],
    L: ['1000','1000','1000','1000','1111'],
    M: ['10001','11011','10101','10001','10001'],
    N: ['10001','11001','10101','10011','10001'],
    O: ['0110','1001','1001','1001','0110'],
    P: ['1110','1001','1110','1000','1000'],
    Q: ['0110','1001','1001','1011','0111'],
    R: ['1110','1001','1110','1010','1001'],
    S: ['0111','1000','0110','0001','1110'],
    T: ['11111','00100','00100','00100','00100'],
    U: ['1001','1001','1001','1001','0110'],
    V: ['10001','10001','10001','01010','00100'],
    W: ['10001','10001','10101','11011','10001'],
    X: ['10001','01010','00100','01010','10001'],
    Y: ['10001','01010','00100','00100','00100'],
    Z: ['1111','0001','0110','1000','1111'],
    // Lowercase keeps the corresponding uppercase advance width, so changing
    // letter case does not recenter the phrase or move neighboring characters.
    a: ['0000','0000','0111','1001','0111'],
    b: ['1000','1000','1110','1001','1110'],
    c: ['0000','0000','0111','1000','0111'],
    d: ['0001','0001','0111','1001','0111'],
    e: ['0000','0000','0111','1110','0111'],
    f: ['0011','0100','1110','0100','0100'],
    g: ['0000','0111','1001','0111','1110'],
    h: ['1000','1000','1110','1001','1001'],
    i: ['010','000','110','010','111'],
    j: ['0001','0000','0001','1001','0110'],
    k: ['1000','1000','1010','1100','1010'],
    l: ['1000','1000','1000','1000','1100'],
    m: ['00000','00000','11010','10101','10101'],
    n: ['00000','00000','11100','10010','10010'],
    o: ['0000','0000','0110','1001','0110'],
    p: ['0000','1110','1001','1110','1000'],
    q: ['0000','0111','1001','0111','0001'],
    r: ['0000','0000','1011','1100','1000'],
    s: ['0000','0000','0111','0110','1110'],
    t: ['00100','00100','11110','00100','00011'],
    u: ['0000','0000','1001','1001','0111'],
    v: ['00000','00000','10001','01010','00100'],
    w: ['00000','00000','10101','10101','01010'],
    x: ['00000','00000','01010','00100','01010'],
    y: ['00000','10001','01010','00100','01000'],
    z: ['0000','1111','0010','0100','1111'],
    0: ['111','101','101','101','111'], 1: ['010','110','010','010','111'],
    2: ['110','001','010','100','111'], 3: ['110','001','010','001','110'],
    4: ['101','101','111','001','001'], 5: ['111','100','110','001','110'],
    6: ['011','100','111','101','111'], 7: ['111','001','010','010','010'],
    8: ['111','101','111','101','111'], 9: ['111','101','111','001','110'],
    '!': ['1','1','1','0','1'], '?': ['110','001','010','000','010'],
    '-': ['000','000','111','000','000'], '.': ['0','0','0','0','1'],
    ' ': ['00','00','00','00','00']
  };
  const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
  const PALETTE = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const THEMES = {
    dark: {background:'#0d1117', cell:'#0d1117', palette:PALETTE, highlight:'#a8bbd2', muted:'#9198a1', heading:'#f0f6fc', account:'#b1bac4', border:'#30363d',
      snake:['#edf3fa','#ccd9e9','#aabdd5','#899fb9','#6b819b','#51667f'], eyes:'#17283c'},
    light: {background:'#ffffff', cell:'#f1f3f5', palette:['#ebedf0','#9be9a8','#40c463','#30a14e','#216e39'], highlight:'#43566e', muted:'#59636e', heading:'#1f2328', account:'#59636e', border:'#d1d9e0',
      snake:['#243b56','#3b5069','#4c637e','#657a90','#8092a5','#a0aebb'], eyes:'#ffffff'}
  };
  function getTheme(theme='dark') {
    if (!Object.hasOwn(THEMES,theme)) throw new Error('主题应为 light 或 dark。');
    return THEMES[theme];
  }
  const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const normalizeText = text => text.normalize('NFKC').trim().replace(/\s+/g, ' ');

  function textMask(text, columns) {
    text = normalizeText(text);
    let glyphs = [...text].map(char => {
      if (!FONT[char]) throw new Error(`暂不支持字符「${char}」，请使用英文字母、数字或 ! ? - .`);
      return FONT[char];
    });
    const measure = () => glyphs.reduce((n, glyph) => n + glyph[0].length, 0) + Math.max(0, glyphs.length - 1);
    let width = measure(), compactSpaces = false;
    // Keep every character and the grid geometry; tighten word spaces only if needed.
    if (width > columns - 2 && text.includes(' ')) {
      glyphs = [...text].map((char,i) => char === ' ' ? ['0','0','0','0','0'] : glyphs[i]);
      width = measure(); compactSpaces = true;
    }
    const anchorWidth=width;
    const profileLayout=text.toUpperCase()==='HIRE ME !PLZ';
    if (profileLayout) {
      // The two inter-character gaps around this space already contribute two
      // empty columns. A zero-width space glyph makes the visible word gap 2.
      glyphs[4]=['','','','',''];
      width=measure();
    }
    if (width > columns - 2) throw new Error(`文字需要 ${width} 列，当前可用 ${columns - 2} 列；请缩短文字。`);
    const pixels = [];
    // Shift from the previous line origin, not a newly centered narrower line.
    let x = Math.floor((columns - anchorWidth) / 2)+(profileLayout?2:0);
    for (const [index,glyph] of glyphs.entries()) {
      // Pull ! into its preceding word space by exactly one day; retain its
      // original advance so every following letter stays in its existing slot.
      // The lowercase l has two unused right-side columns. Pull z into that
      // sidebearing, leaving one empty column between the l foot and z.
      const offset=text[index]==='!'&&text[index-1]===' '?-1:text.slice(index-1,index+1)==='lz'?-2:0;
      glyph.forEach((row, y) => [...row].forEach((bit, dx) => {
        if (bit === '1') pixels.push({column: x + dx + offset, row: y + 1});
      }));
      x += glyph[0].length + 1;
    }
    if (pixels.some(p=>p.column<1||p.column>columns-2)) throw new Error('文字位移后超出网格，请缩短文字。');
    return {text, width, pixels, compactSpaces};
  }

  function validateData(data) {
    if (!data || !Array.isArray(data.weeks) || data.weeks.length < 3 || data.weeks.length > 54)
      throw new Error('贡献数据应包含 3–54 周。');
    if (!Number.isInteger(data.totalContributions) || data.totalContributions < 0)
      throw new Error('贡献总数格式错误。');
    const dates = new Set();
    for (const week of data.weeks) {
      if (!Array.isArray(week.contributionDays)) throw new Error('缺少 contributionDays。');
      const weekdays = new Set();
      for (const day of week.contributionDays) {
        const date = new Date(`${day.date}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day.date || date.getUTCDay() !== day.weekday)
          throw new Error('日期与 weekday 不匹配。');
        if (dates.has(day.date) || weekdays.has(day.weekday)) throw new Error('重复的日期或星期。');
        if (!Number.isInteger(day.contributionCount) || day.contributionCount < 0 || !LEVELS.includes(day.contributionLevel))
          throw new Error('贡献数量或颜色等级格式错误。');
        dates.add(day.date); weekdays.add(day.weekday);
      }
    }
    return data;
  }

  // Linear channel interpolation preserves the API's ordered contribution levels.
  function mixColor(background, hex, brightness) {
    const a = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16));
    const b = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * brightness).toString(16).padStart(2, '0')).join('');
  }
  function dimColor(hex, brightness, theme='dark') {
    return mixColor(getTheme(theme).background,hex,brightness);
  }
  function contributionColor(level, brightness, theme='dark') {
    const colors=getTheme(theme);
    return mixColor(colors.cell,colors.palette[level],brightness);
  }

  // Contribution shade and reveal animation are independent: use fill, not opacity.
  // Even level 0 keeps a readable floor so the shape of the word stays complete.
  function letterColor(level, highlight, theme='dark') {
    const colors=getTheme(theme);
    highlight=highlight??colors.highlight;
    if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('字母贡献等级应为 0–4。');
    if (!/^#[0-9a-f]{6}$/i.test(highlight)) throw new Error('高亮颜色应为六位十六进制颜色。');
    // Light backgrounds need darker, not brighter, high-contribution pixels.
    if (theme === 'light') {
      return level <= 2 ? dimColor(highlight,0.75+level*0.125,theme) : mixColor(highlight,'#000000',(level-2)*0.16);
    }
    if (level <= 2) return dimColor(highlight, 0.5 + level * 0.25,theme);
    const lift = (level - 2) * 0.18;
    return '#' + [1, 3, 5].map(i => {
      const channel = parseInt(highlight.slice(i, i + 2), 16);
      return Math.round(channel + (255 - channel) * lift).toString(16).padStart(2, '0');
    }).join('');
  }

  function renderSVG(data, options = {}) {
    validateData(data);
    const {text = 'GIVE ME JOB', brightness = 0.22, overlay = true, theme = 'dark', intent = '', intentEmphasis = ''} = options;
    const colors=getTheme(theme), highlight=options.highlight??colors.highlight;
    if (typeof intent !== 'string' || intent.length > 60) throw new Error('说明文字应为 60 字符以内的字符串。');
    if (typeof intentEmphasis !== 'string' || intentEmphasis.length > 60) throw new Error('加粗文字应为 60 字符以内的字符串。');
    const intentMarkup = intentEmphasis ? intent.split(intentEmphasis).map(escapeXML).join(`<tspan font-weight="700">${escapeXML(intentEmphasis)}</tspan>`) : escapeXML(intent);
    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 1) throw new Error('底图亮度应在 0–1 之间。');
    if (!/^#[0-9a-f]{6}$/i.test(highlight)) throw new Error('高亮颜色应为六位十六进制颜色。');
    const mask = textMask(text, data.weeks.length);
    const pitch = 16, cell = 13, left = 54, top = 83;
    const width = left + data.weeks.length * pitch + 22, height = 252;
    const xFor = col => left + col * pitch;
    const yFor = row => top + row * pitch;
    const base = [], months = [], valid = new Set();
    let previousMonth = '';
    const monthLabels = [];
    data.weeks.forEach((week, col) => {
      const first = week.contributionDays[0];
      if (first && first.date.slice(0, 7) !== previousMonth) {
        previousMonth = first.date.slice(0, 7);
        if (col <= data.weeks.length - 2) {
          const label = new Date(first.date + 'T00:00:00Z').toLocaleString('en-US', {month:'short',timeZone:'UTC'});
          // Prefer the new month's label over a tiny fragment of the first month.
          if (monthLabels.length && col - monthLabels[monthLabels.length - 1].col < 3) monthLabels.pop();
          monthLabels.push({col, label});
        }
      }
      week.contributionDays.forEach(day => {
        const key = `${col},${day.weekday}`;
        valid.add(key);
        // The real count remains untouched even underneath a letter.
        const level = LEVELS.indexOf(day.contributionLevel);
        const fill = contributionColor(level, brightness, theme);
        base.push(`<rect x="${xFor(col)}" y="${yFor(day.weekday)}" width="${cell}" height="${cell}" rx="2" fill="${fill}" data-date="${day.date}" data-count="${day.contributionCount}" data-level="${level}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`);
      });
    });
    monthLabels.forEach(({col, label}) => months.push(`<text x="${xFor(col)}" y="68">${label}</text>`));
    // Keep letters out of partial-week padding. Never fabricate missing dates.
    const missing = mask.pixels.filter(p => !valid.has(`${p.column},${p.row}`));
    if (overlay && missing.length) throw new Error('文字落在不完整周的空位上，请缩短文字。');
    const letters = overlay ? mask.pixels.map(p => {
      const day = data.weeks[p.column].contributionDays.find(day => day.weekday === p.row);
      const level = LEVELS.indexOf(day.contributionLevel);
      return `<rect x="${xFor(p.column)}" y="${yFor(p.row)}" width="${cell}" height="${cell}" rx="2" fill="${letterColor(level, highlight, theme)}" data-letter-date="${day.date}" data-letter-count="${day.contributionCount}" data-letter-level="${level}"/>`;
    }).join('\n') : '';
    const heading = data.source === 'demo' ? 'DEMO DATA · contribution backdrop' : `${data.totalContributions.toLocaleString('en-US')} contributions in the last year`;
    const dayLabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].map(([row, label]) => `<text x="18" y="${yFor(row) + 10}">${label}</text>`).join('');
    const legendX = width - 172;
    const legend = colors.palette.map((color, i) => `<rect x="${legendX + 35 + i * 15}" y="211" width="11" height="11" rx="2" fill="${contributionColor(i, brightness, theme)}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
<title id="title">${escapeXML(data.username)} contribution art — ${escapeXML([intent, mask.text].filter(Boolean).join(' '))}</title>
<desc id="description">Real contribution counts are shown in a dimmed backdrop. Decorative letter pixels use five shades based on the same dates' contribution levels, with a readable floor for zero contributions. They do not add contributions. Data source: ${escapeXML(data.source)}.</desc>
<rect width="${width}" height="${height}" fill="${colors.background}"/>
<style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;fill:${colors.muted}}.heading{font-size:18px;fill:${colors.heading}}.account{fill:${colors.account}}.intent{font-size:13px;letter-spacing:2px;fill:${colors.account}}</style>
<text class="${intent?'intent':'heading'}" x="${intent?width/2:18}" y="30" text-anchor="${intent?'middle':'start'}">${intent?intentMarkup:heading}</text>
<text class="account" x="${width - 18}" y="30" text-anchor="end">@${escapeXML(data.username)}</text>
<rect x="1" y="47" width="${width - 2}" height="${height - 48}" rx="6" fill="none" stroke="${colors.border}"/>
${months.join('')}${dayLabels}
<g id="contributions">${base.join('\n')}</g>
<g id="letter-overlay" aria-hidden="true" pointer-events="none">${letters}</g>
<text x="18" y="222">${intent?heading:'Dimmed contributions · bright text overlay'}</text>
<text x="${legendX}" y="221">Less</text>${legend}<text x="${width - 19}" y="221" text-anchor="end">More</text>
</svg>`;
  }

  const api = {FONT, LEVELS, PALETTE, THEMES, getTheme, normalizeText, textMask, validateData, dimColor, contributionColor, letterColor, renderSVG};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ContributionBanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
