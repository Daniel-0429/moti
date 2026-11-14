'use strict';

import * as format from './format.js';
import { SUBJECTS, STAGES, findStage, findGrade, configHash, todayKey } from './tizhuang.js';

function choice(subject, id, stem, options, answer, analysis, knowledge) {
  return {
    id: 'demo-' + subject.id + '-' + id,
    subjectId: subject.id,
    subject: subject.name,
    type: 'choice',
    typeLabel: '选择题',
    stem: format.formatRich(stem),
    options: options.map(function (text, index) {
      return { key: String.fromCharCode(65 + index), html: format.formatRich(text) };
    }),
    answer: [answer],
    answerKeys: [],
    answerDisplay: answer,
    analysis: format.formatRich(analysis),
    knowledge: knowledge || '',
    source: '演示题目（非题庄真实题库）',
    difficulty: 1,
    year: null,
  };
}

function judge(subject, id, stem, answer, analysis, knowledge) {
  return {
    id: 'demo-' + subject.id + '-' + id,
    subjectId: subject.id,
    subject: subject.name,
    type: 'judge',
    typeLabel: '判断题',
    stem: format.formatRich(stem),
    options: [],
    answer: [answer],
    answerKeys: [],
    answerDisplay: answer,
    analysis: format.formatRich(analysis),
    knowledge: knowledge || '',
    source: '演示题目（非题庄真实题库）',
    difficulty: 1,
    year: null,
  };
}

function fill(subject, id, stem, answer, analysis, knowledge) {
  return {
    id: 'demo-' + subject.id + '-' + id,
    subjectId: subject.id,
    subject: subject.name,
    type: 'fill',
    typeLabel: '填空题',
    stem: format.formatRich(stem),
    options: [],
    answer: [],
    answerKeys: format.fillAnswerVariants(answer),
    answerDisplay: format.formatRich(answer),
    analysis: format.formatRich(analysis),
    knowledge: knowledge || '',
    source: '演示题目（非题庄真实题库）',
    difficulty: 1,
    year: null,
  };
}

function mathPool(stageKey) {
  if (stageKey === 'primary') {
    return [
      choice(SUBJECTS[2], 1, '计算：\\(38+27=\\)（　　）', ['55', '65', '64', '56'], 'B', '个位 8+7=15，向十位进 1；十位 3+2+1=6，所以结果是 65。', '两位数加法'),
      choice(SUBJECTS[2], 2, '计算：\\(7\\times 8=\\)（　　）', ['54', '56', '48', '64'], 'B', '七八五十六，所以 \\(7\\times 8=56\\)。', '乘法口诀'),
      choice(SUBJECTS[2], 3, '一个长方形长 6 厘米，宽 4 厘米，它的周长是（　　）', ['10 厘米', '20 厘米', '24 厘米', '12 厘米'], 'B', '长方形周长 =（长+宽）×2 =（6+4）×2 = 20 厘米。', '长方形周长'),
      fill(SUBJECTS[2], 4, '计算：\\(96\\div 8=\\) ______。', '12', '因为 \\(8\\times 12=96\\)，所以 \\(96\\div 8=12\\)。', '除法'),
      judge(SUBJECTS[2], 5, '0 乘任何数都得 0。', '对', '0 与任何数相乘，结果都是 0。', '乘法的意义'),
    ];
  }
  if (stageKey === 'senior') {
    return [
      choice(SUBJECTS[2], 1, '函数 \\(f(x)=x^2-4x+3\\) 的对称轴是（　　）', ['\\(x=-2\\)', '\\(x=2\\)', '\\(x=4\\)', '\\(x=-4\\)'], 'B', '二次函数 \\(y=ax^2+bx+c\\) 的对称轴为 \\(x=-\\dfrac{b}{2a}\\)，代入得 \\(x=2\\)。', '二次函数'),
      choice(SUBJECTS[2], 2, '已知集合 \\(A=\\{1,2,3\\}\\)，\\(B=\\{2,3,4\\}\\)，则 \\(A\\cap B=\\)（　　）', ['\\(\\{1,2\\}\\)', '\\(\\{2,3\\}\\)', '\\(\\{3,4\\}\\)', '\\(\\{1,4\\}\\)'], 'B', '交集取两个集合都有的元素，即 2 和 3。', '集合的交集'),
      choice(SUBJECTS[2], 3, '计算：\\(\\log_2 8=\\)（　　）', ['2', '3', '4', '8'], 'B', '因为 \\(2^3=8\\)，所以 \\(\\log_2 8=3\\)。', '对数'),
      fill(SUBJECTS[2], 4, '若 \\(\\sin\\alpha=\\dfrac{3}{5}\\)，且 \\(\\alpha\\) 为第一象限角，则 \\(\\cos\\alpha=\\) ______。', '4/5', '由 \\(\\sin^2\\alpha+\\cos^2\\alpha=1\\)，得 \\(\\cos^2\\alpha=\\dfrac{16}{25}\\)。第一象限余弦为正，所以 \\(\\cos\\alpha=\\dfrac{4}{5}\\)。', '同角三角函数关系'),
      judge(SUBJECTS[2], 5, '两条平行直线的斜率一定相等。', '错', '当两条直线都垂直于 x 轴时，斜率不存在，不能比较斜率。', '直线斜率'),
    ];
  }
  return [
    choice(SUBJECTS[2], 1, '解方程：\\(3x-5=10\\)，则 \\(x=\\)（　　）', ['3', '5', '15', '2'], 'B', '移项得 \\(3x=15\\)，两边同除以 3，得 \\(x=5\\)。', '一元一次方程'),
    choice(SUBJECTS[2], 2, '计算：\\((-2)^3=\\)（　　）', ['-6', '6', '-8', '8'], 'C', '\\((-2)^3=(-2)\\times(-2)\\times(-2)=-8\\)。', '有理数的乘方'),
    choice(SUBJECTS[2], 3, '在 \\(\\triangle ABC\\) 中，\\(\\angle A=50^\\circ\\)，\\(\\angle B=60^\\circ\\)，则 \\(\\angle C=\\)（　　）', ['50°', '60°', '70°', '80°'], 'C', '三角形内角和为 180°，所以 \\(\\angle C=180^\\circ-50^\\circ-60^\\circ=70^\\circ\\)。', '三角形内角和'),
    fill(SUBJECTS[2], 4, '计算：\\(2x+3x=\\) ______。', '5x', '合并同类项，系数相加：\\(2x+3x=(2+3)x=5x\\)。', '合并同类项'),
    judge(SUBJECTS[2], 5, '两条直线被第三条直线所截，同位角一定相等。', '错', '只有当两条直线平行时，同位角才相等；题目没有说明平行。', '平行线的性质'),
  ];
}

function subjectPool(subjectId, stageKey) {
  const s = SUBJECTS[subjectId];
  switch (subjectId) {
    case 1:
      return [
        choice(s, 1, '下列词语中，没有错别字的一项是（　　）', ['再接再励', '一如既往', '迫不急待', '谈笑风声'], 'B', 'A 应为“再接再厉”，C 应为“迫不及待”，D 应为“谈笑风生”。', '字形'),
        choice(s, 2, '“春风又绿江南岸”中“绿”的意思是（　　）', ['绿色', '吹绿', '绿叶', '变绿'], 'B', '“绿”在这里作动词，意思是“吹绿、使……变绿”。', '古诗字词'),
        choice(s, 3, '下列句子没有语病的一项是（　　）', ['通过这次活动，使我明白了团结的重要。', '我们要养成认真读书。', '他的写作水平明显提高了。', '能否学好语文，关键在于努力。'], 'C', 'A 缺少主语，B 缺少宾语，D 两面对一面。', '病句辨析'),
        fill(s, 4, '补写诗句：会当凌绝顶，______。', '一览众山小', '出自杜甫《望岳》，原句为“会当凌绝顶，一览众山小”。', '古诗默写'),
        judge(s, 5, '“凹”字的第一笔是“竖”。', '错', '“凹”字的第一笔是“竖折”，不是“竖”。', '笔画笔顺'),
      ];
    case 3:
      return [
        choice(s, 1, 'Choose the correct word: I ______ a student.', ['am', 'is', 'are', 'be'], 'A', '主语 I 搭配 be 动词 am。', 'be 动词'),
        choice(s, 2, '“苹果”的英文是（　　）', ['apple', 'orange', 'banana', 'pear'], 'A', 'apple 意为苹果。', '词汇'),
        choice(s, 3, 'Choose the correct sentence.', ['She go to school.', 'She goes to school.', 'She going to school.', 'She gone to school.'], 'B', '一般现在时，第三人称单数动词加 -s。', '一般现在时'),
        fill(s, 4, '用所给词的适当形式填空：He ______ (like) music.', 'likes', '主语 He 是第三人称单数，动词 like 加 -s。', '动词第三人称单数'),
        judge(s, 5, '“an”用在以辅音音素开头的单词前。', '错', 'an 用在以元音音素开头的单词前，例如 an apple。', '冠词'),
      ];
    case 4:
      return [
        choice(s, 1, '中国历史上第一个统一的中央集权王朝是（　　）', ['夏朝', '商朝', '秦朝', '汉朝'], 'C', '公元前 221 年，秦始皇统一六国，建立秦朝。', '秦朝统一'),
        choice(s, 2, '“贞观之治”出现在哪位皇帝统治时期？', ['汉武帝', '唐太宗', '宋太祖', '明成祖'], 'B', '唐太宗李世民统治时期，政治清明，经济发展，史称“贞观之治”。', '唐朝'),
        choice(s, 3, '辛亥革命爆发于（　　）', ['1911 年', '1919 年', '1921 年', '1949 年'], 'A', '1911 年武昌起义爆发，随后形成辛亥革命。', '辛亥革命'),
        fill(s, 4, '中国共产党成立于 ______ 年。', '1921', '1921 年 7 月，中国共产党第一次全国代表大会召开，宣告中国共产党成立。', '建党'),
        judge(s, 5, '丝绸之路开通于西汉时期。', '对', '西汉张骞出使西域，促进了丝绸之路的开通。', '丝绸之路'),
      ];
    case 5:
      return [
        choice(s, 1, '地球自转产生的地理现象是（　　）', ['四季更替', '昼夜交替', '五带划分', '极昼极夜'], 'B', '地球自转产生昼夜交替和时间差异；四季更替由公转产生。', '地球运动'),
        choice(s, 2, '我国面积最大的省级行政区是（　　）', ['西藏', '新疆', '内蒙古', '青海'], 'B', '新疆维吾尔自治区面积约 166 万平方千米，是我国面积最大的省级行政区。', '中国行政区划'),
        choice(s, 3, '世界上面积最大的大洋是（　　）', ['大西洋', '印度洋', '太平洋', '北冰洋'], 'C', '太平洋是世界上面积最大、最深的大洋。', '大洋'),
        fill(s, 4, '我国地势总特征是西高东低，呈 ______ 分布。', '阶梯状', '我国地势西高东低，呈三级阶梯状分布。', '中国地势'),
        judge(s, 5, '赤道穿过非洲大陆的中部。', '对', '赤道穿过非洲中部，因此非洲被称为“热带大陆”。', '非洲地理'),
      ];
    case 6:
      return [
        choice(s, 1, '我国的根本政治制度是（　　）', ['人民代表大会制度', '民族区域自治制度', '基层群众自治制度', '中国共产党领导的多党合作和政治协商制度'], 'A', '人民代表大会制度是我国的根本政治制度。', '政治制度'),
        choice(s, 2, '公民最基本的权利是（　　）', ['选举权', '人身自由权', '受教育权', '生命健康权'], 'D', '生命健康权是公民最根本的人身权利。', '公民权利'),
        choice(s, 3, '依法治国的核心是（　　）', ['有法可依', '依宪治国', '执法必严', '违法必究'], 'B', '宪法是国家的根本法，依法治国首先是依宪治国。', '依法治国'),
        fill(s, 4, '我国的根本大法是 ______。', '宪法', '宪法是国家的根本法，具有最高的法律效力。', '宪法'),
        judge(s, 5, '公民的权利和义务是统一的。', '对', '公民既是权利的享有者，也是义务的承担者，权利和义务相统一。', '权利与义务'),
      ];
    case 7:
      return [
        choice(s, 1, '细胞中进行光合作用的主要场所是（　　）', ['线粒体', '叶绿体', '细胞核', '液泡'], 'B', '叶绿体是绿色植物进行光合作用的场所。', '光合作用'),
        choice(s, 2, '人体呼吸系统的主要器官是（　　）', ['气管', '肺', '鼻腔', '支气管'], 'B', '肺是气体交换的主要场所，是呼吸系统的主要器官。', '呼吸系统'),
        choice(s, 3, '遗传物质主要存在于（　　）', ['细胞膜', '细胞质', '细胞核', '细胞壁'], 'C', '细胞核中含有遗传物质 DNA。', '细胞结构'),
        fill(s, 4, '绿色植物通过光合作用吸收二氧化碳，释放 ______。', '氧气', '光合作用吸收二氧化碳，释放氧气，并制造有机物。', '光合作用'),
        judge(s, 5, '病毒没有细胞结构。', '对', '病毒由蛋白质外壳和内部遗传物质组成，没有细胞结构。', '病毒'),
      ];
    case 8:
      return [
        choice(s, 1, '国际单位制中，力的单位是（　　）', ['千克', '牛顿', '焦耳', '帕斯卡'], 'B', '力的国际单位是牛顿，符号 N。', '力的单位'),
        choice(s, 2, '一辆汽车 2 小时行驶 120 千米，它的平均速度是（　　）', ['40 km/h', '60 km/h', '120 km/h', '240 km/h'], 'B', '平均速度 = 路程 ÷ 时间 = 120 ÷ 2 = 60 km/h。', '速度'),
        choice(s, 3, '下列属于省力杠杆的是（　　）', ['筷子', '钓鱼竿', '开瓶器', '镊子'], 'C', '开瓶器的动力臂大于阻力臂，属于省力杠杆。', '杠杆'),
        fill(s, 4, '水的密度是 ______ kg/m³。', '1000', '水的密度约为 \\(1.0\\times 10^3\\) kg/m³。', '密度'),
        judge(s, 5, '物体不受力时一定保持静止。', '错', '物体不受力时可能保持静止，也可能做匀速直线运动。', '牛顿第一定律'),
      ];
    case 9:
      return [
        choice(s, 1, '氧元素的元素符号是（　　）', ['O', 'H', 'C', 'N'], 'A', '氧的元素符号是 O。', '元素符号'),
        choice(s, 2, '下列物质属于纯净物的是（　　）', ['空气', '海水', '蒸馏水', '食醋'], 'C', '蒸馏水只由水一种物质组成，属于纯净物。', '纯净物与混合物'),
        choice(s, 3, '铁在氧气中燃烧的产物是（　　）', ['FeO', 'Fe2O3', 'Fe3O4', 'Fe(OH)3'], 'C', '铁在氧气中燃烧生成四氧化三铁，化学式为 Fe3O4。', '铁的燃烧'),
        fill(s, 4, '水的化学式是 ______。', 'H2O', '一个水分子由两个氢原子和一个氧原子构成。', '化学式'),
        judge(s, 5, '催化剂在化学反应前后质量和化学性质都不变。', '对', '催化剂能改变反应速率，但反应前后质量和化学性质不变。', '催化剂'),
      ];
    case 10:
      return [
        choice(s, 1, '水在标准大气压下的沸点是（　　）', ['0 ℃', '50 ℃', '100 ℃', '212 ℃'], 'C', '标准大气压下，水的沸点是 100 ℃。', '水的沸腾'),
        choice(s, 2, '下列属于导体的是（　　）', ['橡胶', '玻璃', '铜', '塑料'], 'C', '铜是金属，容易导电，属于导体。', '导体与绝缘体'),
        choice(s, 3, '植物进行光合作用需要（　　）', ['阳光', '黑暗', '酒精', '食盐'], 'A', '光合作用需要光、水和二氧化碳。', '光合作用'),
        fill(s, 4, '冰是水的 ______ 态。', '固', '冰是水的固态形式。', '物态变化'),
        judge(s, 5, '月亮是光源。', '错', '月亮本身不发光，反射太阳光，不是光源。', '光源'),
      ];
    case 11:
      return [
        choice(s, 1, '在公共场所排队，体现的社会规则是（　　）', ['公平竞争', '遵守公共秩序', '诚实守信', '尊重他人隐私'], 'B', '排队是遵守公共秩序的表现。', '社会规则'),
        choice(s, 2, '我国公民年满多少周岁享有选举权？', ['16 周岁', '18 周岁', '20 周岁', '22 周岁'], 'B', '年满十八周岁的公民，依法享有选举权和被选举权。', '选举权'),
        choice(s, 3, '遇到火灾时，正确的做法是（　　）', ['乘坐电梯逃生', '用湿毛巾捂住口鼻，低姿撤离', '躲进衣柜', '返回取贵重物品'], 'B', '火灾时应捂住口鼻、低姿撤离，不能乘坐电梯。', '安全自救'),
        fill(s, 4, '我国的国旗是 ______。', '五星红旗', '中华人民共和国国旗是五星红旗。', '国家象征'),
        judge(s, 5, '未成年人也可以随意进入营业性网吧。', '错', '未成年人不得进入营业性网吧，这属于社会保护。', '未成年人保护'),
      ];
    default:
      return [];
  }
}

function buildMockPaper(inputProfile) {
  const profile = {
    stage: inputProfile.stage,
    grade: Number(inputProfile.grade),
    subjects: inputProfile.subjects.map(Number),
    perSubject: Math.max(1, Math.min(10, Number(inputProfile.perSubject) || 2)),
    mode: inputProfile.mode === 'mixed' ? 'mixed' : 'objective',
    editions: inputProfile.editions || {},
    editionNames: inputProfile.editionNames || {},
    knowledge: inputProfile.knowledge || {},
  };
  const stage = findStage(profile.stage);
  const grade = findGrade(stage, profile.grade);
  const questions = [];

  for (let i = 0; i < profile.subjects.length; i++) {
    const subjectId = profile.subjects[i];
    const subject = SUBJECTS[subjectId];
    if (!subject) continue;
    const pool = subjectId === 2 ? mathPool(profile.stage) : subjectPool(subjectId, profile.stage);
    if (!pool.length) continue;
    for (let j = 0; j < profile.perSubject; j++) {
      const source = pool[j % pool.length];
      const copy = JSON.parse(JSON.stringify(source));
      copy.id = 'demo-' + subjectId + '-' + (j + 1);
      if (j >= pool.length) {
        copy.stem = '<p class="muted">（演示变式）</p>' + copy.stem;
      }
      questions.push(copy);
    }
  }

  const hash = configHash(profile);
  return {
    paper: {
      id: 'demo-' + todayKey() + '-' + hash.slice(0, 8),
      date: todayKey(),
      createdAt: Date.now(),
      source: 'demo',
      configHash: hash,
      profile: profile,
      questions: questions,
      warnings: ['当前是演示题目，不是题庄真实题库。配置好 Key 后会自动使用真实题目。'],
    },
    quota: null,
    warnings: ['当前是演示题目，不是题庄真实题库。配置好 Key 后会自动使用真实题目。'],
  };
}

export { buildMockPaper };
