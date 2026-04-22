/**
 * Sam Gong (三公) — Browser Game Client
 * Connects to Colyseus WS game server via colyseus.js
 */
'use strict';

// ── Config ──────────────────────────────────────────────
const WS_HOST  = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'localhost:2567'
  : window.location.host.replace(/:\d+$/, '') + ':2567';

const API_HOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'localhost:3000'
  : window.location.host.replace(/:\d+$/, '') + ':3000';

const CARD_SUITS = { spade:'♠', heart:'♥', diamond:'♦', club:'♣' };
const SUIT_CLASSES = { spade:'black', heart:'red', diamond:'red', club:'black' };
const RANK_MAP = { A:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',J:'J',Q:'Q',K:'K' };
const HALL_NAMES = { bronze:'青銅廳', silver:'白銀廳', gold:'黃金廳', platinum:'鉑金廳', diamond:'鑽石廳' };
const PHASE_NAMES = { waiting:'等待中', dealing:'發牌', 'banker-bet':'莊家下注', 'player-bet':'玩家下注', showdown:'開牌', settled:'結算' };

// ── State ────────────────────────────────────────────────
let client = null;
let room   = null;
let mySessionId = null;
let myNickname  = '';
let myToken     = null;   // JWT (null in dev mode — bypasses auth)
let gameState   = null;   // latest Colyseus state snapshot
let pfPids      = [];

// ── DOM Refs ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loginScreen  = $('login-screen');
const lobbyScreen  = $('lobby-screen');
const gameScreen   = $('game-screen');
const statusMsg    = $('status-msg');
const connDot      = $('conn-dot');
const connLabel    = $('conn-label');

// ── Screen helpers ────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`${name}-screen`).classList.add('active');
}

function toast(msg, type = '', duration = 2800) {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function addLog(msg, cls = '') {
  const log = $('msg-log');
  if (!log) return;
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = msg;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  if (log.children.length > 60) log.removeChild(log.children[0]);
}

function setConn(state) {
  connDot.className = `conn-dot ${state}`;
  connLabel.textContent = state === 'ok' ? '已連線' : state === 'connecting' ? '連線中...' : '已斷線';
}

// ── Card rendering ────────────────────────────────────────
function renderCard(cardStr, faceDown = false) {
  const div = document.createElement('div');
  if (faceDown || !cardStr) {
    div.className = 'card face-down';
    div.textContent = '🂠';
    return div;
  }
  // cardStr format: "A♠" or "K♥" or "10♦"
  const suitMap = {'♠':'spade','♥':'heart','♦':'diamond','♣':'club'};
  const match = cardStr.match(/^(.+?)(♠|♥|♦|♣)$/);
  if (!match) { div.className='card'; div.textContent=cardStr; return div; }
  const [, rank, suitChar] = match;
  const suit = suitMap[suitChar] || 'spade';
  div.className = `card ${SUIT_CLASSES[suit] || 'black'}`;
  div.innerHTML = `<span class="rank">${rank}</span><span class="suit">${suitChar}</span>`;
  return div;
}

function renderHand(cards, faceDown = false) {
  const wrap = document.createElement('div');
  wrap.className = 'hand-cards';
  const list = Array.isArray(cards) ? cards : [];
  if (list.length === 0) {
    for (let i = 0; i < 3; i++) wrap.appendChild(renderCard(null, true));
  } else {
    list.forEach(c => wrap.appendChild(renderCard(c, faceDown)));
  }
  return wrap;
}

// ── Dev-mode join (no JWT) ─────────────────────────────────
async function devJoin() {
  const nick = $('nick-input').value.trim() || '玩家' + Math.floor(Math.random()*9000+1000);
  myNickname = nick;
  statusMsg.textContent = '連線中...';
  setConn('connecting');
  try {
    if (!window.Colyseus) throw new Error('Colyseus SDK 未載入');
    client = new Colyseus.Client(`ws://${WS_HOST}`);
    // dev mode: pass nickname (no JWT required when NODE_ENV=development)
    room = await client.joinOrCreate('sam_gong', { nickname: nick, token: 'dev' });
    mySessionId = room.sessionId;
    setConn('ok');
    setupRoomHandlers();
    showLobbyThen();
  } catch (e) {
    statusMsg.textContent = '❌ 連線失敗：' + (e.message || e);
    setConn('err');
  }
}

function showLobbyThen() {
  // After joining a room, go straight to game table
  showScreen('game');
  buildGameTable();
}

// ── Room event handlers ───────────────────────────────────
function setupRoomHandlers() {
  if (!room) return;

  room.onStateChange(state => {
    gameState = state;
    updateGameTable(state);
  });

  room.onMessage('chat', msg => {
    addLog(`${msg.nickname}: ${msg.text}`, 'chat');
  });

  room.onMessage('error', msg => {
    toast(msg.message || '伺服器錯誤', 'red');
  });

  room.onMessage('anti_addiction_warning', msg => {
    toast(`⚠️ 防沉迷警告：${msg.message}`, 'red', 6000);
    const overlay = $('anti-addiction-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      $('aa-msg').textContent = msg.message;
    }
  });

  room.onMessage('game_started', () => {
    addLog('🎴 新一局開始！', 'sys');
    toast('新一局開始！', 'gold');
    clearResult();
  });

  room.onMessage('settlement', result => {
    if (!result) return;
    const my = result.players && result.players[mySessionId];
    if (my) {
      const sign = my.net_chips >= 0 ? '+' : '';
      const cls  = my.net_chips >= 0 ? 'win' : 'lose';
      addLog(`結算：${sign}${my.net_chips} 籌碼`, cls);
      showResult(my.net_chips);
    }
    addLog(`抽水：${result.rake || 0}`, 'sys');
  });

  room.onLeave(code => {
    setConn('err');
    addLog(`已離線 (code ${code})`, 'sys');
    toast('已與伺服器斷線', 'red');
  });

  room.onError((code, msg) => {
    toast(`WS 錯誤 ${code}: ${msg}`, 'red');
  });
}

// ── Build static game table DOM ───────────────────────────
function buildGameTable() {
  const gs = $('game-screen');
  if (!gs) return;

  gs.innerHTML = `
    <div class="dev-badge">DEV LOCAL</div>
    <div class="seats-ring" id="seats-ring"></div>

    <div class="table-center">
      <div class="phase-label" id="phase-label">等待中</div>
      <div class="pot-amount" id="pot-amount">0</div>
      <div class="pot-chips" id="pot-chips"></div>
      <div class="hall-label" id="hall-label">青銅廳</div>
    </div>

    <!-- Message log -->
    <div class="msg-log" id="msg-log">
      <p class="sys">🎴 連線成功！歡迎 ${myNickname}</p>
    </div>

    <!-- Chat -->
    <div class="chat-area">
      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="傳送訊息..." maxlength="40"
          onkeydown="if(event.key==='Enter')sendChat()">
        <button onclick="sendChat()">送</button>
      </div>
    </div>

    <!-- Action panel -->
    <div class="action-panel" id="action-panel">
      <span id="action-hint" style="font-size:0.85rem;color:#aaa">等待其他玩家...</span>
      <div id="action-buttons" style="display:flex;gap:10px"></div>
      <div class="bet-input-wrap" id="bet-wrap" style="display:none">
        <label>下注額</label>
        <input type="number" id="bet-amount" value="100" min="100" step="100">
      </div>
    </div>

    <!-- Result overlay -->
    <div class="result-overlay" id="result-overlay">
      <div class="result-title" id="result-title"></div>
      <div class="result-detail" id="result-detail"></div>
      <button class="btn btn-primary" onclick="clearResult()">繼續</button>
    </div>

    <!-- Anti-addiction overlay -->
    <div id="anti-addiction-overlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.85);
      flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:200;backdrop-filter:blur(8px)">
      <div style="font-size:2rem">⚠️</div>
      <div id="aa-msg" style="font-size:1.1rem;color:#ffcc80;text-align:center;max-width:360px"></div>
      <button class="btn btn-primary" onclick="confirmAntiAddiction()">我已了解，繼續遊戲</button>
    </div>

    <div class="conn-bar">
      <span><span class="conn-dot ok" id="conn-dot"></span><span id="conn-label">已連線</span>
        — 房間：${room?.id || '—'} &nbsp;|&nbsp; 我的 ID：${mySessionId || '—'}</span>
      <span><button style="background:none;border:none;color:#ef5350;cursor:pointer;font-size:0.72rem"
        onclick="leaveGame()">離開房間</button></span>
    </div>

    <div class="toast-container" id="toast-container2"></div>
  `;

  // init 6 seats
  buildSeats();
}

function buildSeats() {
  const ring = $('seats-ring');
  if (!ring) return;
  for (let i = 0; i < 6; i++) {
    const seat = document.createElement('div');
    seat.className = `seat seat-${i}`;
    seat.id = `seat-${i}`;
    seat.innerHTML = `
      <div class="seat-avatar" id="seat-avatar-${i}">💺</div>
      <div class="seat-name" id="seat-name-${i}">空位</div>
      <div class="seat-chips" id="seat-chips-${i}"></div>
      <div class="hand-cards" id="seat-cards-${i}"></div>
      <div class="seat-status" id="seat-status-${i}"></div>
    `;
    ring.appendChild(seat);
  }
}

// ── Update table from state ───────────────────────────────
function updateGameTable(state) {
  if (!state) return;
  const phase = state.phase || 'waiting';
  const el = id => document.getElementById(id);

  // Phase + hall
  if (el('phase-label')) el('phase-label').textContent = PHASE_NAMES[phase] || phase;
  if (el('hall-label'))  el('hall-label').textContent  = HALL_NAMES[state.hall] || state.hall || '青銅廳';

  // Pot
  const pot = state.pot || 0;
  if (el('pot-amount')) el('pot-amount').textContent = pot.toLocaleString();
  renderPotChips(pot);

  // Players → seats
  const players = state.players || {};
  const playerList = Object.entries(players);

  // Map mySessionId to seat 0, others follow
  const order = [mySessionId, ...playerList.filter(([id]) => id !== mySessionId).map(([id]) => id)];

  order.forEach((playerId, idx) => {
    if (idx >= 6) return;
    const p = players[playerId];
    if (!p) {
      clearSeat(idx);
      return;
    }
    const isMe = playerId === mySessionId;
    const isBanker = state.banker_session_id === playerId;

    if (el(`seat-avatar-${idx}`)) {
      el(`seat-avatar-${idx}`).textContent = isBanker ? '👑' : (isMe ? '😊' : '👤');
      el(`seat-avatar-${idx}`).className = `seat-avatar${isBanker ? ' banker-highlight' : ''}${isMe ? ' my-seat' : ''}`;
    }
    if (el(`seat-name-${idx}`))   el(`seat-name-${idx}`).textContent  = p.nickname || playerId.slice(-4);
    if (el(`seat-chips-${idx}`))  el(`seat-chips-${idx}`).textContent = (p.chip_balance || 0).toLocaleString() + ' 籌';

    // Cards
    const cardEl = el(`seat-cards-${idx}`);
    if (cardEl) {
      cardEl.innerHTML = '';
      const cards = p.hand || [];
      const reveal = phase === 'showdown' || phase === 'settled' || isMe;
      for (let c = 0; c < 3; c++) {
        cardEl.appendChild(renderCard(cards[c] || null, !reveal || !cards[c]));
      }
    }

    // Status
    const st = el(`seat-status-${idx}`);
    if (st) {
      if (p.folded)       { st.textContent = '棄牌'; st.className = 'seat-status folded'; }
      else if (p.called)  { st.textContent = '跟注'; st.className = 'seat-status called'; }
      else if (isBanker)  { st.textContent = '莊'; st.className = 'seat-status'; }
      else                { st.textContent = ''; st.className = 'seat-status waiting'; }
    }
  });

  // Update action panel
  updateActionPanel(state);
}

function clearSeat(idx) {
  const el = id => document.getElementById(id);
  if (el(`seat-avatar-${idx}`)) el(`seat-avatar-${idx}`).textContent = '💺';
  if (el(`seat-name-${idx}`))   el(`seat-name-${idx}`).textContent   = '空位';
  if (el(`seat-chips-${idx}`))  el(`seat-chips-${idx}`).textContent  = '';
  if (el(`seat-cards-${idx}`))  el(`seat-cards-${idx}`).innerHTML    = '';
  if (el(`seat-status-${idx}`)) el(`seat-status-${idx}`).textContent = '';
}

function renderPotChips(pot) {
  const el = document.getElementById('pot-chips');
  if (!el) return;
  el.innerHTML = '';
  if (pot <= 0) return;
  const denominations = [10000, 5000, 1000, 500, 100];
  const classes       = ['chip-10000','chip-5000','chip-1000','chip-500','chip-100'];
  let remaining = pot;
  denominations.forEach((d, i) => {
    const count = Math.min(Math.floor(remaining / d), 5);
    remaining -= count * d;
    for (let j = 0; j < count; j++) {
      const c = document.createElement('div');
      c.className = `chip ${classes[i]}`;
      c.textContent = d >= 10000 ? '1W' : d >= 1000 ? (d/1000)+'K' : d;
      el.appendChild(c);
    }
  });
}

// ── Action panel logic ────────────────────────────────────
function updateActionPanel(state) {
  const hint    = document.getElementById('action-hint');
  const btns    = document.getElementById('action-buttons');
  const betWrap = document.getElementById('bet-wrap');
  if (!hint || !btns) return;

  const phase    = state.phase || 'waiting';
  const me       = state.players && state.players[mySessionId];
  const isBanker = state.banker_session_id === mySessionId;
  btns.innerHTML = '';
  if (betWrap) betWrap.style.display = 'none';

  if (!me || me.folded) {
    hint.textContent = me?.folded ? '已棄牌，等待下一局' : '觀看中...';
    return;
  }

  if (phase === 'banker-bet' && isBanker) {
    hint.textContent = '您是莊家，請下注：';
    if (betWrap) betWrap.style.display = 'flex';
    addBtn(btns, '下注', 'primary', () => {
      const amt = parseInt(document.getElementById('bet-amount')?.value || '100');
      room?.send('banker_bet', { amount: amt });
    });
  } else if (phase === 'player-bet' && !isBanker && !me.called) {
    hint.textContent = '請選擇行動：';
    if (betWrap) betWrap.style.display = 'flex';
    addBtn(btns, '跟注', 'primary', () => {
      const amt = parseInt(document.getElementById('bet-amount')?.value || '100');
      room?.send('call', { amount: amt });
    });
    addBtn(btns, '看牌', 'secondary', () => room?.send('see_cards'));
    addBtn(btns, '棄牌', 'danger', () => {
      if (confirm('確定要棄牌嗎？')) room?.send('fold');
    });
  } else if (phase === 'waiting') {
    hint.textContent = '等待開始...';
    if (Object.keys(state.players || {}).length >= 2) {
      addBtn(btns, '準備好了', 'primary', () => room?.send('ready'));
    }
  } else if (phase === 'showdown' || phase === 'settled') {
    hint.textContent = '本局結束，等待下一局';
  } else {
    hint.textContent = `${PHASE_NAMES[phase] || phase} — 等待中`;
  }
}

function addBtn(container, label, type, onClick) {
  const b = document.createElement('button');
  b.className = `btn btn-${type}`;
  b.textContent = label;
  b.onclick = onClick;
  container.appendChild(b);
}

// ── Game actions ──────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;
  room?.send('send_chat', { text: input.value.trim() });
  input.value = '';
}

function confirmAntiAddiction() {
  room?.send('confirm_anti_addiction', { type: 'adult' });
  const overlay = document.getElementById('anti-addiction-overlay');
  if (overlay) overlay.style.display = 'none';
}

function leaveGame() {
  if (confirm('確定要離開房間嗎？')) {
    room?.leave();
    room = null;
    showScreen('login');
    setConn('err');
  }
}

function showResult(netChips) {
  const overlay = document.getElementById('result-overlay');
  const title   = document.getElementById('result-title');
  const detail  = document.getElementById('result-detail');
  if (!overlay || !title) return;
  if (netChips > 0) {
    title.textContent = '🏆 勝利！';
    title.className   = 'result-title win';
    detail.textContent = `贏得 +${netChips.toLocaleString()} 籌碼`;
  } else if (netChips < 0) {
    title.textContent = '💸 敗北';
    title.className   = 'result-title lose';
    detail.textContent = `失去 ${netChips.toLocaleString()} 籌碼`;
  } else {
    title.textContent = '🤝 平局';
    title.className   = 'result-title tie';
    detail.textContent = '本局平手';
  }
  overlay.classList.add('show');
}

function clearResult() {
  const o = document.getElementById('result-overlay');
  if (o) o.classList.remove('show');
}

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  showScreen('login');

  // Check server health
  fetch(`http://${API_HOST}/api/v1/health`)
    .then(r => r.json())
    .then(d => {
      statusMsg.textContent = `✅ 伺服器正常 (${d.env || 'dev'})`;
    })
    .catch(() => {
      statusMsg.textContent = '⚠️ 無法連到 API 伺服器，確認 port-forward 是否開啟';
    });

  // Enter key to join
  document.getElementById('nick-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') devJoin();
  });
});

// Expose globals for onclick
window.devJoin           = devJoin;
window.sendChat          = sendChat;
window.confirmAntiAddiction = confirmAntiAddiction;
window.leaveGame         = leaveGame;
window.clearResult       = clearResult;
