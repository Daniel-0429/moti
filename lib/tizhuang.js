'use strict';

import { sha1 } from './hash.js';
import * as format from './format.js';
import { McpError } from './mcp.js';

const SUBJECTS = {
  1: { id: 1, name: '语文' },
  2: { id: 2, name: '数学' },
  3: { id: 3, name: '英语' },
  4: { id: 4, name: '历史' },
  5: { id: 5, name: '地理' },
  6: { id: 6, name: '政治' },
  7: { id: 7, name: '生物' },
  8: { id: 8, name: '物理' },
  9: { id: 9, name: '化学' },
  10: { id: 10, name: '科学' },
  11: { id: 11, name: '道德与法治' },
  12: { id: 12, name: '历史与社会' },
  14: { id: 14, name: '信息技术' },
  15: { id: 15, name: '通用技术' },
};

// 题庄的 phase_id：1 小学、2 初中、3 高中
const PHASES = {
  primary: 1,
  junior: 2,
  senior: 3,
};

const STAGES = {
  primary: {
    key: 'primary',
    name: '小学',
    grades: [
      { id: 110, name: '一年级' },
      { id: 120, name: '二年级' },
      { id: 130, name: '三年级' },
      { id: 140, name: '四年级' },
      { id: 150, name: '五年级' },
      { id: 160, name: '六年级' },
    ],
    subjects: [1, 2, 3, 10, 11],
  },
  junior: {
    key: 'junior',
    name: '初中',
    grades: [
      { id: 200, name: '七年级' },
      { id: 300, name: '八年级' },
      { id: 400, name: '九年级' },
    ],
    subjects: [1, 2, 3, 8, 9, 7, 4, 5, 11],
  },
  senior: {
    key: 'senior',
    name: '高中',
    grades: [
      { id: 500, name: '高一' },
      { id: 600, name: '高二' },
      { id: 700, name: '高三' },
    ],
    subjects: [1, 2, 3, 8, 9, 7, 4, 5, 6],
  },
};

function findStage(key) {
  return STAGES[key] || null;
}

function findGrade(stage, gradeId) {
  if (!stage) return null;
  for (let i = 0; i < stage.grades.length; i++) {
    if (stage.grades[i].id === Number(gradeId)) return stage.grades[i];
  }
  return null;
}

async function listEditions(client, stageKey, gradeId, subjectId) {
  const phase = PHASES[stageKey];
  if (!phase) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

  const data = await client.callTool('list_editions', {
    subject_id: Number(subjectId),
    phase_id: phase,
    grade_id: Number(gradeId),
  });

  const list = (data && data.data) || [];
  const editions = [];
  for (let i = 0; i < list.length; i++) {
    const id = Number(list[i] && list[i].id);
    const name = list[i] && list[i].name ? String(list[i].name) : '';
    if (id > 0 && name && !editions.some(function (item) { return item.id === id; })) {
      editions.push({ id: id, name: name });
    }
  }
  return editions;
}

async function searchKnowledge(client, stageKey, subjectId, keyword, limit) {
  const phase = PHASES[stageKey];
  if (!phase) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

  const args = {
    subject_id: Number(subjectId),
    phase_id: phase,
    limit: Math.max(1, Math.min(50, Number(limit) || 20)),
  };
  if (keyword) args.keyword = keyword;
  else args.parent_id = 0;

  const data = await client.callTool('search_knowledge_points', args);
  const list = (data && data.data) || [];
  const items = [];
  const seenIds = {};
  const seenKnowledge = {};
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const id = Number(item.id);
    const knowledgeId = Number(item.knowledge_id) || 0;
    const name = item.name ? String(item.name) : '';
    if (!(id > 0) || !name || seenIds[id]) continue;
    if (knowledgeId > 0 && seenKnowledge[knowledgeId]) continue;
    seenIds[id] = true;
    if (knowledgeId > 0) seenKnowledge[knowledgeId] = true;
    items.push({
      id: id,
      knowledgeId: knowledgeId,
      name: name,
      level: Number(item.level) || 0,
      parentId: Number(item.parent_id) || 0,
      hasChildren: !!item.has_children,
    });
  }
  return items;
}

// 统一按北京时间（UTC+8）计算“今天”，
// 避免 Node 本地时区与 Cloudflare Workers 的 UTC 导致跨天不一致。
const DAY_OFFSET_MS = 8 * 60 * 60 * 1000;

function todayKey(date) {
  const d = new Date((date ? date.getTime() : Date.now()) + DAY_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

function normalizeProfile(input) {
  const stage = findStage(input && input.stage);
  if (!stage) throw new McpError('学段不正确', { code: 'BAD_REQUEST' });

  const grade = findGrade(stage, input.grade);
  if (!grade) throw new McpError('年级不正确', { code: 'BAD_REQUEST' });

  const rawSubjects = Array.isArray(input.subjects) ? input.subjects : [];
  const subjects = [];
  for (let i = 0; i < rawSubjects.length; i++) {
    const id = Number(rawSubjects[i]);
    if (stage.subjects.indexOf(id) !== -1 && subjects.indexOf(id) === -1) subjects.push(id);
  }
  if (!subjects.length) throw new McpError('至少选择一个学科', { code: 'BAD_REQUEST' });

  const perSubject = Math.max(1, Math.min(10, Number(input.perSubject) || 2));
  const mode = input.mode === 'mixed' ? 'mixed' : 'objective';

  // 教材版本：{ 学科ID: 版本ID }，0 或缺失表示不限版本
  const editions = {};
  const editionNames = {};
  const rawEditions = (input && input.editions) || {};
  const rawNames = (input && input.editionNames) || {};
  for (let i = 0; i < subjects.length; i++) {
    const id = subjects[i];
    const edition = Number(rawEditions[id] != null ? rawEditions[id] : rawEditions[String(id)]);
    if (edition > 0) {
      editions[id] = edition;
      const name = rawNames[id] != null ? rawNames[id] : rawNames[String(id)];
      if (name) editionNames[id] = String(name).slice(0, 60);
    }
  }

  // 知识点：{ 学科ID: [{ id: 知识树节点ID, name }] }，使用知识树分支（含子知识点）
  const knowledge = {};
  const rawKnowledge = (input && input.knowledge) || {};
  for (let i = 0; i < subjects.length; i++) {
    const id = subjects[i];
    const list = rawKnowledge[id] != null ? rawKnowledge[id] : rawKnowledge[String(id)];
    if (!Array.isArray(list)) continue;
    const items = [];
    const seen = {};
    for (let j = 0; j < list.length && items.length < 10; j++) {
      const node = list[j] || {};
      const nodeId = Number(node.id);
      const name = node.name ? String(node.name).slice(0, 80) : '';
      if (!(nodeId > 0) || !name || seen[nodeId]) continue;
      seen[nodeId] = true;
      items.push({ id: nodeId, name: name });
    }
    if (items.length) knowledge[id] = items;
  }

  return {
    stage: stage.key,
    grade: grade.id,
    subjects: subjects,
    perSubject: perSubject,
    mode: mode,
    editions: editions,
    editionNames: editionNames,
    knowledge: knowledge,
  };
}

function configHash(profile) {
  const editions = profile.editions || {};
  const editionKey = Object.keys(editions)
    .map(function (id) { return id + ':' + editions[id]; })
    .sort()
    .join(',');
  const knowledge = profile.knowledge || {};
  const knowledgeKey = Object.keys(knowledge)
    .map(function (id) {
      const ids = (knowledge[id] || []).map(function (item) { return item.id; }).sort(function (a, b) { return a - b; });
      return id + ':' + ids.join('+');
    })
    .sort()
    .join(',');
  return sha1(JSON.stringify({
    stage: profile.stage,
    grade: profile.grade,
    subjects: profile.subjects.slice().sort(function (a, b) { return a - b; }),
    perSubject: profile.perSubject,
    mode: profile.mode,
    editions: editionKey,
    knowledge: knowledgeKey,
  }));
}

function normalizeJudge(value) {
  const text = format.normalizeText(value);
  if (/^(对|正确|是|true|t|√|✓|1)$/.test(text)) return '对';
  if (/^(错|错误|否|false|f|×|✗|0)$/.test(text)) return '错';
  return text;
}

function unique(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] && out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  return out;
}

function optionList(item) {
  const plain = item.options || {};
  const html = item.options_html || {};
  const keys = Object.keys(plain).sort();
  const list = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = html[key] != null && html[key] !== '' ? html[key] : plain[key];
    list.push({ key: key, html: format.formatRich(value) });
  }
  return list;
}

function normalizeItem(item, subject) {
  if (!item || item.id == null) return null;
  if (item.subquestions && item.subquestions.length) return null;
  if (item.is_auto_gradable === false) return null;

  const title = item.title_html || item.title || '';
  if (!title) return null;

  let stemHtml = format.formatRich(title);
  if (Array.isArray(item.image_urls) && item.image_urls.length && !/<img/i.test(title)) {
    for (let i = 0; i < item.image_urls.length; i++) {
      stemHtml += '<p class="stem-image"><img src="' + format.escapeHtml(item.image_urls[i]) + '" alt=""></p>';
    }
  }

  const typeRaw = item.question_type || '';
  const options = optionList(item);
  const optionKeys = options.map(function (option) { return option.key; });

  let type = 'fill';
  if (/判断/.test(typeRaw)) type = 'judge';
  else if (/多选/.test(typeRaw)) type = 'multi';
  else if (/选择/.test(typeRaw) && options.length) type = 'choice';
  else if (options.length) type = 'choice';

  const answerRaw = Array.isArray(item.answer)
    ? item.answer.join('；')
    : (item.answer == null ? '' : String(item.answer));
  const answerText = format.stripTags(answerRaw);

  let answer = [];
  let answerKeys = [];
  let answerDisplay = '';

  if (type === 'choice' || type === 'multi') {
    const letters = (answerText.toUpperCase().match(/[A-H]/g) || []).filter(function (letter) {
      return optionKeys.indexOf(letter) !== -1;
    });
    answer = unique(letters);

    if (!answer.length && answerText) {
      for (let i = 0; i < options.length; i++) {
        if (format.normalizeText(options[i].html) === format.normalizeText(answerText)) {
          answer = [options[i].key];
          break;
        }
      }
    }

    if (!answer.length) {
      // 答案不是选项字母，按填空处理，避免整题无法判分
      type = 'fill';
    } else if (answer.length > 1) {
      type = 'multi';
    }
    answerDisplay = answer.join('、');
  }

  if (type === 'judge') {
    let judgeRaw = answerText;
    if (optionKeys.indexOf(judgeRaw.toUpperCase()) !== -1) {
      const option = options.filter(function (o) { return o.key === judgeRaw.toUpperCase(); })[0];
      if (option) judgeRaw = format.stripTags(option.html);
    }
    answer = [normalizeJudge(judgeRaw)];
    answerDisplay = answer[0];
  }

  if (type === 'fill') {
    answerKeys = format.fillAnswerVariants(answerRaw);
    if (!answerKeys.length) return null;
    answerDisplay = format.formatRich(answerRaw);
  }

  if (!answerDisplay) answerDisplay = format.formatRich(item.answer_html || answerRaw);

  const analysis = format.formatRich(item.analysis_html || item.analysis || '');
  const knowledge = format.stripTags(
    Array.isArray(item.knowledges) ? item.knowledges.join('、') : (item.knowledges || '')
  ).replace(/\s+/g, ' ').replace(/、\s*$/, '').trim();
  const source = format.stripTags(item.source || '').replace(/\s+/g, ' ').trim();

  const fingerprint = format.normalizeText(
    [format.stripTags(title)].concat(options.map(function (option) {
      return format.stripTags(option.html);
    })).join('|')
  );

  return {
    id: String(item.id),
    fingerprint: fingerprint,
    subjectId: subject.id,
    subject: subject.name,
    type: type,
    typeLabel: type === 'choice' ? '选择题' : type === 'multi' ? '多选题' : type === 'judge' ? '判断题' : '填空题',
    stem: stemHtml,
    options: options,
    answer: answer,
    answerKeys: answerKeys,
    answerDisplay: answerDisplay,
    analysis: analysis || '<p class="muted">暂无解析</p>',
    knowledge: knowledge,
    source: source,
    difficulty: Number(item.difficulty) || 0,
    year: item.year || null,
  };
}

function isFatal(error) {
  if (!error) return false;
  const code = error.code || '';
  if (code === 'AUTH' || code === 'QUOTA' || code === 'TIMEOUT' || code === 'NETWORK' || code === 'INIT') return true;
  const text = String(error.message || '');
  return /额度|认证|未授权|unauthorized|api.?key|token|超时|timeout|无法连接/i.test(text);
}

function isRetryable(error) {
  const text = String((error && error.message) || '');
  return /UPSTREAM|HTTP 5\d\d|返回 5\d\d|服务暂时/i.test(text);
}

function friendlyError(error) {
  const raw = String((error && error.message) || '取题失败');
  if (/UPSTREAM_500/.test(raw)) return '题库服务暂时不可用，已跳过这一科';
  try {
    const parsed = JSON.parse(raw);
    const message = parsed && parsed.error && parsed.error.message;
    if (message) return message;
  } catch (e) {
    // 不是 JSON，直接用原文
  }
  return raw;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = [];
  const count = Math.min(limit, items.length);
  for (let i = 0; i < count; i++) workers.push(run());
  await Promise.all(workers);
  return results;
}

function quotaOf(data) {
  if (!data || !data.data) return null;
  return {
    used: data.data.quota_used_today,
    remaining: data.data.quota_remaining_today,
  };
}

function normalizeBatch(source, subject, profile) {
  const items = (source && source.data && source.data.items) || [];
  const questions = [];
  const seenIds = {};
  const seenHashes = {};
  const seenFingerprints = {};
  let skippedFill = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.id != null && seenIds[item.id]) continue;
    if (item.content_hash && seenHashes[item.content_hash]) continue;
    const normalized = normalizeItem(item, subject);
    if (!normalized) continue;
    // 题庄的题型筛选偶尔会漏回填空题；选择题模式下强制过滤
    if (profile.mode === 'objective' && normalized.type !== 'choice' && normalized.type !== 'multi') {
      skippedFill++;
      continue;
    }
    if (normalized.fingerprint && seenFingerprints[normalized.fingerprint]) continue;
    if (item.id != null) seenIds[item.id] = true;
    if (item.content_hash) seenHashes[item.content_hash] = true;
    if (normalized.fingerprint) seenFingerprints[normalized.fingerprint] = true;
    questions.push(normalized);
  }

  return { questions: questions, skippedFill: skippedFill };
}

async function searchSubject(client, subject, grade, profile, warnings) {
  const baseArgs = {
    subject_id: subject.id,
    grade_id: grade.id,
    limit: profile.perSubject,
    random: true,
    include_solutions: true,
    auto_gradable: 'true',
  };

  const hasEdition = !!(profile.editions && profile.editions[subject.id]);
  const knowledgeItems = (profile.knowledge && profile.knowledge[subject.id]) || [];
  const hasKnowledge = knowledgeItems.length > 0;

  if (hasEdition) baseArgs.edition_id = profile.editions[subject.id];
  if (hasKnowledge) {
    baseArgs.knowledge_tree_ids = knowledgeItems.map(function (item) { return item.id; });
    baseArgs.knowledge_scope = 'branch';
  }

  const queryArgs = profile.mode === 'objective'
    ? Object.assign({}, baseArgs, { question_type: '选择题' })
    : Object.assign({}, baseArgs);

  function variant(dropEdition, dropKnowledge) {
    const args = Object.assign({}, queryArgs);
    if (dropEdition) delete args.edition_id;
    if (dropKnowledge) {
      delete args.knowledge_tree_ids;
      delete args.knowledge_scope;
    }
    return args;
  }

  // 优先使用全部筛选；没有结果时逐层放宽，并明确告知用户
  const attempts = [{ args: queryArgs, edition: hasEdition, knowledge: hasKnowledge }];
  if (hasEdition && hasKnowledge) {
    attempts.push({ args: variant(true, false), edition: false, knowledge: true });
    attempts.push({ args: variant(false, true), edition: true, knowledge: false });
  }
  if (hasEdition || hasKnowledge) {
    attempts.push({ args: variant(true, true), edition: false, knowledge: false });
  } else {
    // 没有筛选时，0 题再试一次
    attempts.push({ args: queryArgs, edition: false, knowledge: false });
  }

  async function query(args) {
    try {
      return await client.callTool('search_questions', args);
    } catch (error) {
      // 上游 5xx 偶发失败时重试一次；认证、额度、超时和网络错误不重试
      if (isFatal(error) || !isRetryable(error)) throw error;
      return await client.callTool('search_questions', args);
    }
  }

  let data = null;
  let batch = { questions: [], skippedFill: 0 };
  let chosen = null;
  let lastError = null;
  let lastData = null;
  let lastBatch = null;

  for (let i = 0; i < attempts.length; i++) {
    let source;
    try {
      source = await query(attempts[i].args);
    } catch (error) {
      if (isFatal(error)) throw error;
      lastError = error;
      continue;
    }

    const current = normalizeBatch(source, subject, profile);
    lastData = source;
    lastBatch = current;
    if (current.questions.length) {
      data = source;
      batch = current;
      chosen = attempts[i];
      break;
    }
  }

  if (!data) {
    if (!lastData) {
      throw lastError || new McpError('题庄没有返回可用题目', { code: 'NO_QUESTIONS' });
    }
    data = lastData;
    batch = lastBatch;
    chosen = attempts[attempts.length - 1];
  }

  const questions = batch.questions;
  if (questions.length) {
    if (hasEdition && chosen && !chosen.edition) {
      warnings.push(subject.name + '：所选教材版本暂无可用题目，已改用不限版本');
    }
    if (hasKnowledge && chosen && !chosen.knowledge) {
      warnings.push(subject.name + '：所选知识点暂无可用题目，已改用整科出题');
    }
  }

  if (questions.length < profile.perSubject) {
    if (batch.skippedFill > 0) {
      warnings.push(subject.name + '：选择题不足，返回 ' + questions.length + ' 题（请求 ' + profile.perSubject + ' 题）');
    } else {
      warnings.push(subject.name + '：题库返回 ' + questions.length + ' 题（请求 ' + profile.perSubject + ' 题）');
    }
  }

  return { questions: questions, quota: quotaOf(data) };
}

async function buildPaper(client, inputProfile) {
  const profile = normalizeProfile(inputProfile);
  const stage = findStage(profile.stage);
  const grade = findGrade(stage, profile.grade);
  const subjectList = profile.subjects.map(function (id) { return SUBJECTS[id]; }).filter(Boolean);
  const warnings = [];
  let quota = null;

  const results = await mapLimit(subjectList, 3, async function (subject) {
    try {
      const result = await searchSubject(client, subject, grade, profile, warnings);
      if (result.quota && result.quota.remaining != null) quota = result.quota;
      return result.questions;
    } catch (error) {
      if (isFatal(error)) throw error;
      warnings.push(subject.name + '：' + friendlyError(error));
      return [];
    }
  });

  const questions = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = 0; j < results[i].length; j++) {
      const question = results[i][j];
      delete question.fingerprint;
      questions.push(question);
    }
  }

  if (!questions.length) {
    throw new McpError('题庄没有返回可用题目，请稍后再试或调整学科。', { code: 'NO_QUESTIONS' });
  }

  const hash = configHash(profile);
  return {
    paper: {
      id: 'paper-' + todayKey() + '-' + hash.slice(0, 8),
      date: todayKey(),
      createdAt: Date.now(),
      source: 'tizhuang',
      configHash: hash,
      profile: profile,
      questions: questions,
      warnings: warnings,
    },
    quota: quota,
    warnings: warnings,
  };
}

export {
  SUBJECTS,
  STAGES,
  PHASES,
  findStage,
  findGrade,
  listEditions,
  searchKnowledge,
  todayKey,
  normalizeProfile,
  configHash,
  buildPaper,
  normalizeJudge,
};
