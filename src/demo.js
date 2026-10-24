import { newCard, newGame } from './store.js';

// 教程示例：完全虚构的小案子，用来展示导图、时间线冲突与复盘
export function makeDemo() {
  let t = Date.now() - 3600e3, y = 0;
  const C = (type, extra) => newCard(type, { createdAt: (t += 1000), updatedAt: t, y: (y += 10), round: 1, ...extra });
  const root = C('topic', { title: '《雨夜山庄（教程）》', x: 0, y: 0 });
  const bPeople = C('topic', { title: '人物关系', parentId: root.id });
  const bClues = C('topic', { title: '关键线索', parentId: root.id });
  const bQs = C('topic', { title: '疑点', parentId: root.id });

  const gu = C('person', { title: '顾老爷', parentId: bPeople.id, identity: '山庄主人（死者）', relation: '沈小姐的养父，许医生的老友', body: '雨夜在书房身亡，书房门从里面反锁。' });
  const zhou = C('person', { title: '周管家', parentId: bPeople.id, identity: '管家', relation: '在顾家做了二十年', player: '玩家 A', alibi: '自称 21:00–21:30 一直在厨房收拾', motive: '账本上有一笔说不清的支出', suspicion: 2 });
  const shen = C('person', { title: '沈小姐', parentId: bPeople.id, identity: '养女', relation: '顾老爷的养女', player: '玩家 B', alibi: '自称 21:10 在花园散步', motive: '遗嘱改写后可能失去继承权', suspicion: 3 });
  const xu = C('person', { title: '许医生', parentId: bPeople.id, identity: '家庭医生', relation: '顾老爷的老友', player: '玩家 C', alibi: '21:40 第一个发现尸体', motive: '新遗嘱的受益方是他的诊所', suspicion: 2 });
  const me = C('person', { title: '陆探长', parentId: bPeople.id, identity: '侦探', relation: '受邀来山庄做客', player: '我', isMe: true });

  const watch = C('clue', { title: '怀表停在 21:15', parentId: bClues.id, body: '死者口袋里的怀表表盖碎裂，指针停在 21:15。', credibility: 'mid', mark: 'key', personIds: [gu.id] });
  const foot = C('clue', { title: '书房窗台的湿脚印', parentId: bClues.id, body: '鞋码偏小，鞋底的泥像是花园里的。', credibility: 'high' });
  const will = C('clue', { title: '遗嘱草稿', parentId: bClues.id, body: '案发前一天改写：受益人从沈小姐改成了许医生的诊所。', credibility: 'high', mark: 'key', round: 2, personIds: [shen.id, xu.id] });
  const pills = C('clue', { title: '厨房垃圾桶里的安眠药瓶', parentId: bClues.id, body: '瓶身贴着许医生开的处方标签。', credibility: 'mid', mark: 'mislead', round: 2, personIds: [xu.id] });

  const q1 = C('question', { title: '沈小姐 21:10 到底在花园还是书房？', parentId: bQs.id, askIds: [shen.id, xu.id] });
  const q2 = C('question', { title: '怀表是不是被人拨过？', parentId: bQs.id, done: true, answer: '表冠上有新划痕，指针被拨动过，真正的案发时间可能更早。' });
  const q3 = C('question', { title: '谁能拿到许医生的安眠药？', parentId: bQs.id, askIds: [xu.id, zhou.id], round: 2 });
  const ded = C('deduction', { title: '凶手先作案，再把怀表拨到 21:15，给自己制造不在场证明', parentId: q2.id, confidence: 2 });

  const root2 = C('topic', { title: '案发时间线', x: 1060, y: 0 });
  const study = C('place', { title: '书房', parentId: root2.id });
  const garden = C('place', { title: '花园', parentId: root2.id });
  const kitchen = C('place', { title: '厨房', parentId: root2.id });
  const dining = C('place', { title: '餐厅', parentId: root2.id });
  const ev = (title, time, timeEnd, place, pids, extra) => C('event', { title, time, timeEnd, placeId: place.id, parentId: place.id, personIds: pids, ...extra });
  const e4 = ev('有人看到沈小姐在书房门口', '21:10', '21:20', study, [shen.id], { body: '许医生的证词。' });
  const e5 = ev('书房传来一声闷响', '21:15', '', study, []);
  const e6 = ev('许医生发现尸体', '21:40', '', study, [xu.id]);
  const e3 = ev('沈小姐在花园散步（自述）', '21:10', '', garden, [shen.id]);
  const e2 = ev('周管家在厨房收拾', '21:00', '21:30', kitchen, [zhou.id]);
  const e1 = ev('晚餐结束，众人散去', '20:30', '', dining, [gu.id, zhou.id, shen.id, xu.id]);

  const knife = C('clue', { title: '厨房少了一把水果刀？', body: '速记：DM 第二轮随口提到，还没核实。', onBoard: false, round: 2, tags: ['待核实'] });
  const hint = C('note', { title: 'DM 提示：留意所有和“钟表”有关的细节', onBoard: false });

  const cards = [root, bPeople, bClues, bQs, gu, zhou, shen, xu, me, watch, foot, will, pills, q1, q2, q3, ded, root2, study, garden, kitchen, dining, e4, e5, e6, e3, e2, e1, knife, hint];
  const E = (from, to, style, label, arrow = 'end') => ({ id: 'e_' + from.id + to.id, from: from.id, to: to.id, style, label, arrow });
  const edges = [
    E(will, shen, 'dashed', '动机？'),
    E(pills, xu, 'dashed', '栽赃？'),
    E(e3, e4, 'conflict', '时间冲突', 'none'),
    E(watch, e5, 'solid', '时间吻合'),
    E(ded, watch, 'solid', '依据'),
  ];
  const frames = [{ id: 'f_demo', title: '案发现场', x: 1036, y: -300, w: 700, h: 600, color: '#7c4ddb', fitIds: [root2, study, garden, kitchen, dining, e1, e2, e3, e4, e5, e6].map((c) => c.id) }];
  const notes = [
    '<h2>欢迎使用剧本杀小助手</h2>',
    '<p>这是一个虚构的教程本，可以随便改、随便删。真正开本时，在本库点「新建剧本」。</p>',
    '<h3>导图</h3>',
    '<ul><li>双击空白处新建卡片；选中卡片后按 <b>Tab</b> 加子卡片、<b>Enter</b> 加同级卡片</li><li>拖动卡片到另一张卡片上，可以改变层级</li><li>按 <b>L</b> 或拖动卡片旁的链接按钮，可以在任意两张卡片之间连线：实线＝确认、虚线＝怀疑、红线＝矛盾</li><li>手机 / 平板上：长按卡片打开菜单，双指缩放画布</li></ul>',
    '<h3>速记</h3>',
    '<ul><li>按 <b>N</b>（手机点右下角 ＋）快速记录，先放进「待整理」</li><li>写 <b>21:10</b> 开头会自动变成事件，<b>@沈小姐</b> 会关联人物，<b>#标签</b> 会加标签</li></ul>',
    '<h3>时间线</h3>',
    '<p>给事件填好时间、地点和人物后，「时间线」会自动找出同一个人同一时间出现在两个地方的矛盾。</p>',
    '<h3>结案之后</h3>',
    '<p>在「结案 & 复盘」写下推理、真相和评分，再导出图片或离线存档，年底就能做年度总结。</p>',
  ].join('');
  const g = newGame({
    title: '雨夜山庄（教程）', caseNo: 'DEMO', genre: '本格 · 教程', date: '', store: '示例', dm: '', players: '5 人', myRole: '陆探长', companions: '', duration: '约 4 小时',
    status: 'done', cover: '#0e93b8', currentRound: 2, rounds: 3, dayLabels: ['案发当晚'], tags: ['教程'],
    cards, edges, frames, notes, demo: true, layoutPending: true,
    verdict: {
      culpritIds: [shen.id], motive: '遗嘱改写后失去继承权', method: '先作案，再拨动怀表制造不在场证明', time: '21:00–21:10', evidenceIds: [watch.id, will.id, ded.id],
      voteIds: [shen.id], voteNote: '全场 3:2 投给沈小姐', result: 'miss',
      truth: '（虚构示例）真凶是周管家：他借口收拾厨房，从后门绕到书房作案，再拨动怀表、把安眠药瓶丢进垃圾桶嫁祸许医生。沈小姐撒谎，只是为了隐瞒自己在书房门口偷听。',
      ratings: { story: 4, logic: 5, role: 3, dm: 4, immersion: 4 }, overall: 4,
      oneLiner: '教程本：熟悉导图、时间线和复盘的小案子', highlights: '发现怀表被拨过的那一刻', thoughts: '下次要更早把时间线对齐，矛盾一出现就追问。', photoIds: [],
    },
  });
  return g;
}
