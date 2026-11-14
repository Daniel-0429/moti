(function () {
  'use strict';

  var STORE = {
    profile: 'ink.profile.v1',
    paper: 'ink.paper.v1',
    history: 'ink.history.v1'
  };

  var STAGES = {
    primary: {
      name: '小学',
      grades: [
        { id: 110, name: '一年级' },
        { id: 120, name: '二年级' },
        { id: 130, name: '三年级' },
        { id: 140, name: '四年级' },
        { id: 150, name: '五年级' },
        { id: 160, name: '六年级' }
      ],
      subjects: [1, 2, 3, 10, 11]
    },
    junior: {
      name: '初中',
      grades: [
        { id: 200, name: '七年级' },
        { id: 300, name: '八年级' },
        { id: 400, name: '九年级' }
      ],
      subjects: [1, 2, 3, 8, 9, 7, 4, 5, 11]
    },
    senior: {
      name: '高中',
      grades: [
        { id: 500, name: '高一' },
        { id: 600, name: '高二' },
        { id: 700, name: '高三' }
      ],
      subjects: [1, 2, 3, 8, 9, 7, 4, 5, 6]
    }
  };

  var STAGE_ORDER = ['primary', 'junior', 'senior'];
  var SUBJECT_NAMES = {
    1: '语文',
    2: '数学',
    3: '英语',
    4: '历史',
    5: '地理',
    6: '政治',
    7: '生物',
    8: '物理',
    9: '化学',
    10: '科学',
    11: '道德与法治',
    12: '历史与社会',
    14: '信息技术',
    15: '通用技术'
  };
  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  var state = {
    profile: null,
    paper: null,
    history: [],
    status: null,
    view: 'home',
    setupMode: 'first',
    setup: null,
    filter: 'all',
    fetching: false,
    fetchError: null,
    lastQuota: null,
    demoMode: false,
    editions: null,
    editionsKey: '',
    editionsLoadingKey: '',
    editionsError: null,
    editionsErrorKey: '',
    kp: null
  };

  var modalCallback = null;
  var toastTimer = null;
  var saveTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function hasClass(element, name) {
    return (' ' + element.className + ' ').indexOf(' ' + name + ' ') !== -1;
  }

  function addClass(element, name) {
    if (!element || hasClass(element, name)) return;
    element.className = (element.className ? element.className + ' ' : '') + name;
  }

  function removeClass(element, name) {
    if (!element) return;
    element.className = (' ' + element.className + ' ')
      .replace(' ' + name + ' ', ' ')
      .replace(/^\s+|\s+$/g, '');
  }

  function setClass(element, name, on) {
    if (on) addClass(element, name);
    else removeClass(element, name);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var Store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {}
    }
  };

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function dateText(d) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function weekdayText(d) {
    return '星期' + WEEKDAYS[d.getDay()];
  }

  function profileKey(profile) {
    var subjects = profile.subjects.slice().sort(function (a, b) { return a - b; });
    var editionParts = [];
    var editions = profile.editions || {};
    var knowledgeParts = [];
    var knowledge = profile.knowledge || {};
    for (var i = 0; i < subjects.length; i++) {
      var id = subjects[i];
      if (editions[id]) editionParts.push(id + ':' + editions[id]);
      var list = knowledge[id] || [];
      if (list.length) {
        var ids = [];
        for (var j = 0; j < list.length; j++) ids.push(list[j].id);
        ids.sort(function (a, b) { return a - b; });
        knowledgeParts.push(id + ':' + ids.join('+'));
      }
    }
    return [
      profile.stage,
      profile.grade,
      subjects.join('-'),
      profile.perSubject,
      profile.mode,
      editionParts.join(','),
      knowledgeParts.join(',')
    ].join('|');
  }

  function defaultProfile() {
    return {
      stage: 'junior',
      grade: 200,
      subjects: [1, 2, 3],
      perSubject: 2,
      mode: 'objective',
      editions: {},
      editionNames: {},
      knowledge: {}
    };
  }

  function cloneProfile(profile) {
    return {
      stage: profile.stage,
      grade: profile.grade,
      subjects: profile.subjects.slice(),
      perSubject: profile.perSubject,
      mode: profile.mode || 'objective',
      editions: copyMap(profile.editions),
      editionNames: copyMap(profile.editionNames),
      knowledge: copyKnowledge(profile.knowledge)
    };
  }

  function copyMap(source) {
    var out = {};
    if (!source) return out;
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
    }
    return out;
  }

  function copyKnowledge(source) {
    var out = {};
    if (!source) return out;
    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      var list = source[key] || [];
      var items = [];
      for (var i = 0; i < list.length; i++) {
        items.push({ id: list[i].id, name: list[i].name });
      }
      if (items.length) out[key] = items;
    }
    return out;
  }

  function normalizeProfile(input) {
    if (!input) return null;
    var stage = STAGES[input.stage];
    if (!stage) return null;

    var grade = null;
    for (var i = 0; i < stage.grades.length; i++) {
      if (stage.grades[i].id === Number(input.grade)) {
        grade = stage.grades[i];
        break;
      }
    }
    if (!grade) return null;

    var subjects = [];
    var raw = input.subjects || [];
    for (var j = 0; j < raw.length; j++) {
      var id = Number(raw[j]);
      if (stage.subjects.indexOf(id) !== -1 && subjects.indexOf(id) === -1) subjects.push(id);
    }
    if (!subjects.length) return null;

    var editions = {};
    var editionNames = {};
    var rawEditions = input.editions || {};
    var rawNames = input.editionNames || {};
    for (var k = 0; k < subjects.length; k++) {
      var subjectId = subjects[k];
      var edition = Number(rawEditions[subjectId]);
      if (edition > 0) {
        editions[subjectId] = edition;
        if (rawNames[subjectId]) editionNames[subjectId] = String(rawNames[subjectId]).slice(0, 60);
      }
    }

    var knowledge = {};
    var rawKnowledge = input.knowledge || {};
    for (var m = 0; m < subjects.length; m++) {
      var kpSubject = subjects[m];
      var kpList = rawKnowledge[kpSubject];
      if (!kpList || !kpList.length) continue;
      var kpItems = [];
      var kpSeen = {};
      for (var n = 0; n < kpList.length && kpItems.length < 10; n++) {
        var node = kpList[n] || {};
        var nodeId = Number(node.id);
        var nodeName = node.name ? String(node.name).slice(0, 80) : '';
        if (!(nodeId > 0) || !nodeName || kpSeen[nodeId]) continue;
        kpSeen[nodeId] = true;
        kpItems.push({ id: nodeId, name: nodeName });
      }
      if (kpItems.length) knowledge[kpSubject] = kpItems;
    }

    return {
      stage: input.stage,
      grade: grade.id,
      subjects: subjects,
      perSubject: Math.max(1, Math.min(10, Number(input.perSubject) || 2)),
      mode: input.mode === 'mixed' ? 'mixed' : 'objective',
      editions: editions,
      editionNames: editionNames,
      knowledge: knowledge
    };
  }

  function stageOf(profile) {
    return STAGES[profile.stage];
  }

  function gradeOf(profile) {
    var stage = stageOf(profile);
    for (var i = 0; i < stage.grades.length; i++) {
      if (stage.grades[i].id === Number(profile.grade)) return stage.grades[i];
    }
    return { id: profile.grade, name: '未知年级' };
  }

  function subjectNames(profile) {
    var names = [];
    for (var i = 0; i < profile.subjects.length; i++) {
      names.push(SUBJECT_NAMES[profile.subjects[i]] || ('学科' + profile.subjects[i]));
    }
    return names.join(' / ');
  }

  function editionText(profile) {
    var editions = profile.editions || {};
    var names = profile.editionNames || {};
    var parts = [];
    for (var i = 0; i < profile.subjects.length; i++) {
      var id = profile.subjects[i];
      var name = names[id];
      if (!editions[id] || !name) continue;
      parts.push((SUBJECT_NAMES[id] || ('学科' + id)) + '（' + name + '）');
    }
    return parts.join(' / ');
  }

  function knowledgeText(profile) {
    var map = profile.knowledge || {};
    var parts = [];
    for (var i = 0; i < profile.subjects.length; i++) {
      var id = profile.subjects[i];
      var list = map[id] || [];
      if (!list.length) continue;
      var names = [];
      for (var j = 0; j < list.length; j++) names.push(list[j].name);
      parts.push((SUBJECT_NAMES[id] || ('学科' + id)) + '（' + names.join('、') + '）');
    }
    return parts.join(' / ');
  }

  function editionList(subjectId) {
    var map = state.editions || {};
    var list = map[subjectId];
    return list && list.length ? list : [];
  }

  function editionNameOf(subjectId, editionId) {
    var list = editionList(subjectId);
    for (var i = 0; i < list.length; i++) {
      if (Number(list[i].id) === Number(editionId)) return list[i].name;
    }
    return '';
  }

  function totalQuestions(profile) {
    return profile.subjects.length * profile.perSubject;
  }

  function loadPaper() {
    var paper = Store.get(STORE.paper, null);
    if (!paper || !paper.profile || !paper.questions || !paper.questions.length) return null;
    if (paper.date !== todayKey()) return null;

    var normalized = normalizeProfile(paper.profile);
    if (!normalized || profileKey(normalized) !== profileKey(state.profile)) {
      Store.remove(STORE.paper);
      return null;
    }

    paper.profile = normalized;
    if (!paper.answers) paper.answers = {};
    if (paper.cursor == null) paper.cursor = 0;
    return paper;
  }

  function savePaper() {
    if (state.paper) Store.set(STORE.paper, state.paper);
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      savePaper();
    }, 400);
  }

  function request(method, url, body, callback) {
    var xhr = new XMLHttpRequest();
    var done = false;

    function finish(error, data, status) {
      if (done) return;
      done = true;
      callback(error, data, status);
    }

    try {
      xhr.open(method, url, true);
    } catch (e) {
      return finish({ code: 'NETWORK', message: '无法连接本地服务。' });
    }

    if (body) {
      try {
        xhr.setRequestHeader('Content-Type', 'application/json');
      } catch (e) {}
    }

    try {
      xhr.timeout = 150000;
      xhr.ontimeout = function () {
        finish({ code: 'TIMEOUT', message: '取题超时，请重试。' });
      };
    } catch (e) {}

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      var data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch (e) {}

      if (xhr.status >= 200 && xhr.status < 300) {
        return finish(null, data, xhr.status);
      }

      if (!xhr.status) {
        return finish({
          code: 'NETWORK',
          message: '无法连接本地服务，请确认 node server.js 正在运行。'
        });
      }

      var error = data || { code: 'HTTP', message: '服务返回 ' + xhr.status };
      if (!error.message) error.message = '服务返回 ' + xhr.status;
      finish(error, data, xhr.status);
    };

    try {
      xhr.send(body ? JSON.stringify(body) : null);
    } catch (e) {
      finish({ code: 'NETWORK', message: '发送请求失败。' });
    }
  }

  function toast(message) {
    var element = $('toast');
    if (!element) return;
    element.textContent = message;
    removeClass(element, 'is-hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      addClass(element, 'is-hidden');
    }, 3200);
  }

  function showModal(title, body, okText, callback) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = body;
    $('modal-ok').textContent = okText || '确定';
    modalCallback = callback || null;
    removeClass($('modal'), 'is-hidden');
  }

  function hideModal() {
    addClass($('modal'), 'is-hidden');
    modalCallback = null;
  }

  function setView(name) {
    var views = ['home', 'setup', 'quiz', 'result'];
    for (var i = 0; i < views.length; i++) {
      setClass($('view-' + views[i]), 'is-on', views[i] === name);
    }
    state.view = name;

    var nav = $('nav');
    var hideNav = !state.profile ||
      (name === 'setup' && state.setupMode === 'first') ||
      name === 'quiz' ||
      name === 'result';
    setClass(nav, 'is-hidden', hideNav);

    var homeButton = $('nav').getElementsByTagName('button')[0];
    var settingsButton = $('nav').getElementsByTagName('button')[1];
    setClass(homeButton, 'is-on', name === 'home');
    setClass(settingsButton, 'is-on', name === 'setup' && state.setupMode !== 'first');
  }

  function render() {
    if (state.view === 'home') renderHome();
    else if (state.view === 'setup') renderSetup();
    else if (state.view === 'quiz') renderQuiz();
    else if (state.view === 'result') renderResult();
    setView(state.view);
  }

  function scrollTop() {
    try {
      window.scrollTo(0, 0);
    } catch (e) {}
  }

  /* ---------------- 首页 ---------------- */

  function streakCount() {
    var dates = {};
    for (var i = 0; i < state.history.length; i++) {
      if (state.history[i] && state.history[i].date) dates[state.history[i].date] = true;
    }

    var d = new Date();
    if (!dates[todayKey()]) d.setDate(d.getDate() - 1);

    var count = 0;
    while (dates[todayKeyFromDate(d)]) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }

  function todayKeyFromDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function sourceLabel(paper) {
    return paper && paper.source === 'demo' ? '演示题目' : '题庄题库';
  }

  function quotaText() {
    var quota = state.lastQuota || (state.status && state.status.quota) || (state.status && state.status.lastQuota);
    if (!quota) return '—';
    if (quota.remaining == null) return '—';
    return '今日剩余额度 ' + quota.remaining + ' 题';
  }

  function renderHome() {
    var profile = state.profile;
    if (!profile) {
      setView('setup');
      renderSetup();
      return;
    }

    $('home-date').textContent = dateText(new Date()) + ' ' + weekdayText(new Date());

    var streak = streakCount();
    $('home-streak').textContent = streak > 0 ? '连续 ' + streak + ' 天' : '';

    var hero = $('home-hero');
    var paper = state.paper;

    if (state.fetching) {
      hero.innerHTML =
        '<h2>正在从题庄取题…</h2>' +
        '<p class="sub">按你的设置，每科 ' + profile.perSubject + ' 题。第一次取题需要几秒钟。</p>' +
        '<button type="button" class="btn btn-primary is-disabled" disabled>请稍候</button>';
    } else if (state.fetchError) {
      var extra = '';
      if (state.fetchError.code === 'NO_KEY') {
        extra = '<p class="sub">Key 只放在服务器的 .env.local 里，不会进入浏览器。</p>';
      }
      hero.innerHTML =
        '<h2>今日题目没有取到</h2>' +
        '<p>' + escapeHtml(state.fetchError.message || '未知错误') + '</p>' +
        extra +
        '<div class="actions">' +
        '<button type="button" class="btn btn-primary" data-action="home-retry">重试</button>' +
        '<button type="button" class="btn" data-action="home-demo">用演示题目预览</button>' +
        '</div>';
    } else if (!paper) {
      var total = totalQuestions(profile);
      var minutes = Math.max(5, Math.round(total * 1.2));
      hero.innerHTML =
        '<h2>今日题目</h2>' +
        '<p class="sub">按你的设置从题庄取题。先作答，交卷后统一判分并显示解析。</p>' +
        '<p><strong>共 ' + total + ' 题</strong> · 预计 ' + minutes + ' 分钟</p>' +
        '<div class="actions">' +
        '<button type="button" class="btn btn-primary" data-action="home-start">获取今日题目</button>' +
        '</div>';
    } else if (!paper.submitted) {
      var answered = countAnswered(paper);
      var totalCount = paper.questions.length;
      var percent = totalCount ? Math.round(answered / totalCount * 100) : 0;
      var started = answered > 0;
      hero.innerHTML =
        '<h2>' + (started ? '今日进行中' : '今日题目已就绪') + '</h2>' +
        '<p class="sub">' + (started ? '已完成 ' + answered + ' / ' + totalCount + ' 题 · ' : '共 ' + totalCount + ' 题 · ') + sourceLabel(paper) + '</p>' +
        '<div class="progress"><span style="width:' + percent + '%"></span></div>' +
        '<div class="actions">' +
        '<button type="button" class="btn btn-primary" data-action="home-continue">' + (started ? '继续答题' : '开始答题') + '</button>' +
        '</div>';
    } else {
      var result = evaluate(paper);
      var rate = result.total ? Math.round(result.correct / result.total * 100) : 0;
      hero.innerHTML =
        '<h2>今日已完成</h2>' +
        '<div class="big">' + result.correct + '<small> / ' + result.total + '</small></div>' +
        '<p class="sub">正确率 ' + rate + '% · 用时 ' + durationText(paper.durationSec) + ' · ' + sourceLabel(paper) + '</p>' +
        '<div class="actions">' +
        '<button type="button" class="btn btn-primary" data-action="home-result">查看解析</button>' +
        '</div>';
    }

    var config = $('home-config');
    var requested = totalQuestions(profile);
    var actual = paper ? paper.questions.length : requested;
    var countText = '每科 ' + profile.perSubject + ' 题，共 ' + requested + ' 题';
    if (paper && actual !== requested) countText += '（实际 ' + actual + ' 题）';
    var editionInfo = editionText(profile);
    var knowledgeInfo = knowledgeText(profile);

    config.innerHTML =
      '<h2>学习档案</h2>' +
      '<div class="kv">' +
      '<div><span class="k">学段年级</span><span class="v">' + escapeHtml(STAGES[profile.stage].name) + ' · ' + escapeHtml(gradeOf(profile).name) + '</span></div>' +
      '<div><span class="k">学科</span><span class="v">' + escapeHtml(subjectNames(profile)) + '</span></div>' +
      '<div><span class="k">教材</span><span class="v">' + escapeHtml(editionInfo || '不限版本') + '</span></div>' +
      '<div><span class="k">知识点</span><span class="v">' + escapeHtml(knowledgeInfo || '不限') + '</span></div>' +
      '<div><span class="k">题量</span><span class="v">' + escapeHtml(countText) + '</span></div>' +
      '<div><span class="k">题型</span><span class="v">' + (profile.mode === 'mixed' ? '混合题型' : '选择题') + '</span></div>' +
      '<div><span class="k">题源</span><span class="v">' + escapeHtml(paper ? sourceLabel(paper) : '尚未取题') + '</span></div>' +
      '<div><span class="k">额度</span><span class="v">' + escapeHtml(quotaText()) + '</span></div>' +
      '</div>' +
      '<div class="actions"><button type="button" class="btn btn-small" data-action="nav" data-nav="settings">调整设置</button></div>';

    renderRecent();
    renderNotice();
  }

  function renderRecent() {
    var panel = $('home-recent');
    if (!state.history.length) {
      panel.innerHTML = '<h2>最近完成</h2><p class="muted">还没有完成记录。今天做完第一套题后会出现在这里。</p>';
      return;
    }

    var rows = '';
    var count = Math.min(6, state.history.length);
    for (var i = 0; i < count; i++) {
      var item = state.history[i];
      var rate = item.total ? Math.round(item.correct / item.total * 100) : 0;
      rows += '<tr>' +
        '<td>' + escapeHtml(item.date) + '</td>' +
        '<td class="num">' + item.correct + ' / ' + item.total + '</td>' +
        '<td class="num">' + rate + '%</td>' +
        '</tr>';
    }

    panel.innerHTML =
      '<h2>最近完成</h2>' +
      '<table class="table"><tr><th>日期</th><th class="num">得分</th><th class="num">正确率</th></tr>' +
      rows +
      '</table>';
  }

  function renderNotice() {
    var notice = $('home-notice');
    var lines = [];

    if (state.status && !state.status.keyConfigured && !state.demoMode) {
      lines.push('题庄 Key 未配置。请在服务器的 .env.local 中填写 TIZHUANG_API_KEY，然后重启服务。');
    }
    if (state.paper && state.paper.source === 'demo') {
      lines.push('当前显示的是演示题目，不是题庄真实题库。配置 Key 后会自动使用真实题目。');
    }
    if (state.paper && state.paper.warnings && state.paper.warnings.length) {
      for (var i = 0; i < state.paper.warnings.length; i++) {
        if (state.paper.source !== 'demo') lines.push(state.paper.warnings[i]);
      }
    }

    if (!lines.length) {
      notice.innerHTML = '';
      return;
    }

    var html = '';
    for (var j = 0; j < lines.length; j++) html += '<p>' + escapeHtml(lines[j]) + '</p>';
    if (state.demoMode || (state.paper && state.paper.source === 'demo')) {
      html += '<p><button type="button" class="btn btn-small" data-action="exit-demo">改用真实题库</button></p>';
    }
    notice.innerHTML = html;
  }

  /* ---------------- 取题 ---------------- */

  function fetchPaper(force, demo) {
    if (!state.profile || state.fetching) return;

    var token = (state.fetchToken || 0) + 1;
    state.fetchToken = token;
    state.fetching = true;
    state.fetchError = null;
    state.paper = null;
    Store.remove(STORE.paper);
    renderHome();

    var body = {
      stage: state.profile.stage,
      grade: state.profile.grade,
      subjects: state.profile.subjects,
      perSubject: state.profile.perSubject,
      mode: state.profile.mode,
      editions: state.profile.editions || {},
      editionNames: state.profile.editionNames || {},
      knowledge: state.profile.knowledge || {},
      demo: !!(demo || state.demoMode),
      force: !!force
    };

    request('POST', '/api/paper', body, function (error, data) {
      if (token !== state.fetchToken) return;
      state.fetching = false;

      if (error) {
        state.fetchError = error;
        renderHome();
        return;
      }

      if (!data || !data.paper || !data.paper.questions || !data.paper.questions.length) {
        state.fetchError = { code: 'BAD_RESPONSE', message: '服务没有返回题目，请稍后再试。' };
        renderHome();
        return;
      }

      var paper = data.paper;
      paper.answers = {};
      paper.submitted = false;
      paper.submittedAt = null;
      paper.startedAt = null;
      paper.cursor = 0;
      paper.warnings = data.warnings || paper.warnings || [];

      state.paper = paper;
      if (!data.cached) state.lastQuota = data.quota || state.lastQuota;
      savePaper();

      if (paper.source === 'demo') toast('已载入演示题目');
      renderHome();
    });
  }

  /* ---------------- 设置 ---------------- */

  function openSetup(mode) {
    state.setupMode = mode || (state.profile ? 'edit' : 'first');
    state.setup = state.profile ? cloneProfile(state.profile) : defaultProfile();
    state.view = 'setup';
    render();
    scrollTop();
  }

  function renderSetup() {
    var draft = state.setup || defaultProfile();
    var stage = STAGES[draft.stage];

    $('setup-title').textContent = state.setupMode === 'first' ? '设置学习档案' : '调整学习设置';

    var stageHtml = '';
    for (var i = 0; i < STAGE_ORDER.length; i++) {
      var key = STAGE_ORDER[i];
      stageHtml += '<button type="button" class="seg-btn' + (draft.stage === key ? ' is-on' : '') + '" data-action="setup-stage" data-stage="' + key + '">' + STAGES[key].name + '</button>';
    }
    $('setup-stage').innerHTML = stageHtml;

    var gradeHtml = '';
    for (var j = 0; j < stage.grades.length; j++) {
      var grade = stage.grades[j];
      gradeHtml += '<button type="button" class="seg-btn' + (Number(draft.grade) === grade.id ? ' is-on' : '') + '" data-action="setup-grade" data-grade="' + grade.id + '">' + grade.name + '</button>';
    }
    $('setup-grade').innerHTML = gradeHtml;

    var subjectHtml = '';
    for (var k = 0; k < stage.subjects.length; k++) {
      var id = stage.subjects[k];
      var checked = draft.subjects.indexOf(id) !== -1;
      subjectHtml += '<label class="check-item' + (checked ? ' is-on' : '') + '">' +
        '<input type="checkbox" data-role="subject" value="' + id + '"' + (checked ? ' checked' : '') + '>' +
        '<span>' + escapeHtml(SUBJECT_NAMES[id] || ('学科' + id)) + '</span>' +
        '</label>';
    }
    $('setup-subjects').innerHTML = subjectHtml;

    renderEditions(draft);
    renderKnowledge(draft);

    var countHtml = '';
    for (var n = 1; n <= 10; n++) {
      countHtml += '<button type="button" class="seg-btn' + (Number(draft.perSubject) === n ? ' is-on' : '') + '" data-action="setup-count" data-count="' + n + '">' + n + ' 题</button>';
    }
    $('setup-count').innerHTML = countHtml;

    var modeHtml =
      '<button type="button" class="seg-btn' + (draft.mode !== 'mixed' ? ' is-on' : '') + '" data-action="setup-mode" data-mode="objective">选择题</button>' +
      '<button type="button" class="seg-btn' + (draft.mode === 'mixed' ? ' is-on' : '') + '" data-action="setup-mode" data-mode="mixed">混合题型</button>';
    $('setup-mode').innerHTML = modeHtml;

    $('setup-mode-hint').textContent = draft.mode === 'mixed'
      ? '混合题型可能包含填空题，电纸书打字较慢时建议用选择题。'
      : '只取选择题，全部用按钮作答，最适合电纸书。';

    $('setup-save').textContent = state.setupMode === 'first' ? '保存并开始' : '保存设置';
    setClass($('setup-cancel'), 'is-hidden', state.setupMode === 'first');

    var fine = '';
    if (state.status && state.status.keyConfigured) {
      fine += '<p>题庄连接：已配置 Key。每科题量 × 学科数会消耗题庄当日额度。</p>';
    } else if (state.status) {
      fine += '<p>题庄连接：未配置。请在服务器的 .env.local 中填写 TIZHUANG_API_KEY，然后重启服务。</p>';
    } else {
      fine += '<p>正在检查题庄连接…</p>';
    }
    fine += '<p>同一天、同一套设置会优先使用本地缓存，不会重复消耗额度。</p>';
    if (state.setupMode !== 'first') {
      fine += '<p><button type="button" class="btn btn-small" data-action="clear-data">清空本地数据</button></p>';
    }
    $('setup-fineprint').innerHTML = fine;
  }

  function renderEditions(draft) {
    var box = $('setup-editions');
    if (!box) return;
    var hint = $('setup-editions-hint');
    var key = draft.stage + '|' + draft.grade;
    var loaded = state.editionsKey === key && !!state.editions;
    var loadingKey = state.editionsLoadingKey === key;

    var html = '';
    for (var i = 0; i < draft.subjects.length; i++) {
      var id = draft.subjects[i];
      var name = SUBJECT_NAMES[id] || ('学科' + id);
      var current = Number((draft.editions || {})[id] || 0);
      var list = loaded ? editionList(id) : [];

      html += '<div class="edition-row"><span class="edition-subject">' + escapeHtml(name) + '</span>';
      if (state.demoMode) {
        html += '<span class="edition-empty">—</span>';
      } else if (!loaded) {
        html += '<span class="edition-empty">' + (loadingKey ? '正在加载版本…' : '等待加载版本…') + '</span>';
      } else if (!list.length) {
        html += '<span class="edition-empty">该年级暂无版本数据，按不限版本出题</span>';
      } else {
        html += '<select data-role="edition" data-subject="' + id + '">';
        html += '<option value="0"' + (current ? '' : ' selected') + '>不限版本</option>';
        var found = false;
        for (var j = 0; j < list.length; j++) {
          var isCurrent = Number(list[j].id) === current;
          if (isCurrent) found = true;
          html += '<option value="' + list[j].id + '"' + (isCurrent ? ' selected' : '') + '>' +
            escapeHtml(list[j].name) + '</option>';
        }
        if (current && !found) {
          html += '<option value="' + current + '" selected>已选版本（不在当前列表）</option>';
        }
        html += '</select>';
      }
      html += '</div>';
    }

    box.innerHTML = html;

    if (state.demoMode) {
      hint.textContent = '演示模式不区分教材版本。';
    } else if (state.editionsError) {
      hint.innerHTML = escapeHtml(state.editionsError) +
        ' <button type="button" class="btn btn-small" data-action="editions-retry">重试</button>';
    } else if (loaded) {
      hint.textContent = '教材版本随年级变化；不确定时选“不限版本”。';
    } else {
      hint.textContent = '正在从题庄读取各学科教材版本，只需加载一次。';
    }

    if (!loaded && !state.demoMode && !loadingKey && state.editionsErrorKey !== key) {
      loadEditions(draft.stage, draft.grade);
    }
  }

  function loadEditions(stageKey, gradeId) {
    var key = stageKey + '|' + gradeId;
    if (state.editionsKey === key || state.editionsLoadingKey === key) return;
    state.editionsLoadingKey = key;
    state.editionsError = null;

    request(
      'GET',
      '/api/editions?stage=' + encodeURIComponent(stageKey) + '&grade=' + encodeURIComponent(gradeId),
      null,
      function (error, data) {
        if (state.editionsLoadingKey === key) state.editionsLoadingKey = '';
        if (error) {
          state.editionsError = '教材版本加载失败：' + (error.message || '请稍后重试');
          state.editionsErrorKey = key;
        } else {
          state.editions = (data && data.editions) || {};
          state.editionsKey = key;
          state.editionsError = null;
          state.editionsErrorKey = '';
        }
        if (state.view === 'setup') renderSetup();
      }
    );
  }

  function renderKnowledge(draft) {
    var box = $('setup-knowledge');
    if (!box) return;
    var map = draft.knowledge || {};
    var html = '';
    for (var i = 0; i < draft.subjects.length; i++) {
      var id = draft.subjects[i];
      var list = map[id] || [];
      var summary = '未选择（整科出题）';
      if (list.length) {
        var names = [];
        for (var j = 0; j < list.length; j++) names.push(list[j].name);
        summary = names.join('、');
      }
      html += '<div class="kp-row">' +
        '<span class="kp-subject">' + escapeHtml(SUBJECT_NAMES[id] || ('学科' + id)) + '</span>' +
        '<span class="kp-summary' + (list.length ? '' : ' is-empty') + '">' + escapeHtml(summary) + '</span>' +
        '<button type="button" class="btn btn-small" data-action="kp-open" data-subject="' + id + '">选择</button>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  function openKnowledgePicker(subjectId) {
    if (!state.setup) return;
    var id = Number(subjectId);
    var existing = (state.setup.knowledge || {})[id] || [];
    var selected = [];
    for (var i = 0; i < existing.length; i++) {
      selected.push({ id: existing[i].id, name: existing[i].name });
    }

    state.kp = {
      subjectId: id,
      subjectName: SUBJECT_NAMES[id] || ('学科' + id),
      keyword: '',
      items: [],
      selected: selected,
      loading: false,
      error: null,
      searched: false
    };

    showModal('选择' + state.kp.subjectName + '知识点', renderKpBody(), '确定', function () {
      applyKnowledge();
    });
    loadKnowledge('');
  }

  function isKpSelected(id) {
    var kp = state.kp;
    if (!kp) return false;
    for (var i = 0; i < kp.selected.length; i++) {
      if (kp.selected[i].id === id) return true;
    }
    return false;
  }

  function renderKpBody() {
    var kp = state.kp;
    if (!kp) return '';

    var html = '<div class="kp-picker">';
    html += '<div class="kp-searchbar">' +
      '<input type="text" id="kp-keyword" data-role="kp-keyword" value="' + escapeHtml(kp.keyword) + '" placeholder="输入知识点，如 一元一次方程">' +
      '<button type="button" class="btn btn-small" data-action="kp-search">搜索</button>' +
      '</div>';
    html += '<p class="hint">选择后包含该知识点的子知识点，每科最多 10 个。</p>';

    if (kp.loading) {
      html += '<p class="muted">正在读取知识点…</p>';
    } else if (kp.error) {
      html += '<p class="kp-error">' + escapeHtml(kp.error) + '</p>';
    } else if (kp.searched && !kp.items.length) {
      html += '<p class="muted">没有找到匹配的知识点，换个关键词试试。</p>';
    } else if (kp.items.length) {
      html += '<div class="kp-results">';
      for (var i = 0; i < kp.items.length; i++) {
        var node = kp.items[i];
        var on = isKpSelected(node.id);
        html += '<button type="button" class="kp-item' + (on ? ' is-on' : '') + '" data-action="kp-toggle" data-id="' + node.id + '">' +
          '<span class="kp-mark">' + (on ? '✓' : '·') + '</span>' +
          '<span class="kp-name">' + escapeHtml(node.name) + '</span>' +
          '</button>';
      }
      html += '</div>';
    }

    if (kp.selected.length) {
      html += '<div class="kp-selected"><span class="kp-selected-label">已选</span>';
      for (var j = 0; j < kp.selected.length; j++) {
        html += '<span class="kp-chip">' + escapeHtml(kp.selected[j].name) +
          ' <button type="button" data-action="kp-remove" data-id="' + kp.selected[j].id + '">×</button></span>';
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderKpModal() {
    if (!state.kp) return;
    if (hasClass($('modal'), 'is-hidden')) return;
    $('modal-body').innerHTML = renderKpBody();
  }

  function loadKnowledge(keyword) {
    var kp = state.kp;
    if (!kp || !state.setup) return;

    kp.keyword = keyword || '';
    kp.loading = true;
    kp.error = null;
    kp.searched = true;
    renderKpModal();

    var stage = state.setup.stage;
    var subjectId = kp.subjectId;
    request(
      'GET',
      '/api/knowledge?stage=' + encodeURIComponent(stage) +
        '&subject=' + encodeURIComponent(subjectId) +
        '&keyword=' + encodeURIComponent(kp.keyword),
      null,
      function (error, data) {
        if (state.kp !== kp) return;
        kp.loading = false;
        if (error) {
          kp.error = error.message || '知识点加载失败，请稍后重试';
          kp.items = [];
        } else {
          kp.items = (data && data.items) || [];
        }
        renderKpModal();
      }
    );
  }

  function onKpToggle(id) {
    var kp = state.kp;
    if (!kp) return;

    var node = null;
    for (var i = 0; i < kp.items.length; i++) {
      if (kp.items[i].id === id) {
        node = kp.items[i];
        break;
      }
    }
    if (!node) return;

    for (var j = 0; j < kp.selected.length; j++) {
      if (kp.selected[j].id === id) {
        kp.selected.splice(j, 1);
        renderKpModal();
        return;
      }
    }

    if (kp.selected.length >= 10) {
      toast('每科最多选择 10 个知识点');
      return;
    }
    kp.selected.push({ id: node.id, name: node.name });
    renderKpModal();
  }

  function onKpRemove(id) {
    var kp = state.kp;
    if (!kp) return;
    for (var i = 0; i < kp.selected.length; i++) {
      if (kp.selected[i].id === id) {
        kp.selected.splice(i, 1);
        break;
      }
    }
    renderKpModal();
  }

  function applyKnowledge() {
    var kp = state.kp;
    if (!kp || !state.setup) return;
    if (!state.setup.knowledge) state.setup.knowledge = {};

    if (kp.selected.length) {
      var items = [];
      for (var i = 0; i < kp.selected.length; i++) {
        items.push({ id: kp.selected[i].id, name: kp.selected[i].name });
      }
      state.setup.knowledge[kp.subjectId] = items;
    } else {
      delete state.setup.knowledge[kp.subjectId];
    }

    state.kp = null;
    renderKnowledge(state.setup);
  }

  function onSetupStage(key) {
    if (!STAGES[key]) return;
    state.setup.stage = key;
    state.setup.grade = STAGES[key].grades[0].id;
    state.setup.subjects = [1, 2, 3];
    state.setup.editions = {};
    state.setup.editionNames = {};
    renderSetup();
  }

  function onSetupGrade(id) {
    state.setup.grade = Number(id);
    state.setup.editions = {};
    state.setup.editionNames = {};
    renderSetup();
  }

  function onEditionChange(select) {
    var subjectId = Number(select.getAttribute('data-subject'));
    var editionId = Number(select.value) || 0;
    if (!state.setup.editions) state.setup.editions = {};
    if (!state.setup.editionNames) state.setup.editionNames = {};
    if (editionId > 0) {
      state.setup.editions[subjectId] = editionId;
      state.setup.editionNames[subjectId] = editionNameOf(subjectId, editionId);
    } else {
      delete state.setup.editions[subjectId];
      delete state.setup.editionNames[subjectId];
    }
  }

  function onSetupCount(count) {
    state.setup.perSubject = Number(count);
    renderSetup();
  }

  function onSetupMode(mode) {
    state.setup.mode = mode === 'mixed' ? 'mixed' : 'objective';
    renderSetup();
  }

  function onSubjectChange(input) {
    var id = Number(input.value);
    var index = state.setup.subjects.indexOf(id);
    if (input.checked && index === -1) state.setup.subjects.push(id);
    if (!input.checked && index !== -1) state.setup.subjects.splice(index, 1);

    var label = input.parentNode;
    setClass(label, 'is-on', input.checked);
    renderEditions(state.setup);
  }

  function onSetupSave() {
    if (!state.setup) return;
    if (!state.setup.subjects.length) {
      toast('至少选择一个学科');
      return;
    }

    var profile = normalizeProfile(state.setup);
    if (!profile) {
      toast('设置不完整，请检查学段、年级和学科');
      return;
    }

    var old = state.profile;
    var changed = !old || profileKey(old) !== profileKey(profile);

    if (!changed) {
      state.profile = profile;
      Store.set(STORE.profile, profile);
      state.view = 'home';
      render();
      scrollTop();
      if (!state.paper) fetchPaper(false);
      return;
    }

    if (old && state.paper && !state.paper.submitted) {
      showModal(
        '重新获取今日题目？',
        '修改设置后，当前未交卷的作答会被清空，并重新从题庄取题。',
        '保存并重取',
        function () { applyProfile(profile); }
      );
      return;
    }

    if (old && state.paper && state.paper.submitted) {
      showModal(
        '修改今日设置？',
        '修改后会重新获取今日题目；已完成的成绩仍保留在历史记录中。',
        '保存并重取',
        function () { applyProfile(profile); }
      );
      return;
    }

    applyProfile(profile);
  }

  function applyProfile(profile) {
    state.profile = profile;
    state.setup = cloneProfile(profile);
    Store.set(STORE.profile, profile);
    state.paper = null;
    Store.remove(STORE.paper);
    state.fetchError = null;
    state.fetchToken = (state.fetchToken || 0) + 1;
    state.fetching = false;
    state.view = 'home';
    render();
    scrollTop();
    fetchPaper(false);
  }

  function onClearData() {
    showModal(
      '清空本地数据？',
      '学习档案、今日作答和历史记录都会删除。题庄 Key 保存在服务器，不受影响。',
      '清空',
      function () {
        Store.remove(STORE.profile);
        Store.remove(STORE.paper);
        Store.remove(STORE.history);
        state.profile = null;
        state.paper = null;
        state.history = [];
        state.setupMode = 'first';
        state.setup = defaultProfile();
        state.fetchError = null;
        state.fetchToken = (state.fetchToken || 0) + 1;
        state.fetching = false;
        state.view = 'setup';
        render();
        scrollTop();
      }
    );
  }

  /* ---------------- 答题 ---------------- */

  function currentQuestion() {
    var paper = state.paper;
    if (!paper || !paper.questions.length) return null;
    return paper.questions[paper.cursor || 0] || null;
  }

  function isAnswered(question, answer) {
    if (question.type === 'multi') return !!(Array.isArray(answer) && answer.length);
    if (question.type === 'fill') return typeof answer === 'string' && answer.replace(/\s/g, '') !== '';
    return typeof answer === 'string' && answer !== '';
  }

  function countAnswered(paper) {
    var count = 0;
    for (var i = 0; i < paper.questions.length; i++) {
      if (isAnswered(paper.questions[i], paper.answers[paper.questions[i].id])) count++;
    }
    return count;
  }

  function normalizeJudge(value) {
    var text = String(value == null ? '' : value).replace(/\s/g, '');
    if (/^(对|正确|是|true|t|√|✓|1)$/.test(text)) return '对';
    if (/^(错|错误|否|false|f|×|✗|0)$/.test(text)) return '错';
    return text;
  }

  function normalizeFill(value) {
    var text = String(value == null ? '' : value).replace(/\u00a0/g, ' ');
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

  function fillMatches(question, answer) {
    var keys = question.answerKeys || [];
    var value = normalizeFill(answer);
    var variants = [
      value,
      value.replace(/×/g, 'x').replace(/÷/g, '/'),
      value.replace(/[.,;:]+$/, '')
    ];
    for (var i = 0; i < variants.length; i++) {
      if (keys.indexOf(variants[i]) !== -1) return true;
    }
    return false;
  }

  function isCorrect(question, answer) {
    if (!isAnswered(question, answer)) return false;

    if (question.type === 'choice') {
      return String(answer) === String((question.answer || [])[0]);
    }

    if (question.type === 'multi') {
      if (!Array.isArray(answer)) return false;
      var mine = answer.slice().sort();
      var right = (question.answer || []).slice().sort();
      if (mine.length !== right.length) return false;
      for (var i = 0; i < mine.length; i++) {
        if (mine[i] !== right[i]) return false;
      }
      return true;
    }

    if (question.type === 'judge') {
      return normalizeJudge(answer) === normalizeJudge((question.answer || [])[0]);
    }

    if (question.type === 'fill') {
      return fillMatches(question, answer);
    }

    return false;
  }

  function evaluate(paper) {
    var items = [];
    var bySubject = {};
    var order = [];
    var correct = 0;

    for (var i = 0; i < paper.questions.length; i++) {
      var question = paper.questions[i];
      var answer = paper.answers[question.id];
      var answered = isAnswered(question, answer);
      var ok = answered && isCorrect(question, answer);

      if (ok) correct++;

      if (!bySubject[question.subject]) {
        bySubject[question.subject] = { name: question.subject, total: 0, correct: 0 };
        order.push(question.subject);
      }
      bySubject[question.subject].total++;
      if (ok) bySubject[question.subject].correct++;

      items.push({
        q: question,
        ans: answer,
        answered: answered,
        ok: ok,
        index: i
      });
    }

    return {
      total: paper.questions.length,
      correct: correct,
      items: items,
      bySubject: bySubject,
      order: order
    };
  }

  function durationText(seconds) {
    if (!seconds) return '—';
    var minutes = Math.round(seconds / 60);
    if (minutes < 1) return '不到 1 分钟';
    return minutes + ' 分钟';
  }

  function startQuiz() {
    if (!state.paper || state.paper.submitted) return;
    if (!state.paper.startedAt) state.paper.startedAt = Date.now();
    savePaper();
    state.view = 'quiz';
    render();
    scrollTop();
  }

  function renderQuiz() {
    var paper = state.paper;
    if (!paper || paper.submitted) {
      state.view = 'home';
      render();
      return;
    }

    if (paper.cursor == null) paper.cursor = 0;
    if (paper.cursor < 0) paper.cursor = 0;
    if (paper.cursor >= paper.questions.length) paper.cursor = paper.questions.length - 1;

    var question = currentQuestion();
    if (!question) return;

    $('quiz-subject').textContent = question.subject;
    $('quiz-type').textContent = question.typeLabel;
    $('quiz-index').textContent = '第 ' + (paper.cursor + 1) + ' / ' + paper.questions.length + ' 题';

    renderSheet();

    var answer = paper.answers[question.id];
    var html = '';

    html += '<div class="q-head">' +
      escapeHtml(question.subject) + ' · ' + escapeHtml(question.typeLabel) +
      (question.knowledge ? ' · ' + escapeHtml(question.knowledge) : '') +
      '</div>';
    html += '<div class="q-stem">' + question.stem + '</div>';

    if (question.type === 'choice' || question.type === 'multi') {
      html += '<div class="options">';
      for (var i = 0; i < question.options.length; i++) {
        var option = question.options[i];
        var selected = question.type === 'multi'
          ? !!(Array.isArray(answer) && answer.indexOf(option.key) !== -1)
          : answer === option.key;
        html += '<button type="button" class="option' + (selected ? ' is-selected' : '') + '" data-action="quiz-option" data-key="' + escapeHtml(option.key) + '">' +
          '<span class="opt-key">' + escapeHtml(option.key) + '</span>' +
          '<span class="opt-text">' + option.html + '</span>' +
          '</button>';
      }
      html += '</div>';
      if (question.type === 'multi') html += '<p class="fill-hint">多选题，可选择多个选项。</p>';
    } else if (question.type === 'judge') {
      html += '<div class="options">';
      var judgeOptions = ['对', '错'];
      for (var j = 0; j < judgeOptions.length; j++) {
        var value = judgeOptions[j];
        html += '<button type="button" class="option' + (answer === value ? ' is-selected' : '') + '" data-action="quiz-option" data-key="' + value + '">' +
          '<span class="opt-key">' + (value === '对' ? '✓' : '✗') + '</span>' +
          '<span class="opt-text">' + value + '</span>' +
          '</button>';
      }
      html += '</div>';
    } else {
      var value = typeof answer === 'string' ? answer : '';
      html += '<div class="fill-wrap">' +
        '<input type="text" class="fill-input" data-role="fill" value="' + escapeHtml(value) + '" placeholder="在这里填写答案">' +
        '<div class="fill-hint">填空题按文本比对，请尽量写出最终答案。</div>' +
        '</div>';
    }

    $('quiz-question').innerHTML = html;
    $('quiz-prev').disabled = paper.cursor === 0;
    $('quiz-next').disabled = paper.cursor === paper.questions.length - 1;
  }

  function renderSheet() {
    var paper = state.paper;
    if (!paper) return;
    $('quiz-sheet').className = 'sheet' + (paper.questions.length > 30 ? ' sheet-compact' : '');
    var html = '';
    for (var i = 0; i < paper.questions.length; i++) {
      var question = paper.questions[i];
      var done = isAnswered(question, paper.answers[question.id]);
      html += '<button type="button" class="sheet-num' +
        (done ? ' is-done' : '') +
        (i === paper.cursor ? ' is-current' : '') +
        '" data-action="quiz-jump" data-index="' + i + '">' + (i + 1) + '</button>';
    }
    $('quiz-sheet').innerHTML = html;
  }

  function gotoQuestion(index) {
    var paper = state.paper;
    if (!paper) return;
    if (index < 0) index = 0;
    if (index >= paper.questions.length) index = paper.questions.length - 1;
    paper.cursor = index;
    savePaper();
    renderQuiz();
    scrollTop();
  }

  function onQuizOption(key) {
    var paper = state.paper;
    var question = currentQuestion();
    if (!paper || !question) return;

    if (question.type === 'multi') {
      var current = paper.answers[question.id];
      var list = Array.isArray(current) ? current.slice() : [];
      var index = list.indexOf(key);
      if (index === -1) list.push(key);
      else list.splice(index, 1);
      if (!list.length) delete paper.answers[question.id];
      else paper.answers[question.id] = list;
    } else {
      paper.answers[question.id] = key;
    }

    savePaper();
    renderQuiz();
  }

  function onFillInput(target) {
    if (!target || target.getAttribute('data-role') !== 'fill') return;
    var paper = state.paper;
    var question = currentQuestion();
    if (!paper || !question) return;

    if (target.value) paper.answers[question.id] = target.value;
    else delete paper.answers[question.id];

    var buttons = $('quiz-sheet').getElementsByTagName('button');
    var currentButton = buttons[paper.cursor];
    if (currentButton) {
      setClass(currentButton, 'is-done', target.value.replace(/\s/g, '') !== '');
    }
    scheduleSave();
  }

  function confirmSubmit() {
    var paper = state.paper;
    if (!paper || paper.submitted) return;

    var answered = countAnswered(paper);
    var total = paper.questions.length;
    var message;

    if (!answered) message = '还没有作答，确定要交卷吗？';
    else if (answered < total) message = '还有 ' + (total - answered) + ' 题未作答。交卷后统一判分并显示解析。';
    else message = '交卷后统一判分并显示解析，答案将不能再修改。';

    showModal('确认交卷', message, '交卷', submitPaper);
  }

  function submitPaper() {
    var paper = state.paper;
    if (!paper || paper.submitted) return;

    paper.submitted = true;
    paper.submittedAt = Date.now();
    var start = paper.startedAt || paper.createdAt || paper.submittedAt;
    paper.durationSec = Math.max(0, Math.round((paper.submittedAt - start) / 1000));

    var result = evaluate(paper);
    paper.score = result.correct;
    paper.total = result.total;

    savePaper();
    addHistory(paper, result);

    state.filter = 'all';
    state.view = 'result';
    render();
    scrollTop();
  }

  function addHistory(paper, result) {
    var entry = {
      date: paper.date,
      correct: result.correct,
      total: result.total,
      durationSec: paper.durationSec,
      submittedAt: paper.submittedAt,
      source: paper.source,
      stage: paper.profile.stage,
      grade: paper.profile.grade,
      subjects: paper.profile.subjects.slice()
    };

    var history = [];
    history.push(entry);
    for (var i = 0; i < state.history.length; i++) {
      if (state.history[i] && state.history[i].date !== entry.date) history.push(state.history[i]);
    }
    if (history.length > 60) history = history.slice(0, 60);

    state.history = history;
    Store.set(STORE.history, history);
  }

  /* ---------------- 结果 ---------------- */

  function renderResult() {
    var paper = state.paper;
    if (!paper || !paper.submitted) {
      state.view = 'home';
      render();
      return;
    }

    var result = evaluate(paper);
    var rate = result.total ? Math.round(result.correct / result.total * 100) : 0;

    $('result-head').innerHTML =
      '<h1>今日成绩</h1>' +
      '<div class="result-score">' + result.correct + '<small> / ' + result.total + '</small></div>' +
      '<div class="result-meta">' +
      '<span>正确率 ' + rate + '%</span>' +
      '<span>用时 ' + durationText(paper.durationSec) + '</span>' +
      '<span>' + escapeHtml(paper.date) + ' · ' + escapeHtml(sourceLabel(paper)) + '</span>' +
      '</div>';

    var rows = '';
    for (var i = 0; i < result.order.length; i++) {
      var name = result.order[i];
      var subject = result.bySubject[name];
      var subjectRate = subject.total ? Math.round(subject.correct / subject.total * 100) : 0;
      rows += '<tr>' +
        '<td>' + escapeHtml(name) + '</td>' +
        '<td class="num">' + subject.correct + ' / ' + subject.total + '</td>' +
        '<td class="num">' + subjectRate + '%</td>' +
        '</tr>';
    }
    $('result-subjects').innerHTML =
      '<h2>分科成绩</h2>' +
      '<table class="table"><tr><th>学科</th><th class="num">得分</th><th class="num">正确率</th></tr>' +
      rows + '</table>';

    var wrongCount = result.total - result.correct;
    $('result-filter').innerHTML =
      '<button type="button" class="seg-btn' + (state.filter === 'all' ? ' is-on' : '') + '" data-action="result-filter" data-filter="all">全部 ' + result.total + '</button>' +
      '<button type="button" class="seg-btn' + (state.filter === 'wrong' ? ' is-on' : '') + '" data-action="result-filter" data-filter="wrong">错题 ' + wrongCount + '</button>';

    var list = $('result-list');
    var html = '';
    var shown = 0;

    for (var j = 0; j < result.items.length; j++) {
      var item = result.items[j];
      if (state.filter === 'wrong' && item.ok) continue;
      html += renderResultItem(item);
      shown++;
    }

    if (!shown) {
      html = '<div class="notice">没有错题，全部正确。</div>';
    }
    list.innerHTML = html;
  }

  function answerText(question, answer) {
    if (question.type === 'multi') {
      return Array.isArray(answer) && answer.length ? answer.join('、') : '未作答';
    }
    if (question.type === 'fill') {
      return answer ? escapeHtml(answer) : '未作答';
    }
    return answer ? escapeHtml(answer) : '未作答';
  }

  function renderResultItem(item) {
    var question = item.q;
    var answer = item.ans;
    var html = '';

    html += '<article class="result-item' + (item.ok ? '' : ' is-wrong') + '">';
    html += '<div class="result-item-head">' +
      '第 ' + (item.index + 1) + ' 题 · ' + escapeHtml(question.subject) + ' · ' + escapeHtml(question.typeLabel) +
      (item.ok ? '<span class="badge ok">正确</span>' : '<span class="badge no">' + (item.answered ? '错误' : '未作答') + '</span>') +
      '</div>';

    html += '<div class="q-stem">' + question.stem + '</div>';

    if (question.type === 'choice' || question.type === 'multi') {
      for (var i = 0; i < question.options.length; i++) {
        var option = question.options[i];
        var correct = (question.answer || []).indexOf(option.key) !== -1;
        var chosen = question.type === 'multi'
          ? !!(Array.isArray(answer) && answer.indexOf(option.key) !== -1)
          : answer === option.key;

        var cls = 'option-static';
        if (correct) cls += ' is-correct';
        if (chosen && !correct) cls += ' is-wrong';

        var mark = '';
        if (correct && chosen) mark = '<span class="mark">✓ 你的选择</span>';
        else if (correct) mark = '<span class="mark">✓ 正确答案</span>';
        else if (chosen) mark = '<span class="mark">✗ 你的选择</span>';

        html += '<div class="' + cls + '">' + mark +
          '<span class="opt-key">' + escapeHtml(option.key) + '</span>' +
          '<span class="opt-text">' + option.html + '</span>' +
          '</div>';
      }
    } else if (question.type === 'judge') {
      var judgeOptions = ['对', '错'];
      for (var j = 0; j < judgeOptions.length; j++) {
        var value = judgeOptions[j];
        var isRight = (question.answer || [])[0] === value;
        var isChosen = answer === value;
        var judgeCls = 'option-static';
        if (isRight) judgeCls += ' is-correct';
        if (isChosen && !isRight) judgeCls += ' is-wrong';

        var judgeMark = '';
        if (isRight && isChosen) judgeMark = '<span class="mark">✓ 你的选择</span>';
        else if (isRight) judgeMark = '<span class="mark">✓ 正确答案</span>';
        else if (isChosen) judgeMark = '<span class="mark">✗ 你的选择</span>';

        html += '<div class="' + judgeCls + '">' + judgeMark +
          '<span class="opt-key">' + (value === '对' ? '✓' : '✗') + '</span>' +
          '<span class="opt-text">' + value + '</span>' +
          '</div>';
      }
    }

    var yourAnswer = answerText(question, answer);
    var rightAnswer = question.answerDisplay || (question.answer || []).join('、');

    html += '<div class="answer-box">' +
      '<div class="label">你的答案</div>' +
      '<div class="val ' + (item.ok ? 'ok' : 'no') + '">' + yourAnswer + '</div>' +
      '</div>';

    html += '<div class="answer-box">' +
      '<div class="label">参考答案</div>' +
      '<div class="val">' + rightAnswer + '</div>' +
      '</div>';

    html += '<div class="analysis">' +
      '<div class="analysis-title">解析</div>' +
      '<div class="rich">' + question.analysis + '</div>' +
      '</div>';

    var meta = [];
    if (question.knowledge) meta.push('知识点：' + escapeHtml(question.knowledge));
    if (question.source) meta.push('来源：' + escapeHtml(question.source));
    if (question.difficulty) meta.push('难度：' + question.difficulty + '/5');
    if (meta.length) html += '<p class="fineprint">' + meta.join(' · ') + '</p>';

    html += '</article>';
    return html;
  }

  /* ---------------- 事件 ---------------- */

  function findAction(node) {
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-action')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function onAction(element) {
    var action = element.getAttribute('data-action');

    if (action === 'nav') {
      var target = element.getAttribute('data-nav');
      if (target === 'settings') {
        openSetup('edit');
      } else {
        state.view = 'home';
        render();
        scrollTop();
      }
      return;
    }

    if (action === 'home-start') return fetchPaper(false);
    if (action === 'home-retry') {
      state.fetchError = null;
      return fetchPaper(false);
    }
    if (action === 'home-demo') return fetchPaper(false, true);
    if (action === 'home-continue') return startQuiz();
    if (action === 'home-result') {
      state.view = 'result';
      render();
      scrollTop();
      return;
    }

    if (action === 'exit-demo') {
      state.demoMode = false;
      state.paper = null;
      state.fetchError = null;
      state.fetchToken = (state.fetchToken || 0) + 1;
      state.fetching = false;
      Store.remove(STORE.paper);
      if (window.history && window.history.replaceState) {
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {}
      }
      state.view = 'home';
      render();
      return fetchPaper(false, false);
    }

    if (action === 'setup-stage') return onSetupStage(element.getAttribute('data-stage'));
    if (action === 'setup-grade') return onSetupGrade(element.getAttribute('data-grade'));
    if (action === 'setup-count') return onSetupCount(element.getAttribute('data-count'));
    if (action === 'setup-mode') return onSetupMode(element.getAttribute('data-mode'));
    if (action === 'setup-save') return onSetupSave();
    if (action === 'kp-open') return openKnowledgePicker(element.getAttribute('data-subject'));
    if (action === 'kp-search') {
      var kpInput = $('kp-keyword');
      return loadKnowledge(kpInput ? kpInput.value : '');
    }
    if (action === 'kp-toggle') return onKpToggle(Number(element.getAttribute('data-id')));
    if (action === 'kp-remove') return onKpRemove(Number(element.getAttribute('data-id')));
    if (action === 'editions-retry') {
      state.editionsError = null;
      state.editionsErrorKey = '';
      renderSetup();
      return;
    }
    if (action === 'setup-cancel') {
      state.view = 'home';
      render();
      scrollTop();
      return;
    }
    if (action === 'clear-data') return onClearData();

    if (action === 'quiz-prev') return gotoQuestion((state.paper ? state.paper.cursor : 0) - 1);
    if (action === 'quiz-next') return gotoQuestion((state.paper ? state.paper.cursor : 0) + 1);
    if (action === 'quiz-jump') return gotoQuestion(Number(element.getAttribute('data-index')));
    if (action === 'quiz-option') return onQuizOption(element.getAttribute('data-key'));
    if (action === 'quiz-submit') return confirmSubmit();
    if (action === 'quiz-back') {
      savePaper();
      state.view = 'home';
      render();
      scrollTop();
      return;
    }

    if (action === 'result-filter') {
      state.filter = element.getAttribute('data-filter') === 'wrong' ? 'wrong' : 'all';
      renderResult();
      return;
    }
    if (action === 'result-home') {
      state.view = 'home';
      render();
      scrollTop();
      return;
    }
    if (action === 'result-settings') return openSetup('edit');

    if (action === 'modal-ok') {
      var callback = modalCallback;
      hideModal();
      if (callback) callback();
      return;
    }
    if (action === 'modal-cancel') {
      hideModal();
      state.kp = null;
      return;
    }
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var element = findAction(event.target);
      if (!element) return;
      onAction(element);
    });

    document.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) return;
      if (target.getAttribute('data-role') === 'subject') onSubjectChange(target);
      if (target.getAttribute('data-role') === 'edition') onEditionChange(target);
      if (target.getAttribute('data-role') === 'fill') {
        onFillInput(target);
        savePaper();
      }
    });

    document.addEventListener('input', function (event) {
      onFillInput(event.target);
    });

    document.addEventListener('keyup', function (event) {
      var target = event.target;
      if (target && target.getAttribute && target.getAttribute('data-role') === 'fill') {
        onFillInput(target);
      }
    });

    document.addEventListener('keydown', function (event) {
      var key = event.keyCode;
      if (key === 27) {
        hideModal();
        state.kp = null;
        return;
      }
      if (key === 13) {
        var kpTarget = event.target;
        if (kpTarget && kpTarget.getAttribute && kpTarget.getAttribute('data-role') === 'kp-keyword') {
          loadKnowledge(kpTarget.value);
          return;
        }
      }
      if (!hasClass($('modal'), 'is-hidden')) return;
      if (state.view !== 'quiz' || !state.paper || state.paper.submitted) return;
      var tag = (event.target && event.target.tagName ? event.target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (key === 37) gotoQuestion((state.paper.cursor || 0) - 1);
      if (key === 39) gotoQuestion((state.paper.cursor || 0) + 1);
    });
  }

  function loadStatus() {
    request('GET', '/api/status?quota=1', null, function (error, data) {
      if (error || !data) return;
      state.status = data;
      if (data.lastQuota && !state.lastQuota) state.lastQuota = data.lastQuota;
      if (state.view === 'home') renderHome();
      else if (state.view === 'setup') renderSetup();
    });
  }

  function init() {
    if (/[?&]demo=1/.test(window.location.search)) state.demoMode = true;
    if (/[?&]reset=1/.test(window.location.search)) {
      Store.remove(STORE.profile);
      Store.remove(STORE.paper);
      Store.remove(STORE.history);
      if (window.history && window.history.replaceState) {
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {}
      }
    }

    var saved = Store.get(STORE.profile, null);
    if (saved) {
      var normalized = normalizeProfile(saved);
      if (normalized) state.profile = normalized;
    }

    var history = Store.get(STORE.history, []);
    if (history && history.length) state.history = history;

    if (state.profile) {
      state.paper = loadPaper();
      state.view = 'home';
    } else {
      state.setupMode = 'first';
      state.setup = defaultProfile();
      state.view = 'setup';
    }

    bind();
    render();
    loadStatus();

    if (state.profile && !state.paper && !state.fetching) fetchPaper(false);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
