/**
 * 知识库切分（实验5 2.3）
 *
 * 策略：先按 Markdown 标题切成"节"，再按句子把节切成 220—320 字符的片段；
 * 片段之间保留 1 句重叠（约 30—45 字符），避免把跨句的关键信息切断；
 * 片段的元数据（docId / title / source / license / 段落序号 / 字符数）随片段一起入库，
 * 供检索结果带出处（2.4）与核查来源对应（2.3）使用。
 */

/** 按句末标点切句，保留标点；冒号、分号不切（它们是同一句内的并列信息） */
export function splitSentences(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const out = [];
  let buf = '';
  for (const ch of normalized) {
    buf += ch;
    if ('。！？；!?；'.includes(ch)) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseFrontMatter(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: text.slice(match[0].length) };
}

/** 把正文按二级标题（## ...）切成节；没有二级标题时整体算一节 */
export function splitSections(body) {
  const lines = String(body ?? '').split('\n');
  const sections = [];
  let current = { heading: '（无小节标题）', lines: [] };
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.lines.length > 0 || current.heading !== '（无小节标题）') sections.push(current);
      current = { heading: line.replace(/^##\s+/, '').trim(), lines: [] };
    } else if (/^#\s+/.test(line)) {
      continue; // 文档标题已在元数据里，不重复入片段
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) sections.push(current);
  return sections.filter((s) => s.lines.join('').trim() !== '');
}

/**
 * 切分单个文档。
 * @param {{docId:string, raw:string, maxChars?:number, minChars?:number}} opts
 * @returns {Array<{chunkId:string, docId:string, title:string, section:string, order:number, text:string, charCount:number}>}
 */
export function chunkDocument({ docId, raw, maxChars = 220, minChars = 24 }) {
  const { meta, body } = parseFrontMatter(raw);
  const title = meta.title ?? docId;
  const sections = splitSections(body);
  const chunks = [];
  let order = 0;

  sections.forEach((section, sectionIndex) => {
    const sentences = splitSentences(section.lines.join(' '));
    let buffer = [];
    let length = 0;
    let overlapText = '';

    const flush = () => {
      if (buffer.length === 0) return;
      const text = buffer.join('').trim();
      // 过短的碎片（例如只剩一句话的节）并入上一片段，避免碎片化；
      // 但合并后不能超过 maxChars + 120，且菜品卡片这类短小节本身就是完整语义单元，不再硬合并
      if (
        text.length < minChars &&
        chunks.length > 0 &&
        chunks[chunks.length - 1].text.length + text.length <= maxChars + 120
      ) {
        chunks[chunks.length - 1].text += ` ${text}`;
        chunks[chunks.length - 1].charCount = chunks[chunks.length - 1].text.length;
      } else {
        chunks.push({
          chunkId: `${docId}-c${String(order).padStart(2, '0')}`,
          docId,
          title,
          section: section.heading,
          order,
          sectionIndex,
          text,
          charCount: text.length,
        });
        order += 1;
      }
      // 记录本片段最后一句，作为下一片段的重叠句
      overlapText = buffer[buffer.length - 1] ?? '';
      buffer = [];
      length = 0;
    };

    for (const sentence of sentences) {
      if (length + sentence.length > maxChars && buffer.length > 0) {
        flush();
        if (overlapText) {
          buffer.push(overlapText);
          length += overlapText.length;
        }
      }
      buffer.push(sentence);
      length += sentence.length;
    }
    flush();
  });

  return chunks;
}

/** 从 Markdown 文本提取元数据（供检索结果展示来源与授权信息） */
export function readDocMeta(raw) {
  return parseFrontMatter(raw).meta;
}
