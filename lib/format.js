'use strict';

/**
 * 题庄返回的题干/解析是 HTML + LaTeX 混排。
 * 电纸书浏览器很旧：这里只保留最基础的标签，并把常见 LaTeX 转成
 * 可读的 HTML（上标、下标、分数、根号、常用符号），不引入 MathJax。
 */

const TOS_BASE = 'https://tizhaung.tos-cn-beijing.volces.com';

const ALLOWED_TAGS = {
  p: 1,
  div: 1,
  br: 1,
  span: 1,
  strong: 1,
  b: 1,
  em: 1,
  i: 1,
  u: 1,
  s: 1,
  sub: 1,
  sup: 1,
  ul: 1,
  ol: 1,
  li: 1,
  blockquote: 1,
  table: 1,
  thead: 1,
  tbody: 1,
  tr: 1,
  th: 1,
  td: 1,
  img: 1,
  hr: 1,
  h1: 1,
  h2: 1,
  h3: 1,
  h4: 1,
  code: 1,
  pre: 1,
};

const SYMBOLS = {
  times: '×',
  div: '÷',
  cdot: '·',
  ast: '∗',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  propto: '∝',
  sim: '∽',
  cong: '≌',
  angle: '∠',
  triangle: '△',
  odot: '⊙',
  parallel: '∥',
  perp: '⊥',
  because: '∵',
  therefore: '∴',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  int: '∫',
  oint: '∮',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  degree: '°',
  circ: '°',
  prime: '′',
  ldots: '…',
  cdots: '⋯',
  dots: '…',
  quad: ' ',
  qquad: ' ',
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(value) {
  return String(value == null ? '' : value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, function (all, code) {
      const value = parseInt(code, 10);
      return value >= 0 && value <= 0x10ffff ? String.fromCharCode(value) : all;
    })
    .replace(/&#x([0-9a-f]+);/gi, function (all, code) {
      const value = parseInt(code, 16);
      return value >= 0 && value <= 0x10ffff ? String.fromCharCode(value) : all;
    })
    .replace(/&amp;/gi, '&');
}

function stripTags(value) {
  let text = decodeEntities(String(value == null ? '' : value).replace(/<[^>]*>/g, ''));
  // 处理 &amp;nbsp; 这类二次转义
  return decodeEntities(text);
}

function getAttr(attrs, name) {
  const re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = re.exec(attrs || '');
  if (!m) return '';
  return decodeEntities(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3] || '');
}

function safeImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (value.indexOf('http://') === 0 || value.indexOf('https://') === 0) return value;
  if (value.indexOf('//') === 0) return 'https:' + value;
  if (value.charAt(0) === '/') return TOS_BASE + value;
  return '';
}

function sanitizeHtml(input) {
  if (!input) return '';
  const source = String(input).replace(/<!--[\s\S]*?-->/g, '');
  let out = '';
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      out += escapeHtml(decodeEntities(source.slice(i)));
      break;
    }
    if (lt > i) out += escapeHtml(decodeEntities(source.slice(i, lt)));

    const gt = source.indexOf('>', lt);
    if (gt === -1) {
      out += escapeHtml(decodeEntities(source.slice(lt)));
      break;
    }

    const raw = source.slice(lt + 1, gt);
    const match = /^\/?\s*([a-zA-Z0-9]+)([\s\S]*)$/.exec(raw);
    if (!match) {
      out += escapeHtml(source.slice(lt, gt + 1));
      i = gt + 1;
      continue;
    }

    const closing = raw.charAt(0) === '/';
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';

    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
      if (!closing) {
        const closeRe = new RegExp('</\\s*' + tag + '\\s*>', 'i');
        const rest = source.slice(gt + 1);
        const close = closeRe.exec(rest);
        i = close ? gt + 1 + close.index + close[0].length : source.length;
      } else {
        i = gt + 1;
      }
      continue;
    }

    if (!ALLOWED_TAGS[tag]) {
      i = gt + 1;
      continue;
    }

    if (closing) {
      if (tag !== 'img' && tag !== 'br' && tag !== 'hr') out += '</' + tag + '>';
    } else if (tag === 'img') {
      const src = safeImageSrc(getAttr(attrs, 'src'));
      if (src) {
        const alt = getAttr(attrs, 'alt');
        const width = parseInt(getAttr(attrs, 'width'), 10);
        const height = parseInt(getAttr(attrs, 'height'), 10);
        out += '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '"';
        if (width > 0) out += ' width="' + width + '"';
        if (height > 0) out += ' height="' + height + '"';
        out += '>';
      }
    } else if (tag === 'br' || tag === 'hr') {
      out += '<' + tag + '>';
    } else if (tag === 'td' || tag === 'th') {
      const colspan = parseInt(getAttr(attrs, 'colspan'), 10);
      const rowspan = parseInt(getAttr(attrs, 'rowspan'), 10);
      out += '<' + tag;
      if (colspan > 1) out += ' colspan="' + colspan + '"';
      if (rowspan > 1) out += ' rowspan="' + rowspan + '"';
      out += '>';
    } else if (tag === 'ol') {
      const start = parseInt(getAttr(attrs, 'start'), 10);
      out += '<ol' + (start > 0 ? ' start="' + start + '"' : '') + '>';
    } else {
      out += '<' + tag + '>';
    }

    i = gt + 1;
  }

  return out;
}

function readGroup(source, start) {
  let depth = 0;
  let i = start;
  for (; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { content: source.slice(start + 1, i), next: i + 1 };
      }
    }
  }
  return { content: source.slice(start + 1), next: source.length };
}

function skipSpaces(source, i) {
  while (i < source.length && /\s/.test(source.charAt(i))) i++;
  return i;
}

/**
 * 把一段 LaTeX 转成旧浏览器也能显示的 HTML。
 */
function latexToHtml(tex) {
  let source = String(tex == null ? '' : tex);
  source = source.replace(/\\\(|\\\)|\\\[|\\\]/g, '');
  let out = '';
  let i = 0;

  while (i < source.length) {
    const ch = source.charAt(i);

    if (ch === '\\') {
      const rest = source.slice(i + 1);
      const cmdMatch = /^([a-zA-Z]+)/.exec(rest);

      if (cmdMatch) {
        const cmd = cmdMatch[1];
        i += 1 + cmd.length;

        if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac' || cmd === 'cfrac') {
          let p = skipSpaces(source, i);
          let g1 = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: source.charAt(p) || '', next: p + 1 };
          p = skipSpaces(source, g1.next);
          let g2 = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: source.charAt(p) || '', next: p + 1 };
          out += '(' + latexToHtml(g1.content) + ')/(' + latexToHtml(g2.content) + ')';
          i = g2.next;
        } else if (cmd === 'sqrt') {
          let p = skipSpaces(source, i);
          let index = '';
          if (source.charAt(p) === '[') {
            const end = source.indexOf(']', p);
            if (end !== -1) {
              index = source.slice(p + 1, end);
              p = skipSpaces(source, end + 1);
            }
          }
          const g = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: source.charAt(p) || '', next: p + 1 };
          out += (index ? '<sup>' + latexToHtml(index) + '</sup>' : '') + '√(' + latexToHtml(g.content) + ')';
          i = g.next;
        } else if (
          cmd === 'text' || cmd === 'mathrm' || cmd === 'mathbf' || cmd === 'mathit' ||
          cmd === 'mathsf' || cmd === 'mathtt' || cmd === 'operatorname' || cmd === 'mbox'
        ) {
          const p = skipSpaces(source, i);
          const g = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: source.charAt(p) || '', next: p + 1 };
          out += latexToHtml(g.content);
          i = g.next;
        } else if (cmd === 'overline' || cmd === 'underline') {
          const p = skipSpaces(source, i);
          const g = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: source.charAt(p) || '', next: p + 1 };
          out += '<span class="' + (cmd === 'overline' ? 'ovl' : 'unl') + '">' + latexToHtml(g.content) + '</span>';
          i = g.next;
        } else if (cmd === 'vec' || cmd === 'overrightarrow' || cmd === 'overleftarrow') {
          const p = skipSpaces(source, i);
          const g = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: source.charAt(p) || '', next: p + 1 };
          out += (cmd === 'overleftarrow' ? '←' : '→') + latexToHtml(g.content);
          i = g.next;
        } else if (cmd === 'begin' || cmd === 'end') {
          const p = skipSpaces(source, i);
          const g = p < source.length && source.charAt(p) === '{' ? readGroup(source, p) : { content: '', next: p };
          i = g.next;
        } else if (
          cmd === 'left' || cmd === 'right' || cmd === 'middle' || cmd === 'big' || cmd === 'Big' ||
          cmd === 'bigg' || cmd === 'Bigg' || cmd === 'bigl' || cmd === 'bigr' ||
          cmd === 'Bigl' || cmd === 'Bigr' || cmd === 'biggl' || cmd === 'biggr' ||
          cmd === 'Biggl' || cmd === 'Biggr' || cmd === 'displaystyle' || cmd === 'textstyle'
        ) {
          // 只去掉命令本身，后面的括号等符号保留
        } else if (cmd === 'quad' || cmd === 'qquad') {
          out += ' ';
        } else if (SYMBOLS[cmd]) {
          out += SYMBOLS[cmd];
        } else if (cmd === 'sin' || cmd === 'cos' || cmd === 'tan' || cmd === 'cot' ||
                   cmd === 'sec' || cmd === 'csc' || cmd === 'log' || cmd === 'ln' ||
                   cmd === 'lim' || cmd === 'max' || cmd === 'min' || cmd === 'arcsin' ||
                   cmd === 'arccos' || cmd === 'arctan') {
          out += cmd;
        } else {
          // 未知命令：至少不要显示反斜杠
          out += cmd;
        }
        continue;
      }

      const next = source.charAt(i + 1);
      if (next === '\\') {
        out += '<br>';
        i += 2;
      } else if (next === ' ' || next === ',' || next === ';' || next === ':' || next === '!') {
        if (next === ' ') out += ' ';
        i += 2;
      } else if (next) {
        out += escapeHtml(next);
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (ch === '^' || ch === '_') {
      const tag = ch === '^' ? 'sup' : 'sub';
      let p = i + 1;
      if (source.charAt(p) === '{') {
        const g = readGroup(source, p);
        out += '<' + tag + '>' + latexToHtml(g.content) + '</' + tag + '>';
        i = g.next;
      } else {
        out += '<' + tag + '>' + escapeHtml(source.charAt(p) || '') + '</' + tag + '>';
        i = p + 1;
      }
      continue;
    }

    if (ch === '{') {
      const g = readGroup(source, i);
      out += latexToHtml(g.content);
      i = g.next;
      continue;
    }

    if (ch === '}') {
      i++;
      continue;
    }

    if (ch === '&') {
      // LaTeX 里的 & 是对齐符，但 &nbsp; / &amp; 这类 HTML 实体要保留
      const entity = /^&(?:[a-zA-Z]+|#\d+|#x[0-9a-f]+);/i.exec(source.slice(i));
      if (entity) {
        out += entity[0];
        i += entity[0].length;
      } else {
        out += ' ';
        i++;
      }
      continue;
    }

    if (ch === '~') {
      out += ' ';
      i++;
      continue;
    }

    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function latexToText(tex) {
  return stripTags(latexToHtml(tex));
}

const MATH_RE = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;

/**
 * 富文本：保留安全 HTML，并把 \( ... \) / $...$ 里的 LaTeX 转成 HTML。
 */
function formatRich(input) {
  if (input == null) return '';
  const maths = [];
  let source = String(input);

  source = source.replace(MATH_RE, function (all, displayBracket, inlineParen, displayDollar, inlineDollar) {
    let tex = '';
    let display = false;
    if (displayBracket != null) {
      tex = displayBracket;
      display = true;
    } else if (inlineParen != null) {
      tex = inlineParen;
    } else if (displayDollar != null) {
      tex = displayDollar;
      display = true;
    } else {
      tex = inlineDollar;
    }
    const index = maths.length;
    maths.push({ tex: tex, display: display });
    return '@@INKMATH' + index + '@@';
  });

  source = sanitizeHtml(source);

  source = source.replace(/@@INKMATH(\d+)@@/g, function (all, index) {
    const item = maths[Number(index)];
    if (!item) return '';
    const html = latexToHtml(item.tex);
    return item.display ? '<div class="math-block">' + html + '</div>' : '<span class="math">' + html + '</span>';
  });

  return source;
}

/**
 * 纯文本字段（选项等）也可能带 LaTeX。
 */
function formatPlain(input) {
  if (input == null) return '';
  const source = String(input);
  if (/\\[a-zA-Z]/.test(source)) return latexToHtml(source);
  return sanitizeHtml(source);
}

function normalizeText(value) {
  let text = stripTags(String(value == null ? '' : value));
  text = text.replace(/\u00a0/g, ' ');
  // 全角 ASCII 转半角
  text = text.replace(/[\uff01-\uff5e]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
  text = text.replace(/\u3000/g, ' ');
  text = text.replace(/\s+/g, '');
  text = text.toLowerCase();
  text = text.replace(/[。．.，,；;：:、"'“”‘’（）()【】\[\]]/g, '');
  return text;
}

function normalizeFillText(value) {
  let text = stripTags(String(value == null ? '' : value));
  text = text.replace(/\u00a0/g, ' ');
  text = text.replace(/[\uff01-\uff5e]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
  text = text.replace(/\u3000/g, ' ');
  text = text.replace(/\s+/g, '');
  text = text.toLowerCase();
  text = text.replace(/[−–—]/g, '-');
  // 保留小数点、逗号、负号、斜杠等数学符号，只去掉中文句读和引号括号
  text = text.replace(/[。；;：:、"'“”‘’（）()【】\[\]]/g, '');
  return text;
}

function fillAnswerVariants(raw) {
  const text = latexToText(String(raw == null ? '' : raw));
  const variants = [];
  const push = function (value) {
    const normalized = normalizeFillText(value);
    if (!normalized) return;
    if (variants.indexOf(normalized) === -1) variants.push(normalized);
    const alt = normalized.replace(/×/g, 'x').replace(/÷/g, '/');
    if (alt && variants.indexOf(alt) === -1) variants.push(alt);
    const trimmed = normalized.replace(/[.,;:]+$/, '');
    if (trimmed && variants.indexOf(trimmed) === -1) variants.push(trimmed);
  };

  // 多个空用“；”分隔时视为一个完整答案，不拆成多个可选答案
  push(text);
  const parts = text.split(/\s*(?:或者|或)\s*/);
  for (let i = 0; i < parts.length; i++) push(parts[i]);

  return variants;
}

export {
  TOS_BASE,
  escapeHtml,
  decodeEntities,
  stripTags,
  sanitizeHtml,
  latexToHtml,
  latexToText,
  formatRich,
  formatPlain,
  normalizeText,
  normalizeFillText,
  fillAnswerVariants,
};
