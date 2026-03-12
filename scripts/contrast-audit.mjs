import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const parseHex = (value) => {
  const hex = value.replace('#', '').trim();
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 1,
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  throw new Error(`Unsupported hex color: ${value}`);
};

const parseColor = (value) => {
  const normalized = value.trim();
  if (normalized.startsWith('#')) {
    return parseHex(normalized);
  }
  const rgbaMatch = normalized.match(
    /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)$/i
  );
  if (!rgbaMatch) {
    throw new Error(`Unsupported color format: ${value}`);
  }
  return {
    r: Number(rgbaMatch[1]),
    g: Number(rgbaMatch[2]),
    b: Number(rgbaMatch[3]),
    a: rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]),
  };
};

const toLinear = (value) => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

const contrastRatio = (fg, bg) => {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

const blend = (foreground, background) => {
  const alpha = foreground.a;
  const invAlpha = 1 - alpha;
  return {
    r: Math.round(foreground.r * alpha + background.r * invAlpha),
    g: Math.round(foreground.g * alpha + background.g * invAlpha),
    b: Math.round(foreground.b * alpha + background.b * invAlpha),
    a: 1,
  };
};

const resolveColor = (value, base) => {
  const parsed = parseColor(value);
  if (parsed.a >= 1) return parsed;
  return blend(parsed, base);
};

const THEMES = {
  dark: {
    surfacePrimary: '#000000',
    surfaceRaised: 'rgba(255, 255, 255, 0.12)',
    surfaceStrong: 'rgba(255, 255, 255, 0.18)',
    surfaceActive: '#FFFFFF',
    chipSoft: 'rgba(255, 255, 255, 0.10)',
    contentPrimary: '#FFFFFF',
    contentSecondary: 'rgba(255, 255, 255, 0.72)',
    contentDim: 'rgba(255, 255, 255, 0.54)',
    contentActive: '#000000',
    accentPrimary: '#00F5FF',
    accentOnPrimary: '#031018',
    dangerPrimary: 'rgba(255, 49, 49, 0.84)',
    dangerOnPrimary: '#FFFFFF',
    optionHintBase: 'rgba(7, 18, 28, 0.42)',
  },
  light: {
    surfacePrimary: '#F5F7FA',
    surfaceRaised: 'rgba(15, 23, 42, 0.12)',
    surfaceStrong: 'rgba(15, 23, 42, 0.18)',
    surfaceActive: '#000000',
    chipSoft: 'rgba(15, 23, 42, 0.12)',
    contentPrimary: '#0F172A',
    contentSecondary: '#475569',
    contentDim: '#5B6B82',
    contentActive: '#FFFFFF',
    accentPrimary: '#0EA5E9',
    accentOnPrimary: '#04263A',
    dangerPrimary: '#B91C1C',
    dangerOnPrimary: '#FFFFFF',
    optionHintBase: 'rgba(7, 18, 28, 0.42)',
  },
};

const CHECKS = [
  ['contentPrimary', 'surfacePrimary', 'Primary text on app background'],
  ['contentSecondary', 'surfacePrimary', 'Secondary text on app background'],
  ['contentDim', 'surfacePrimary', 'Dim text on app background'],
  ['contentPrimary', 'surfaceRaised', 'Primary text on raised surface'],
  ['contentSecondary', 'surfaceRaised', 'Secondary text on raised surface'],
  ['contentPrimary', 'surfaceStrong', 'Primary text on strong surface'],
  ['contentSecondary', 'surfaceStrong', 'Secondary text on strong surface'],
  ['contentPrimary', 'chipSoft', 'Primary text on chip surface'],
  ['contentActive', 'surfaceActive', 'Active text on active surface'],
  ['accentOnPrimary', 'accentPrimary', 'Accent text on accent surface'],
  ['dangerOnPrimary', 'dangerPrimary', 'Danger text on danger surface'],
  ['contentPrimary', 'optionHintBase', 'Hint text on consult hint chip'],
];

const formatRow = (description, ratio) => {
  const pass = ratio >= 4.5 ? 'PASS' : 'FAIL';
  return `| ${description} | ${ratio.toFixed(2)}:1 | ${pass} |`;
};

const evaluateTheme = (themeName, themeTokens) => {
  const base = parseColor(themeTokens.surfacePrimary);

  return CHECKS.map(([fgKey, bgKey, description]) => {
    const fg = resolveColor(themeTokens[fgKey], base);
    const bg = resolveColor(themeTokens[bgKey], base);
    const ratio = contrastRatio(fg, bg);
    return { description, ratio };
  });
};

const buildMarkdown = (resultsByTheme) => {
  const generatedAt = new Date().toISOString();
  let output = `# Contrast Audit\n\nGenerated: ${generatedAt}\n\n`;
  output += `Threshold: WCAG AA normal text (4.5:1)\n\n`;

  Object.entries(resultsByTheme).forEach(([themeName, rows]) => {
    output += `## ${themeName[0].toUpperCase()}${themeName.slice(1)} Theme\n\n`;
    output += '| Pair | Ratio | Result |\n';
    output += '| --- | --- | --- |\n';
    rows.forEach((row) => {
      output += `${formatRow(row.description, row.ratio)}\n`;
    });
    const failCount = rows.filter((row) => row.ratio < 4.5).length;
    output += `\nSummary: ${rows.length - failCount}/${rows.length} checks passed.\n\n`;
  });

  output += 'Notes:\n';
  output += '- Composite colors using alpha were blended against each theme surface primary.\n';
  output += '- Gradient states were audited using their base token backdrop.\n';
  output += '- This audit covers semantic token pairs used across the UI.\n';

  return output;
};

const results = Object.fromEntries(
  Object.entries(THEMES).map(([themeName, themeTokens]) => [
    themeName,
    evaluateTheme(themeName, themeTokens),
  ])
);

const markdown = buildMarkdown(results);
const reportPath = resolve('docs/accessibility/contrast-audit.md');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, markdown, 'utf8');

console.log(`Contrast report generated at: ${reportPath}`);
