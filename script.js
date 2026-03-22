/* =============================================
   黒匣 / SCHWARZE KISTE — script.js
   ============================================= */

const KEY = 'schwarze_kiste_v2';

const COND = [
  { id: 'normal',   l: '通常',  c: 'ok'   },
  { id: 'injured',  l: 'ケガ',  c: 'warn' },
  { id: 'faint',    l: '気絶',  c: 'bad'  },
  { id: 'dead',     l: '死亡',  c: 'bad'  },
  { id: 'confused', l: '混乱',  c: 'warn' },
  { id: 'insane',   l: '狂気',  c: 'bad'  },
];

const ACOST = { fixed: 50, growth: 80, evolve: 110, mutant: 140 };
const ATYPE  = { fixed: '固定型', growth: '成長型', evolve: '進化型', mutant: '変異型' };

let chars    = [];
let activeId = null;
let delTarget = null;

/* =============================================
   データ管理
   ============================================= */

function loadChars() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) chars = JSON.parse(raw).map(migrateChar);
  } catch (e) {
    chars = [];
  }
}

function saveChars() {
  localStorage.setItem(KEY, JSON.stringify(chars));
}

/** 古いセーブデータに新フィールドを補完する */
function migrateChar(c) {
  if (!c.origin)     c.origin     = { name: '', effect: '' };
  if (!c.anomalies)  c.anomalies  = [];
  if (!c.skills)     c.skills     = [];
  if (!c.conditions) c.conditions = ['normal'];
  if (!c.cur)        c.cur        = { hp: 2, sp: 10, ap: 3, san: 10 };
  if (c.level == null) c.level    = 0;
  if (!c.images)       c.images   = [];
  if (c.imageIndex == null) c.imageIndex = 0;
  return c;
}

function gc(id) { return chars.find(c => c.id === id); }
function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function makeChar() {
  return {
    id:    uid(),
    name:  '', job: '', gender: '',
    level: 0,
    stats: { str: 10, dex: 10, vit: 10, spi: 10, agi: 10, rei: 10 },
    cur:   { hp: 2, sp: 10, ap: 3, san: 10 },
    talentRolled: false, talentTotal: 0, talentDice: [0, 0],
    abilities:  [],
    origin:     { name: '', effect: '' },
    anomalies:  [],
    skills:     [],
    conditions: ['normal'],
    insanityPattern: '', bg: '', notes: '',
    images: [], imageIndex: 0,
    updatedAt: Date.now(),
  };
}

/* =============================================
   ステータス計算
   ============================================= */

/** 基本ステータスから変動・技能ステータスを計算して返す */
function calcDerived(c) {
  const s = c.stats;
  return {
    hp:     2 + Math.floor(s.vit / 5),
    sp:     s.rei,
    ap:     3 + Math.floor(s.agi / 10),
    ap_rec: 1 + Math.floor(s.agi / 20),
    san:    s.spi,
    melee:  s.str + Math.floor(s.dex / 2),
    shoot:  s.dex,
    dodge:  s.dex + Math.floor(s.agi / 2),
  };
}

/** 才能ポイントの使用量・残量を計算して返す */
function calcTalent(c) {
  const stat = Object.values(c.stats).reduce((a, v) => a + Math.max(0, v - 10), 0);
  const ab   = c.abilities.reduce((a, ab) => {
    let cost = ACOST[ab.type] || 0;
    if (ab.type === 'mutant' && ab.second) cost += 150;
    return a + cost;
  }, 0);
  const levelBonus = c.level || 0;
  const total = c.talentTotal + levelBonus;
  return { stat, ab, used: stat + ab, total, levelBonus, rem: total - stat - ab };
}

/* =============================================
   キャラクター一覧
   ============================================= */

function newChar() {
  const c = makeChar();
  chars.unshift(c);
  saveChars();
  renderList();
  openChar(c.id);
}

function openChar(id) {
  activeId = id;
  previewMode = false;
  renderList();
  renderSheet();
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('sheetArea').classList.remove('hidden');
  // タブレットではシートを開いたらサイドバーを閉じる
  closeSidebar();
}

function renderList() {
  const q  = (document.getElementById('searchInput').value || '').toLowerCase();
  const el = document.getElementById('charList');
  el.innerHTML = '';
  chars
    .filter(c => !q || (c.name || '').toLowerCase().includes(q))
    .forEach(c => {
      const d = document.createElement('div');
      d.className = 'char-item' + (c.id === activeId ? ' active' : '');
      d.innerHTML = `
        <div class="char-item-name">${c.name || '（名無し）'}</div>
        <div class="char-item-sub">${c.job || '職業未設定'}</div>
        <span class="char-badge">OPEN</span>
      `;
      d.onclick = () => openChar(c.id);
      el.appendChild(d);
    });
}

/* =============================================
   サイドバー（タブレット用ドロワー）
   ============================================= */

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebarOverlay');
  const isOpen = sb.classList.contains('open');
  if (isOpen) {
    sb.classList.remove('open');
    ov.classList.add('hidden');
  } else {
    sb.classList.add('open');
    ov.classList.remove('hidden');
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

/* =============================================
   シートレンダリング
   ============================================= */

function renderSheet() {
  const c = gc(activeId);
  if (!c) return;

  const d  = calcDerived(c);
  const tr = calcTalent(c);
  const ts = new Date(c.updatedAt).toLocaleString('ja-JP');
  const rc = tr.rem < 0 ? '#d07070' : tr.rem < 30 ? 'var(--accent)' : 'var(--ink)';

  const diceHTML = c.talentRolled
    ? `<div class="dice-result">${c.talentTotal}</div>
       <div class="dice-break">${c.talentDice[0]} + ${c.talentDice[1]}</div>`
    : `<div class="dice-result" style="color:var(--ink-faint)">—</div>
       <div class="dice-break">未ロール</div>`;

  const BASE_STATS = [
    ['str', '筋力',     '対抗R・ダメージ'],
    ['dex', '技量',     '武器・技能'],
    ['vit', '生命力',   'HP計算'],
    ['spi', '精神力',   'SAN計算'],
    ['agi', '行動力',   'AP・移動'],
    ['rei', '霊威保有量','SP最大値'],
  ];

  const abHTML = c.abilities.map((ab, i) => `
    <div class="ability-card">
      <div class="ability-head">
        <select class="fi" style="width:120px;font-size:12px" onchange="updAbType(${i},this.value)">
          <option value="fixed"  ${ab.type==='fixed'  ? 'selected':''}>固定型 (50pt)</option>
          <option value="growth" ${ab.type==='growth' ? 'selected':''}>成長型 (80pt)</option>
          <option value="evolve" ${ab.type==='evolve' ? 'selected':''}>進化型 (110pt)</option>
          <option value="mutant" ${ab.type==='mutant' ? 'selected':''}>変異型 (140pt)</option>
        </select>
        ${ab.type === 'mutant' ? `
          <label style="font-size:12px;color:var(--ink-dim);display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">
            <input type="checkbox" ${ab.second ? 'checked' : ''} onchange="updAbField(${i},'second',this.checked)" style="width:18px;height:18px">
            第2異能(+150pt)
          </label>` : ''}
        <span style="font-size:11px;color:var(--ink-dim);margin-left:auto">
          ${ACOST[ab.type] || 0}${ab.type === 'mutant' && ab.second ? '+150' : ''}pt
        </span>
        <button class="btn btn-sm btn-d" onclick="rmAbility(${i})">✕</button>
      </div>
      <div class="ability-fields">
        <div class="field">
          <div class="field-label">異能名</div>
          <input class="fi" placeholder="名称..." value="${ab.name}" oninput="updAbField(${i},'name',this.value)"/>
        </div>
        <div class="field">
          <div class="field-label">発動条件</div>
          <input class="fi" placeholder="常時 / 条件..." value="${ab.trigger}" oninput="updAbField(${i},'trigger',this.value)"/>
        </div>
        <div class="field" style="grid-column:1/-1">
          <div class="field-label">効果</div>
          <textarea class="fi" rows="2" oninput="updAbField(${i},'effect',this.value)">${ab.effect}</textarea>
        </div>
      </div>
    </div>`).join('');

  const anomalyHTML = buildAnomalyHTML(c);
  const skHTML      = buildSkillHTML(c);
  const condHTML    = buildCondHTML(c);

  document.getElementById('sheetArea').innerHTML = `
  <div class="sheet">

    <!-- ヘッダー -->
    <div class="sheet-header">
      <div style="flex:1">
        <input class="sheet-title" placeholder="キャラクター名..." value="${c.name}" oninput="upd('name',this.value)"/>
        <div class="sheet-meta">最終更新: ${ts}</div>
      </div>
      <div style="display:flex;gap:8px;margin-left:16px;margin-top:6px;flex-shrink:0">
        <button class="btn btn-sm" onclick="togglePreview()">👁 プレビュー</button>
        <button class="btn btn-d btn-sm" onclick="promptDel('${c.id}')">削除</button>
      </div>
    </div>

    <!-- 基本情報 -->
    <div class="section">
      <div class="section-title">基本情報</div>
      <div class="field-grid">
        <div class="field">
          <div class="field-label">職業</div>
          <input class="fi" placeholder="—" value="${c.job}" oninput="upd('job',this.value)"/>
        </div>
        <div class="field">
          <div class="field-label">性別</div>
          <input class="fi" placeholder="—" value="${c.gender}" oninput="upd('gender',this.value)"/>
        </div>
      </div>
    </div>

    <!-- キャラクター画像 -->
    <div class="section">
      <div class="section-title">キャラクター画像</div>
      <div id="img_section">
        <div style="height:80px;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:13px">読み込み中...</div>
      </div>
    </div>

    <!-- レベル & 才能ポイント -->
    <div class="section">
      <div class="section-title">レベル & 才能ポイント</div>

      <!-- レベル -->
      <div style="background:var(--surface3);border:1px solid var(--border2);border-radius:4px;padding:14px 18px;margin-bottom:12px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div>
          <div class="t-label" style="margin-bottom:6px">現在レベル <span style="color:var(--ink-faint);font-size:9px">（0〜540）</span></div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="sb" onclick="chgLevel(-1)">−</button>
            <span style="font-family:var(--font-display);font-size:32px;font-weight:600;color:var(--ink);min-width:52px;text-align:center" id="lv_disp">${c.level}</span>
            <button class="sb" onclick="chgLevel(1)">＋</button>
          </div>
        </div>
        <div style="border-left:1px solid var(--border2);padding-left:20px;flex:1;min-width:160px">
          <div class="t-label" style="margin-bottom:4px">レベルボーナス</div>
          <div style="font-size:18px;font-weight:500;color:var(--accent)" id="lv_bonus">+${c.level}pt</div>
          <div class="note" style="margin-top:4px">レベル1上昇ごとに才能ポイント+1</div>
        </div>
      </div>

      <!-- 2D100ロール -->
      <div class="talent-box">
        <div style="text-align:center">
          ${diceHTML}
          <button class="btn btn-dice" style="margin-top:10px" onclick="doRoll()">
            🎲 ${c.talentRolled ? '再ロール' : 'ロール'}
          </button>
        </div>
        <div class="talent-info">
          <div class="t-label">総才能ポイント</div>
          <div style="font-size:13px;color:var(--ink-dim);margin-bottom:6px" id="t_breakdown">
            ${c.talentRolled ? `2D100: ${c.talentTotal}pt ＋ Lv.ボーナス: ${tr.levelBonus}pt` : '—'}
          </div>
          <div class="t-label">残りポイント</div>
          <div class="t-rem" id="t_rem" style="color:${rc}">
            ${c.talentRolled ? tr.rem : '—'}<span>pt</span>
          </div>
          ${c.talentRolled
            ? `<div class="t-used" id="t_used">ステータス: ${tr.stat}pt / 異能: ${tr.ab}pt / 合計消費: ${tr.used}pt / 総計: ${tr.total}pt</div>`
            : ''}
        </div>
      </div>
    </div>

    <!-- ステータス -->
    <div class="section">
      <div class="section-title">ステータス（初期値10・消費1pt=+1）</div>
      <div class="g6">
        ${BASE_STATS.map(([k, n, sub]) => `
        <div class="sc">
          <div class="sn">${n}</div>
          <div class="ss">${sub}</div>
          <div class="sv" id="sv_${k}">${c.stats[k]}</div>
          <div class="sc-ctrl">
            <button class="sb" onclick="chgStat('${k}',-1)">−</button>
            <button class="sb" onclick="chgStat('${k}',1)">＋</button>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- 変動ステータス -->
    <div class="section">
      <div class="section-title">変動ステータス（最大値・自動計算）</div>
      <div class="g4">
        <div class="sc dv"><div class="sn">HP 耐久値</div><div class="sv au" id="dv_hp">${d.hp}</div><div class="ss">生命力5毎+1（初期2）</div></div>
        <div class="sc dv"><div class="sn">SP 霊威</div><div class="sv au" id="dv_sp">${d.sp}</div><div class="ss">霊威保有量と同値</div></div>
        <div class="sc dv"><div class="sn">AP 行動力</div><div class="sv au" id="dv_ap">${d.ap}</div><div class="ss">初期3・回復<span id="dv_rec">${d.ap_rec}</span>/T</div></div>
        <div class="sc dv"><div class="sn">SAN 正気度</div><div class="sv au" id="dv_san">${d.san}</div><div class="ss">精神力と同値</div></div>
      </div>
    </div>

    <!-- 技能ステータス -->
    <div class="section">
      <div class="section-title">技能ステータス（自動計算）</div>
      <div class="g3">
        <div class="sc cm"><div class="sn">近接格闘</div><div class="sv au" id="dv_melee">${d.melee}</div><div class="ss">筋力＋技量/2</div></div>
        <div class="sc cm"><div class="sn">射撃攻撃</div><div class="sv au" id="dv_shoot">${d.shoot}</div><div class="ss">技量</div></div>
        <div class="sc cm"><div class="sn">回避</div><div class="sv au" id="dv_dodge">${d.dodge}</div><div class="ss">技量＋行動力/2</div></div>
      </div>
    </div>

    <!-- 現在値トラッカー -->
    <div class="section">
      <div class="section-title">現在値トラッカー</div>
      <div class="res-grid">
        ${['hp','sp','ap','san'].map(r => `
        <div class="res-card">
          <div class="res-name">${r.toUpperCase()} <span style="color:var(--ink-faint);font-size:9px">/ ${d[r]}</span></div>
          <div class="res-track" id="tr_${r}">${buildResPips(r, c.cur[r], d[r])}</div>
          <div class="res-num" id="rn_${r}">${c.cur[r]} / ${d[r]}</div>
        </div>`).join('')}
      </div>
      <div style="margin-top:14px">
        <div class="field-label" style="margin-bottom:6px">状態異常</div>
        <div class="cond-row" id="condRow">${condHTML}</div>
      </div>
    </div>

    <!-- 異能 -->
    <div class="section">
      <div class="section-title">異能</div>
      <div class="ability-list" id="abilityList">${abHTML}</div>
      <button class="btn-ghost" onclick="addAbility()">＋ 異能を追加</button>
      <div class="note">成長・進化型の成長コスト = 取得ポイントの半分 / 変異型：+150ptで第2異能取得可能</div>
    </div>

    <!-- パッシブスキル -->
    <div class="section">
      <div class="section-title">パッシブスキル</div>

      <!-- オリジン（固定） -->
      <div style="margin-bottom:22px">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
          <span style="font-size:15px;font-weight:500;font-family:var(--font-display)">背景技能</span>
          <ruby style="font-size:12px;color:var(--ink-dim)">オリジン<rt style="font-size:9px;letter-spacing:0.08em;color:var(--ink-faint)">ORIGIN</rt></ruby>
          <span style="font-size:9px;letter-spacing:0.1em;color:var(--accent);border:1px solid var(--border);padding:2px 8px;border-radius:2px;margin-left:4px">固定・削除不可</span>
        </div>
        <div style="background:var(--surface4);border:1px solid var(--border);border-radius:4px;padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <div class="field-label">スキル名</div>
            <input class="fi" placeholder="スキル名称..." value="${c.origin.name}" oninput="updOrigin('name',this.value)"/>
          </div>
          <div class="field" style="grid-column:1/-1">
            <div class="field-label">効果・説明</div>
            <textarea class="fi" rows="2" oninput="updOrigin('effect',this.value)">${c.origin.effect}</textarea>
          </div>
        </div>
        <div class="note">自PCの生い立ちに関係するスキル。最初から1つ所持。GMが用意した選択肢から選ぶ。</div>
      </div>

      <!-- アノマリー（任意追加） -->
      <div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
          <span style="font-size:15px;font-weight:500;font-family:var(--font-display)">特異技能</span>
          <ruby style="font-size:12px;color:var(--ink-dim)">アノマリー<rt style="font-size:9px;letter-spacing:0.08em;color:var(--ink-faint)">ANOMALY</rt></ruby>
          <span style="font-size:9px;letter-spacing:0.1em;color:#aab;border:1px solid rgba(100,100,200,0.3);padding:2px 8px;border-radius:2px;margin-left:4px">任意追加</span>
        </div>
        <div class="skill-list" id="anomalyList">${anomalyHTML}</div>
        <button class="btn-ghost" onclick="addAnomaly()">＋ 特異技能を追加</button>
        <div class="note">PLが独自に考案するスキル。最初は所持していない。内容はGMが判断する。</div>
      </div>
    </div>

    <!-- バトルスキル -->
    <div class="section">
      <div class="section-title">バトルスキル</div>
      <div class="skill-list" id="skillList">${skHTML}</div>
      <button class="btn-ghost" onclick="addSkill()">＋ バトルスキルを追加</button>
      <div class="note">戦闘で使用するスキル。非戦闘時にも使用可。組み立て時制限あり。</div>
    </div>

    <!-- 狂気パターン -->
    <div class="section">
      <div class="section-title">狂気パターン</div>
      <textarea class="fi" style="width:100%" placeholder="狂気時の行動パターン（SAN全損時・1D10ターン継続）..." oninput="upd('insanityPattern',this.value)">${c.insanityPattern}</textarea>
    </div>

    <!-- 背景・設定 -->
    <div class="section">
      <div class="section-title">背景・設定</div>
      <textarea class="fi" style="width:100%" placeholder="キャラクターの背景、出自、動機..." oninput="upd('bg',this.value)">${c.bg}</textarea>
    </div>

    <!-- メモ -->
    <div class="section">
      <div class="section-title">メモ</div>
      <textarea class="fi" style="width:100%" placeholder="装備、人間関係、セッション中のメモ..." oninput="upd('notes',this.value)">${c.notes}</textarea>
    </div>

  </div>

  <!-- 保存バー -->
  <div class="save-bar">
    <button class="btn btn-acc" onclick="saveNow()">保存する</button>
    <div class="save-st" id="saveStatus"></div>
  </div>`;

  // 画像セクションを非同期で描画（IndexedDB読み込み）
  renderImageSection(c);
}

/* =============================================
   HTMLビルダー（部分レンダリング用）
   ============================================= */

function buildResPips(type, cur, max) {
  let h = '';
  for (let i = 1; i <= Math.max(max, 1); i++) {
    h += `<div class="rp ${type}${i <= cur ? ' on' : ''}" onclick="setRes('${type}',${i},${max})"></div>`;
  }
  return h;
}

function buildCondHTML(c) {
  return COND.map(s => {
    const active = c.conditions.includes(s.id);
    return `<div class="chip${active ? ' ' + s.c : ''}" onclick="toggleCond('${s.id}')">${s.l}</div>`;
  }).join('');
}

function buildAnomalyHTML(c) {
  return c.anomalies.map((sk, i) => `
    <div class="skill-row">
      <input class="fi" style="flex:1" placeholder="特異技能名..." value="${sk.name}" oninput="updAnomalyField(${i},'name',this.value)"/>
      <div class="pips">${[1,2,3,4,5].map(p =>
        `<div class="pip${sk.level >= p ? ' on' : ''}" onclick="setAnomalyLv(${i},${p})"></div>`
      ).join('')}</div>
      <button class="btn btn-sm btn-d" onclick="rmAnomaly(${i})">✕</button>
    </div>`).join('');
}

function buildSkillHTML(c) {
  return c.skills.map((sk, i) => `
    <div class="skill-row">
      <input class="fi" style="flex:1" placeholder="バトルスキル名..." value="${sk.name}" oninput="updSkField(${i},'name',this.value)"/>
      <div class="pips">${[1,2,3,4,5].map(p =>
        `<div class="pip${sk.level >= p ? ' on' : ''}" onclick="setSkLv(${i},${p})"></div>`
      ).join('')}</div>
      <button class="btn btn-sm btn-d" onclick="rmSkill(${i})">✕</button>
    </div>`).join('');
}

/* =============================================
   フィールド更新
   ============================================= */

function upd(key, val) {
  const c = gc(activeId); if (!c) return;
  c[key] = val;
  c.updatedAt = Date.now();
  if (key === 'name') renderList();
  setSt('');
}

/* =============================================
   才能ポイント・ダイスロール
   ============================================= */

function doRoll() {
  const c = gc(activeId); if (!c) return;
  const d1 = Math.ceil(Math.random() * 100);
  const d2 = Math.ceil(Math.random() * 100);
  c.talentDice  = [d1, d2];
  c.talentTotal = d1 + d2;
  c.talentRolled = true;
  setSt('');
  renderSheet();
}

/* =============================================
   ステータス操作
   ============================================= */

function chgLevel(delta) {
  const c = gc(activeId); if (!c) return;
  c.level = Math.max(0, Math.min(540, (c.level || 0) + delta));
  // レベル表示を更新
  const disp  = document.getElementById('lv_disp');
  const bonus = document.getElementById('lv_bonus');
  if (disp)  disp.textContent  = c.level;
  if (bonus) bonus.textContent = `+${c.level}pt`;
  refreshDerived();
  setSt('');
}

function chgStat(k, delta) {
  const c = gc(activeId); if (!c) return;
  if (delta > 0 && c.talentRolled) {
    const tr = calcTalent(c);
    if (tr.rem < 1) { setSt('pts'); return; }
  }
  c.stats[k] = Math.max(1, Math.min(99, c.stats[k] + delta));
  const el = document.getElementById('sv_' + k);
  if (el) el.textContent = c.stats[k];
  refreshDerived();
  setSt('');
}

function refreshDerived() {
  const c = gc(activeId); if (!c) return;
  const d = calcDerived(c);

  const ids = { hp: d.hp, sp: d.sp, ap: d.ap, san: d.san, melee: d.melee, shoot: d.shoot, dodge: d.dodge };
  for (const [k, v] of Object.entries(ids)) {
    const el = document.getElementById('dv_' + k); if (el) el.textContent = v;
  }
  const rec = document.getElementById('dv_rec'); if (rec) rec.textContent = d.ap_rec;

  // 才能残量を更新
  const tr  = calcTalent(c);
  const rc  = tr.rem < 0 ? '#d07070' : tr.rem < 30 ? 'var(--accent)' : 'var(--ink)';
  const rem = document.getElementById('t_rem');
  if (rem && c.talentRolled) { rem.style.color = rc; rem.innerHTML = `${tr.rem}<span>pt</span>`; }
  const tu = document.getElementById('t_used');
  if (tu && c.talentRolled) tu.textContent = `ステータス: ${tr.stat}pt / 異能: ${tr.ab}pt / 合計消費: ${tr.used}pt / 総計: ${tr.total}pt`;
  const tb = document.getElementById('t_breakdown');
  if (tb && c.talentRolled) tb.textContent = `2D100: ${c.talentTotal}pt ＋ Lv.ボーナス: ${tr.levelBonus}pt`;

  // cur値がmaxを超えていたらクランプ
  ['hp', 'sp', 'ap', 'san'].forEach(r => {
    const max = d[r];
    if (c.cur[r] > max) { c.cur[r] = max; refreshTrack(r, max); }
  });
}

/* =============================================
   リソーストラッカー
   ============================================= */

function setRes(type, val, max) {
  const c = gc(activeId); if (!c) return;
  const actualMax = calcDerived(c)[type];
  c.cur[type] = c.cur[type] === val ? val - 1 : val;
  if (c.cur[type] < 0) c.cur[type] = 0;
  refreshTrack(type, actualMax);
  setSt('');

  // HPに応じて状態を自動付与
  if (type === 'hp') {
    if (c.cur.hp <= 0) autoSetCond('faint');
    else if (c.cur.hp / actualMax <= 0.5) autoSetCond('injured');
    else clearConds(['faint', 'injured']);
  }
  // SANに応じて状態を自動付与
  if (type === 'san') {
    if (c.cur.san <= 0) autoSetCond('insane');
    else if (c.cur.san / actualMax <= 0.5) autoSetCond('confused');
    else clearConds(['insane', 'confused']);
  }
}

function refreshTrack(type, max) {
  const c = gc(activeId); if (!c) return;
  const track = document.getElementById('tr_' + type);
  const num   = document.getElementById('rn_' + type);
  if (!track || !num) return;
  track.innerHTML = buildResPips(type, c.cur[type], max);
  num.textContent = `${c.cur[type]} / ${max}`;
}

/* =============================================
   状態異常
   ============================================= */

function autoSetCond(id) {
  const c = gc(activeId); if (!c) return;
  if (!c.conditions.includes(id)) {
    c.conditions = c.conditions.filter(x => x !== 'normal');
    c.conditions.push(id);
    renderCondRow();
  }
}

function clearConds(ids) {
  const c = gc(activeId); if (!c) return;
  c.conditions = c.conditions.filter(x => !ids.includes(x));
  if (!c.conditions.length) c.conditions = ['normal'];
  renderCondRow();
}

function toggleCond(id) {
  const c = gc(activeId); if (!c) return;
  if (id === 'normal') {
    c.conditions = ['normal'];
  } else {
    const idx = c.conditions.indexOf(id);
    if (idx >= 0) c.conditions.splice(idx, 1);
    else { c.conditions = c.conditions.filter(x => x !== 'normal'); c.conditions.push(id); }
    if (!c.conditions.length) c.conditions = ['normal'];
  }
  renderCondRow();
  setSt('');
}

function renderCondRow() {
  const c = gc(activeId); if (!c) return;
  const el = document.getElementById('condRow'); if (!el) return;
  el.innerHTML = buildCondHTML(c);
}

/* =============================================
   異能
   ============================================= */

function addAbility() {
  const c = gc(activeId); if (!c) return;
  c.abilities.push({ name: '', type: 'fixed', trigger: '', effect: '', second: false });
  renderSheet(); setSt('');
}
function rmAbility(i) {
  const c = gc(activeId); if (!c) return;
  c.abilities.splice(i, 1); renderSheet(); setSt('');
}
function updAbType(i, v) {
  const c = gc(activeId); if (!c) return;
  c.abilities[i].type = v; renderSheet(); setSt('');
}
function updAbField(i, k, v) {
  const c = gc(activeId); if (!c) return;
  c.abilities[i][k] = v;
  if (k === 'second') refreshDerived();
  setSt('');
}

/* =============================================
   オリジン（固定パッシブスキル）
   ============================================= */

function updOrigin(k, v) {
  const c = gc(activeId); if (!c) return;
  c.origin[k] = v; setSt('');
}

/* =============================================
   アノマリー（任意パッシブスキル）
   ============================================= */

function addAnomaly() {
  const c = gc(activeId); if (!c) return;
  c.anomalies.push({ name: '', level: 0 }); redrawAnomalies(); setSt('');
}
function rmAnomaly(i) {
  const c = gc(activeId); if (!c) return;
  c.anomalies.splice(i, 1); redrawAnomalies(); setSt('');
}
function updAnomalyField(i, k, v) {
  const c = gc(activeId); if (!c) return;
  c.anomalies[i][k] = v; setSt('');
}
function setAnomalyLv(i, lv) {
  const c = gc(activeId); if (!c) return;
  c.anomalies[i].level = c.anomalies[i].level === lv ? 0 : lv;
  redrawAnomalies(); setSt('');
}
function redrawAnomalies() {
  const c = gc(activeId); if (!c) return;
  const el = document.getElementById('anomalyList'); if (!el) return;
  el.innerHTML = buildAnomalyHTML(c);
}

/* =============================================
   バトルスキル
   ============================================= */

function addSkill() {
  const c = gc(activeId); if (!c) return;
  c.skills.push({ name: '', level: 0 }); redrawSkills(); setSt('');
}
function rmSkill(i) {
  const c = gc(activeId); if (!c) return;
  c.skills.splice(i, 1); redrawSkills(); setSt('');
}
function updSkField(i, k, v) {
  const c = gc(activeId); if (!c) return;
  c.skills[i][k] = v; setSt('');
}
function setSkLv(i, lv) {
  const c = gc(activeId); if (!c) return;
  c.skills[i].level = c.skills[i].level === lv ? 0 : lv;
  redrawSkills(); setSt('');
}
function redrawSkills() {
  const c = gc(activeId); if (!c) return;
  const el = document.getElementById('skillList'); if (!el) return;
  el.innerHTML = buildSkillHTML(c);
}

/* =============================================
   保存・ステータス表示
   ============================================= */

function saveNow() {
  const c = gc(activeId); if (!c) return;
  c.updatedAt = Date.now();
  saveChars();
  renderList();
  const el = document.querySelector('.sheet-meta');
  if (el) el.textContent = '最終更新: ' + new Date(c.updatedAt).toLocaleString('ja-JP');
  setSt('saved');
}

function setSt(s) {
  const el = document.getElementById('saveStatus'); if (!el) return;
  if (s === 'saved')    { el.textContent = '保存しました'; el.className = 'save-st ok'; }
  else if (s === 'pts') { el.textContent = '才能ポイントが足りません'; el.className = 'save-st err'; }
  else                  { el.textContent = '未保存の変更があります'; el.className = 'save-st'; }
}

/* =============================================
   削除
   ============================================= */

function promptDel(id) {
  delTarget = id;
  const c = gc(id);
  document.getElementById('delModalBody').textContent = `「${c.name || '名無し'}」を削除します。この操作は元に戻せません。`;
  document.getElementById('delModal').classList.remove('hidden');
}
function closeDelModal() {
  delTarget = null;
  document.getElementById('delModal').classList.add('hidden');
}
function confirmDel() {
  chars = chars.filter(c => c.id !== delTarget);
  saveChars(); closeDelModal();
  activeId = null; renderList();
  document.getElementById('sheetArea').classList.add('hidden');
  document.getElementById('welcomeScreen').classList.remove('hidden');
}

/* =============================================
   書き出し・読み込み
   ============================================= */

function exportAll() {
  const blob = new Blob([JSON.stringify(chars, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'schwarze_kiste_characters.json';
  a.click();
}

function importFile() {
  document.getElementById('fileInput').click();
}

function loadFile(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data)) {
        chars = [...data.map(migrateChar), ...chars];
        saveChars(); renderList();
      } else {
        alert('形式が正しくありません');
      }
    } catch {
      alert('読み込みに失敗しました');
    }
  };
  r.readAsText(f);
}

/* =============================================
   初期化
   ============================================= */

loadChars();
renderList();

/* =============================================
   IndexedDB — 画像ストレージ
   ============================================= */

const DB_NAME    = 'schwarze_kiste_images';
const DB_VERSION = 1;
const DB_STORE   = 'images';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(DB_STORE)) {
        d.createObjectStore(DB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbPut(key, data) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ key, data });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function dbGet(key) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const req = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
    req.onsuccess = e => resolve(e.target.result?.data || null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbDelete(key) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

function imgKey(charId, imgId) { return charId + '::' + imgId; }

/* =============================================
   画像セクション レンダリング
   ============================================= */

async function renderImageSection(c) {
  const section = document.getElementById('img_section');
  if (!section) return;

  const imgs = c.images || [];
  const idx  = c.imageIndex != null ? c.imageIndex : 0;
  const cur  = imgs[idx] || null;

  let mainHTML = '';
  if (cur) {
    const blob = await dbGet(imgKey(c.id, cur.id));
    if (blob) {
      mainHTML = `
        <div style="text-align:center;margin-bottom:14px">
          <img src="${blob}" alt="${cur.label}" style="max-width:100%;max-height:360px;border-radius:4px;border:1px solid var(--border);object-fit:contain;background:var(--surface4)" />
          <div style="margin-top:8px;font-size:12px;color:var(--ink-dim)">${cur.label || '（ラベルなし）'}</div>
        </div>`;
    }
  } else {
    mainHTML = `<div style="height:100px;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:13px;border:1px dashed var(--border2);border-radius:4px;margin-bottom:14px">画像なし</div>`;
  }

  const navHTML = imgs.length > 1 ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px">
      <button class="sb" onclick="imgNav(-1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>◀</button>
      <span style="font-size:13px;color:var(--ink-dim)">${idx + 1} / ${imgs.length}</span>
      <button class="sb" onclick="imgNav(1)" ${idx === imgs.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▶</button>
    </div>` : imgs.length === 1 ? `<div style="text-align:center;font-size:12px;color:var(--ink-faint);margin-bottom:10px">1 / 1</div>` : '';

  let thumbsHTML = '';
  if (imgs.length > 1) {
    const thumbPromises = imgs.map(async (img, i) => {
      const blob = await dbGet(imgKey(c.id, img.id));
      if (!blob) return '';
      const border = i === idx ? 'var(--accent)' : 'var(--border2)';
      return `<div onclick="imgSelect(${i})" style="cursor:pointer;border:2px solid ${border};border-radius:4px;overflow:hidden;width:56px;height:56px;flex-shrink:0"><img src="${blob}" style="width:100%;height:100%;object-fit:cover"/></div>`;
    });
    const thumbs = await Promise.all(thumbPromises);
    thumbsHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${thumbs.join('')}</div>`;
  }

  const labelField = cur ? `
    <div class="field" style="flex:2;min-width:140px">
      <input class="fi" style="font-size:12px" placeholder="差分名（通常・戦闘 など）" value="${cur.label || ''}" oninput="imgLabel(this.value)"/>
    </div>
    <button class="btn btn-sm btn-d" onclick="imgDelete()">削除</button>` : '';

  section.innerHTML = `
    ${mainHTML}
    ${navHTML}
    ${thumbsHTML}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <label class="btn-ghost" style="margin-top:0;flex:1;text-align:center;cursor:pointer">
        ＋ 画像を追加
        <input type="file" accept="image/*" class="hidden" onchange="imgAdd(event)"/>
      </label>
      ${labelField}
    </div>
    <div class="note" style="margin-top:8px">画像はこのブラウザのみに保存されます。書き出しJSONには含まれません。</div>
  `;
}

/* =============================================
   画像操作
   ============================================= */

function imgNav(delta) {
  const c = gc(activeId); if (!c) return;
  const imgs = c.images || [];
  c.imageIndex = Math.max(0, Math.min(imgs.length - 1, (c.imageIndex || 0) + delta));
  renderImageSection(c);
}

function imgSelect(i) {
  const c = gc(activeId); if (!c) return;
  c.imageIndex = i;
  renderImageSection(c);
}

function imgLabel(val) {
  const c = gc(activeId); if (!c) return;
  const imgs = c.images || [];
  const idx  = c.imageIndex || 0;
  if (imgs[idx]) { imgs[idx].label = val; setSt(''); }
}

async function imgAdd(event) {
  const file = event.target.files[0]; if (!file) return;
  const c = gc(activeId); if (!c) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    const blob  = ev.target.result;
    const imgId = uid();
    const label = file.name.replace(/\.[^.]+$/, '');
    if (!c.images) c.images = [];
    c.images.push({ id: imgId, label });
    c.imageIndex = c.images.length - 1;
    await dbPut(imgKey(c.id, imgId), blob);
    setSt('');
    renderImageSection(c);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function imgDelete() {
  const c = gc(activeId); if (!c) return;
  const imgs = c.images || [];
  const idx  = c.imageIndex || 0;
  const cur  = imgs[idx]; if (!cur) return;
  await dbDelete(imgKey(c.id, cur.id));
  c.images.splice(idx, 1);
  c.imageIndex = Math.max(0, idx - 1);
  setSt('');
  renderImageSection(c);
}

openDB();

/* =============================================
   プレビューモード
   ============================================= */

let previewMode = false;

function togglePreview() {
  previewMode = !previewMode;
  if (previewMode) renderPreview();
  else             renderSheet();
}

async function renderPreview() {
  const c = gc(activeId); if (!c) return;
  const d  = calcDerived(c);
  const tr = calcTalent(c);

  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('sheetArea').classList.remove('hidden');

  // 現在画像を取得
  const imgs = c.images || [];
  const idx  = c.imageIndex || 0;
  const curImg = imgs[idx] || null;
  let imgHTML = '';
  if (curImg) {
    const blob = await dbGet(imgKey(c.id, curImg.id));
    if (blob) {
      imgHTML = `<img src="${blob}" alt="${curImg.label}" style="width:100%;max-height:420px;object-fit:contain;border-radius:6px;border:1px solid var(--border);background:var(--surface4);display:block" />
      ${imgs.length > 1 ? `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">${curImg.label || ''} (${idx+1}/${imgs.length})</div>` : curImg.label ? `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--ink-dim)">${curImg.label}</div>` : ''}`;
    }
  }

  // 状態異常
  const activeConds = COND.filter(s => c.conditions.includes(s.id) && s.id !== 'normal');
  const condHTML = activeConds.length
    ? activeConds.map(s => `<span class="chip ${s.c}" style="font-size:12px">${s.l}</span>`).join('')
    : `<span style="font-size:13px;color:var(--ink-dim)">通常</span>`;

  // ステータスバー（現在値/最大値）
  function statBar(type, cur, max, color) {
    const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
    return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <span style="font-size:11px;letter-spacing:0.1em;color:var(--ink-dim)">${type.toUpperCase()}</span>
          <span style="font-family:var(--font-display);font-size:20px;font-weight:600;color:${color}">${cur} <span style="font-size:12px;color:var(--ink-faint)">/ ${max}</span></span>
        </div>
        <div style="height:5px;background:var(--surface4);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>`;
  }

  // 基本ステータス一覧
  const BASE_STATS = [
    ['str','筋力'], ['dex','技量'], ['vit','生命力'],
    ['spi','精神力'], ['agi','行動力'], ['rei','霊威保有量'],
  ];
  const baseStatHTML = BASE_STATS.map(([k, n]) => `
    <div style="text-align:center;background:var(--surface3);border:1px solid var(--border2);border-radius:4px;padding:10px 6px">
      <div style="font-size:9px;letter-spacing:0.12em;color:var(--ink-dim);text-transform:uppercase;margin-bottom:4px">${n}</div>
      <div style="font-family:var(--font-display);font-size:24px;font-weight:600;color:var(--ink)">${c.stats[k]}</div>
    </div>`).join('');

  // 技能
  const combatHTML = [
    ['近接格闘', d.melee, '筋力＋技量/2'],
    ['射撃攻撃', d.shoot, '技量'],
    ['回避',     d.dodge, '技量＋行動力/2'],
  ].map(([n, v, f]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border2)">
      <div>
        <span style="font-size:14px;font-weight:500">${n}</span>
        <span style="font-size:11px;color:var(--ink-faint);margin-left:8px">${f}</span>
      </div>
      <span style="font-family:var(--font-display);font-size:22px;font-weight:600;color:var(--accent)">${v}</span>
    </div>`).join('');

  // 異能
  const abPreviewHTML = c.abilities.length ? c.abilities.map(ab => `
    <div style="background:var(--surface3);border:1px solid var(--border2);border-radius:4px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:14px;font-weight:500;color:var(--ink)">${ab.name || '（名称未定）'}</span>
        <span style="font-size:10px;padding:2px 7px;border-radius:2px;background:var(--accent-dim);color:var(--accent);border:1px solid var(--border)">${ATYPE[ab.type]}</span>
        ${ab.trigger ? `<span style="font-size:11px;color:var(--ink-dim);margin-left:auto">${ab.trigger}</span>` : ''}
      </div>
      ${ab.effect ? `<div style="font-size:13px;color:var(--ink-dim);line-height:1.7;white-space:pre-wrap">${ab.effect}</div>` : ''}
    </div>`).join('')
    : `<div style="color:var(--ink-faint);font-size:13px">なし</div>`;

  // オリジン
  const originHTML = `
    <div style="background:var(--surface4);border:1px solid var(--border);border-radius:4px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:14px;font-weight:500">${c.origin.name || '（未設定）'}</span>
        <span style="font-size:10px;padding:2px 7px;border-radius:2px;background:var(--accent-dim);color:var(--accent);border:1px solid var(--border)">背景技能 / ORIGIN</span>
      </div>
      ${c.origin.effect ? `<div style="font-size:13px;color:var(--ink-dim);line-height:1.7;white-space:pre-wrap">${c.origin.effect}</div>` : ''}
    </div>`;

  // アノマリー
  const anomalyPreviewHTML = c.anomalies.length ? c.anomalies.map(sk => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:13px;flex:1">${sk.name || '（名称未定）'}</span>
      <div style="display:flex;gap:4px">${[1,2,3,4,5].map(p =>
        `<div style="width:12px;height:12px;border-radius:50%;background:${sk.level >= p ? 'var(--accent)' : 'var(--surface4)'};border:1px solid ${sk.level >= p ? 'var(--accent)' : 'var(--border)'}"></div>`
      ).join('')}</div>
    </div>`).join('')
    : `<div style="color:var(--ink-faint);font-size:13px">なし</div>`;

  // バトルスキル
  const skillPreviewHTML = c.skills.length ? c.skills.map(sk => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:13px;flex:1">${sk.name || '（名称未定）'}</span>
      <div style="display:flex;gap:4px">${[1,2,3,4,5].map(p =>
        `<div style="width:12px;height:12px;border-radius:50%;background:${sk.level >= p ? '#c0392b' : 'var(--surface4)'};border:1px solid ${sk.level >= p ? '#c0392b' : 'var(--border)'}"></div>`
      ).join('')}</div>
    </div>`).join('')
    : `<div style="color:var(--ink-faint);font-size:13px">なし</div>`;

  // 背景・メモ
  const bgHTML   = c.bg    ? `<div style="font-size:13px;color:var(--ink-dim);line-height:1.8;white-space:pre-wrap">${c.bg}</div>`   : `<div style="color:var(--ink-faint);font-size:13px">なし</div>`;
  const noteHTML = c.notes ? `<div style="font-size:13px;color:var(--ink-dim);line-height:1.8;white-space:pre-wrap">${c.notes}</div>` : `<div style="color:var(--ink-faint);font-size:13px">なし</div>`;

  function pv_section(title, content) {
    return `
      <div class="section">
        <div class="section-title">${title}</div>
        ${content}
      </div>`;
  }

  document.getElementById('sheetArea').innerHTML = `
  <div class="sheet">

    <!-- プレビューヘッダー -->
    <div class="sheet-header">
      <div style="flex:1">
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;color:var(--accent);line-height:1.2">${c.name || '（名称未定）'}</div>
        <div style="font-size:13px;color:var(--ink-dim);margin-top:4px">
          ${[c.job, c.gender ? c.gender : null].filter(Boolean).join(' ・ ') || ''}
          ${c.level ? `<span style="margin-left:8px;font-size:11px;padding:2px 8px;background:var(--accent-dim);color:var(--accent);border:1px solid var(--border);border-radius:2px">Lv. ${c.level}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-acc" style="margin-left:16px;margin-top:6px;flex-shrink:0" onclick="togglePreview()">✏ 編集</button>
    </div>

    <!-- 2カラムレイアウト（画像 + リソース） -->
    <div class="section" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div>
        ${imgHTML || `<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--ink-faint);font-size:13px;border:1px dashed var(--border2);border-radius:4px">画像なし</div>`}
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">${condHTML}</div>
      </div>
      <div>
        ${statBar('hp',  c.cur.hp,  d.hp,  '#c0392b')}
        ${statBar('sp',  c.cur.sp,  d.sp,  '#5b7ec7')}
        ${statBar('ap',  c.cur.ap,  d.ap,  'var(--accent)')}
        ${statBar('san', c.cur.san, d.san, '#8b5cf6')}
      </div>
    </div>

    ${pv_section('ステータス', `
      <div class="g6" style="margin-bottom:14px">${baseStatHTML}</div>
      <div style="border-top:1px solid var(--border2);padding-top:12px">${combatHTML}</div>
    `)}

    ${pv_section('異能', abPreviewHTML)}

    ${pv_section('パッシブスキル', `
      ${originHTML}
      <div style="margin-top:10px;font-size:11px;color:var(--ink-faint);letter-spacing:0.08em;margin-bottom:8px">特異技能 / ANOMALY</div>
      ${anomalyPreviewHTML}
    `)}

    ${pv_section('バトルスキル', skillPreviewHTML)}

    ${c.insanityPattern ? pv_section('狂気パターン', `<div style="font-size:13px;color:var(--ink-dim);line-height:1.8;white-space:pre-wrap">${c.insanityPattern}</div>`) : ''}

    ${pv_section('背景・設定', bgHTML)}

    ${c.notes ? pv_section('メモ', noteHTML) : ''}

  </div>`;
}
