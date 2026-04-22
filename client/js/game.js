/**
 * Sam Gong (三公) — Game Client v5
 * Hybrid state: primary source = 'room_state' message (plain JSON)
 * Colyseus schema sync is NOT relied upon (known version mismatch issue)
 */
'use strict';

const WS_HOST = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'localhost:2567' : location.hostname + ':2567';
const API_HOST = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'localhost:3000' : location.hostname + ':3000';

const PHASE_NAMES = {
  waiting:'等待玩家', dealing:'發牌中',
  'banker-bet':'莊家下注', 'player-bet':'玩家下注',
  showdown:'開牌', settled:'結算完成'
};

const SUIT_SYM = { spade:'♠', heart:'♥', diamond:'♦', club:'♣' };

// ── State ─────────────────────────────────────────────────
// _myId  = Colyseus sessionId
// _myPid = player_id from my_session_info
// _myHand     = [{value,suit,point}] from 'myHand' private message
// _revealedHands = { seatIndex: [{value,suit,point}] } from 'showdown_reveal'
// _state  = plain JS mirror of room state (from 'room_state' message)
let _client = null, _room = null, _myId = '', _myPid = '', _nick = '';
let _myHand = [], _revealedHands = {}, _handTypes = {};
// Showdown sequential reveal
let _sdRevealedSet  = new Set();
let _sdSeqTimer     = null;
let _sdDone         = false;
let _sdWinnerSeats  = new Set();
let _settledOnce    = false;
// Bet transition tracking (for coin-to-pot animation)
let _prevPot        = 0;
let _prevActedSeats = new Set();
let _prevPhase      = '';
let _lastBetAnimAt  = 0;   // timestamp of last coin-to-pot animation (ms)
// BUG-20260422-003：發牌動畫狀態
// _dealAnim.inProgress：動畫中（隱藏手牌，依序飛入）
// _dealAnim.dealtForSeat：{seat_index: 已飛到的張數（0-3）}，用於逐張呈現
let _dealAnim = { inProgress: false, dealtForSeat: {} };
let _myHandRevealedCount = 0;   // 自己手牌已翻面的張數（0-3）
// Auto-act (auto-call / auto-min-bet)
let _autoActTimer   = null;
let _autoActAt      = 0;   // ms timestamp when auto-act countdown started
const AUTO_ACT_MS   = 3000; // 3-second countdown before auto-acting
// Bet amount memory
let _lastBankerBet  = 0;   // 上一把莊家押注金額（跨局延續）
let _selectedBetAmt = 0;   // 本把已選定的押注金額
// Audio context (created on first user gesture, reused)
let _audioCtx       = null;
let _state = {
  phase: 'waiting',
  current_pot: 0,
  players: [],
  hall_name: '青銅廳',
  min_bet: 100,
  max_bet: 5000,
  quick_bet_amounts: [],
  current_player_turn_seat: -1,
  banker_seat_index: -1,
  banker_bet_amount: 0,
  settlement: null,
};

// ── Audio ─────────────────────────────────────────────────
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(_) { return null; }
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
// 解鎖：在任何用戶手勢時呼叫，確保後續聲音即時播放
function unlockAudio() { getAudioCtx(); }

// 收銀機入帳聲 — 短促 click + 金屬鈴聲
function playCashRegister() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  // White-noise click (cash drawer)
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 3);
  const ns = ctx.createBufferSource(); ns.buffer = buf;
  const ng = ctx.createGain(); ng.gain.value = 0.35;
  ns.connect(ng); ng.connect(ctx.destination); ns.start(t);
  // Bell tones — cha-ching!
  [[1480,0.02,0.45,0.4],[1976,0.06,0.35,0.35],[2637,0.10,0.28,0.3],[3520,0.14,0.22,0.25]]
    .forEach(([f, s, decay, vol]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t0 = t + s;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
      o.start(t0); o.stop(t0 + decay + 0.05);
    });
}

// 投注入池聲 — 單枚金幣叮
function playCoinDrop() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  [[900,0,0.06,0.18],[600,0.03,0.12,0.14],[400,0.07,0.18,0.10]]
    .forEach(([f, s, decay, vol]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t0 = t + s;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
      o.start(t0); o.stop(t0 + decay + 0.02);
    });
}

// ── Tiny helpers ──────────────────────────────────────────
const $ = id => document.getElementById(id);
function toast(msg, cls='', ms=3000) {
  const c = $('toasts'); if (!c) return;
  const d = document.createElement('div');
  d.className = 'toast ' + cls; d.textContent = msg;
  c.appendChild(d); setTimeout(() => d.remove(), ms);
}
function addLog(msg, cls='') {
  const b = $('chat-log'); if (!b) return;
  const p = document.createElement('p');
  p.className = cls; p.textContent = msg;
  b.appendChild(p);
  if (b.children.length > 100) b.removeChild(b.children[0]);
  b.scrollTop = b.scrollHeight;
}
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setConn(ok) {
  const d = $('cdot'), l = $('clbl');
  if (d) d.className = 'cdot ' + (ok ? 'on' : 'off');
  if (l) l.textContent = ok ? '已連線' : '已斷線';
}
function setText(id, txt) { const e=$(id); if(e) e.textContent=txt; }

// ── Card helpers ──────────────────────────────────────────
function cardToStr(c) {
  if (!c) return null;
  if (typeof c === 'string') return c;
  const sym = SUIT_SYM[c.suit] || c.suit;
  return c.value + sym;
}
function cardHTML(str, back) {
  if (back || !str) return '<div class="card back">🂠</div>';
  const m = String(str).match(/^(.+?)(♠|♥|♦|♣)$/);
  if (!m) return `<div class="card">${esc(str)}</div>`;
  const [,rank,suit] = m;
  const red = suit==='♥'||suit==='♦';
  return `<div class="card ${red?'r':'b'}"><span>${rank}</span><span>${suit}</span></div>`;
}
// BUG-20260422-003：handHTML 支援 dealtCount（發牌動畫用）
// dealtCount = undefined → 一律顯示 3 張（原有行為）
// dealtCount = 0..3 → 前 dealtCount 張顯示（視 reveal 決定正反面），後面顯示 ghost 佔位
function handHTML(cards, reveal, dealtCount) {
  const list = Array.isArray(cards) ? cards : [];
  const shown = (typeof dealtCount === 'number') ? dealtCount : 3;
  let h = '';
  for (let i=0; i<3; i++) {
    if (i >= shown) {
      h += '<div class="card ghost"></div>';  // 尚未發到這張
    } else {
      const str = list[i] ? cardToStr(list[i]) : null;
      h += cardHTML(str, !reveal || !str);
    }
  }
  return h;
}

// ── Login ─────────────────────────────────────────────────
async function joinGame(forceRoomId) {
  _nick = ($('nick').value||'').trim() || '玩家'+(Math.random()*9000+1000|0);
  const roomIdInput = forceRoomId || ($('room-join-id')?.value||'').trim();
  const btn = $('joinbtn');
  const allBtns = [$('joinbtn')];
  allBtns.forEach(b => { if(b) { b.disabled = true; } });
  if (btn) btn.textContent = '連線中...';
  $('errmsg').textContent = '';
  try {
    if (!window.Colyseus) throw new Error('Colyseus SDK 未載入');
    _client = new Colyseus.Client('ws://'+WS_HOST);
    if (roomIdInput) {
      // 有填房間代號 → 加入指定房間
      _room = await _client.joinById(roomIdInput, { nickname:_nick, token:'dev' });
    } else {
      // BUG：無房間代號 → 永遠建立新房間（避免 joinOrCreate 把剛離開的房又配回來）
      _room = await _client.create('sam_gong', { nickname:_nick, token:'dev' });
    }
    _myId   = _room.sessionId;
    _myHand = [];
    _revealedHands = {};
    // Reset local state
    _state = { phase:'waiting', current_pot:0, players:[], hall_name:'青銅廳',
               min_bet:100, max_bet:5000, quick_bet_amounts:[],
               current_player_turn_seat:-1, banker_seat_index:-1,
               banker_bet_amount:0, settlement:null };

    // ── Message handlers ──────────────────────────────────
    // Primary state source: room_state message (plain JSON, bypasses schema)
    _room.onMessage('room_state', d => {
      checkBetTransitions(d);   // 偵測押注動畫（先於 state 更新）
      Object.assign(_state, d);
      renderState(_state);
    });

    _room.onMessage('my_session_info', d => {
      _myId  = d.session_id;
      _myPid = d.player_id;
      addLog('✅ 已入座 player_id: ' + d.player_id.slice(-6), 'sys');
      renderState(_state);  // re-render so "me" is identified
    });

    // Private hand — {cards:[{value,suit,point},…]}
    _room.onMessage('myHand', d => {
      const newHand = d.cards || [];
      // BUG-20260422-003：僅當這是新一局的新手牌時觸發發牌動畫
      // 動畫中收到 myHand（極罕見 race condition）不重啟動畫
      const isFreshDeal = !_dealAnim.inProgress
        && newHand.length === 3
        && (_myHand.length === 0 || newHand.some((c, i) => !_myHand[i] || cardToStr(c) !== cardToStr(_myHand[i])));
      _myHand = newHand;
      if (isFreshDeal && _state && Array.isArray(_state.players) && _state.players.length >= 2) {
        startDealAnimation();
      } else {
        _myHandRevealedCount = 3;
        renderState(_state);
      }
    });

    // Showdown reveal — {hands:{…}, hand_types:{…}}
    _room.onMessage('showdown_reveal', d => {
      _revealedHands = d.hands      || {};
      _handTypes     = d.hand_types || {};
      addLog('🃏 開牌！逐一亮牌評分中...', 'sys');
      // 等錢幣入池動畫結束再開牌（最少 950ms，確保最後一位跟注動畫跑完）
      const coinDelay = Math.max(0, (_lastBetAnimAt + 950) - Date.now());
      setTimeout(() => startShowdownSequence(), coinDelay);
    });

    _room.onMessage('chat_message', d => {
      // 自己發的訊息已在 sendChat() 本地顯示，server 廣播回來跳過
      if (d.player_id && d.player_id === _myPid) return;
      addLog((d.display_name||'玩家')+': '+d.text, 'chat');
    });
    _room.onMessage('send_message_rejected', () => toast('訊息被拒絕','red'));
    _room.onMessage('anti_addiction_warning', d => { toast('⚠️ 防沉迷提示','red',6000); addLog('⚠️ 防沉迷警告','sys'); });
    _room.onMessage('error', d => { toast('❌ '+(d.message||'錯誤'),'red'); addLog('❌ '+(d.message||d.code||''),'sys'); });

    // Schema onStateChange kept only for connection awareness (schema sync unreliable)
    _room.onStateChange(() => { /* state comes via room_state message */ });
    _room.onLeave(code => { setConn(false); addLog('已離線 ('+code+')','sys'); if(code!==1000) toast('已斷線','red'); });
    _room.onError((c,m) => { toast('WS錯誤 '+c,'red'); addLog('WS錯誤: '+m,'sys'); });

    // Show game screen
    $('login').style.display = 'none';
    $('game').style.display  = 'block';
    setConn(true);

    // 顯示房間 ID + 分享按鈕
    const rid = _room.id;
    const shareUrl = location.origin + location.pathname + '?room=' + rid;

    // 把房間 ID 寫進 URL，方便直接複製網址列
    history.replaceState(null, '', '?room=' + rid);

    // 填入大字代號
    const ridEl = $('roomid');
    if (ridEl) ridEl.textContent = rid;

    // 顯示 share-box
    const shareBox = $('share-box');
    if (shareBox) shareBox.style.display = 'flex';

    // 複製按鈕
    const copyBtn = $('copybtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard?.writeText(shareUrl)
          .then(() => {
            copyBtn.textContent = '✅ 已複製！';
            setTimeout(() => { copyBtn.textContent = '📋 複製邀請連結'; }, 2000);
            toast('🔗 連結已複製，貼給朋友即可加入', 'gold', 3000);
          })
          .catch(() => {
            // fallback: select the code text so user can manually copy
            ridEl?.select?.();
            toast('連結：' + shareUrl, 'gold', 6000);
          });
      };
    }

    addLog('✅ 已連線，歡迎 '+_nick+' ｜房間：'+rid,'sys');
    addLog('遊戲將在 2 名玩家加入後自動開始','sys');
    renderState(_state);
  } catch(e) {
    allBtns.forEach(b => { if(b) b.disabled = false; });
    $('joinbtn').textContent = '🎴 建立／加入遊戲';
    $('errmsg').textContent = '❌ '+(e?.message||String(e));
  }
}

// ── Render state ──────────────────────────────────────────
// s = _state (plain JS object, players is a plain array)
function renderState(s) {
  if (!s) return;
  const phase    = s.phase || 'waiting';
  const pot      = s.current_pot || 0;
  const hallName = s.hall_name || '青銅廳';

  setText('c-phase', PHASE_NAMES[phase]||phase);
  // 結算動畫時獎池裡的錢會「飛出去」給贏家/莊家，視覺上獎池應立刻歸 0，
  // 避免中央數字與飛幣動畫語意不一致。Server 在 resetForNextRound（~5 秒後）
  // 才把 current_pot 重置，這裡 Client 提早顯示「—」對齊使用者直覺。
  const potShown = (phase === 'settled') ? 0 : pot;
  setText('c-pot',   potShown > 0 ? potShown.toLocaleString() : '—');
  setText('c-hall',  hallName);

  // Collect players (plain array from room_state message)
  const all = Array.isArray(s.players) ? s.players.slice() : [];
  const me     = _myPid ? all.find(p => p.player_id === _myPid) : all[0] || null;
  const others = all.filter(p => p !== me);
  const ordered = me ? [me, ...others] : [...all];

  // Oval 結算顯示（不 lock 畫面）
  const resEl = $('c-result');
  if (resEl) {
    if (phase === 'settled' && me && s.settlement) {
      let net = null;
      const fm = arr => arr?.forEach(e => { if(e.player_id===_myPid) net=e.net_chips; });
      fm(s.settlement.winners); fm(s.settlement.losers);
      fm(s.settlement.ties);    fm(s.settlement.folders);
      if (net !== null) {
        resEl.textContent = net > 0 ? `+${net.toLocaleString()} 🏆`
                          : net < 0 ? `${net.toLocaleString()} 💸` : '平局 🤝';
        resEl.style.color = net > 0 ? '#f0c040' : net < 0 ? '#ef9a9a' : '#80cbc4';
        // Log once
        if (!_settledOnce) addLog('結算：'+(net>=0?'+':'')+net+' 籌碼', net>=0?'win':'lose');
      } else {
        resEl.textContent = '';
      }
    } else {
      resEl.textContent = '';
    }
  }

  // 第一次進入 settled：金幣飛入 + 收銀機聲
  if (phase === 'settled' && !_settledOnce) {
    _settledOnce = true;
    const playerWinnerSeats = (s.settlement?.winners || []).map(e => e.seat_index);
    _sdWinnerSeats = playerWinnerSeats.length > 0
      ? new Set(playerWinnerSeats)
      : new Set(s.banker_seat_index >= 0 ? [s.banker_seat_index] : []);
    setTimeout(() => triggerSettleAnimation(s, [...ordered]), 120);
  }

  // 新局開始（非開牌/結算）清掉動畫狀態
  if (phase !== 'showdown' && phase !== 'settled') {
    stopShowdownSequence();
    _revealedHands = {};
    _handTypes     = {};
    _sdWinnerSeats = new Set();
    _settledOnce   = false;
    _selectedBetAmt = 0;  // 讓下一把重新從 _lastBankerBet 初始化
    if (resEl) resEl.textContent = '';
  }

  // 建立 settlement seat map（seat_index → net_chips）
  const seatResult = {};
  if (phase === 'settled' && s.settlement) {
    [...(s.settlement.winners||[]),...(s.settlement.losers||[]),
     ...(s.settlement.ties||[]),...(s.settlement.folders||[]),
     ...(s.settlement.insolvent_winners||[])]
      .forEach(e => { seatResult[e.seat_index] = e.net_chips; });
  }

  // ── 6 seats ────────────────────────────────────────────────
  const positions = ['s-bot','s-bl','s-tl','s-top','s-tr','s-br'];
  // Find seat index of the most recently revealed seat (for flipping animation)
  const sdSorted = [..._sdRevealedSet].sort((a,b) => b-a);
  const sdLatest  = sdSorted[0] ?? -1;

  for (let i=0; i<6; i++) {
    const box = $(positions[i]);
    if (!box) continue;
    const p = ordered[i];
    if (!p) {
      box.innerHTML = '<div class="av empty">💺</div><div class="sname muted">空位</div>';
      continue;
    }

    const isMe      = p === me;
    const isBanker  = p.is_banker === true;
    const seatIdx   = p.seat_index;
    const revealed  = _sdRevealedSet.has(seatIdx);   // turn passed in sequence
    const isLatest  = (seatIdx === sdLatest);          // currently being revealed
    const isWinner  = _sdWinnerSeats.has(seatIdx);

    // Card visibility logic
    let cards = [], reveal = false;
    // BUG-20260422-003：發牌動畫中，每個座位只顯示已飛到的張數
    let dealtCount; // undefined = 顯示 3 張（原行為）
    if (phase === 'showdown') {
      if (revealed && _revealedHands[String(seatIdx)]) {
        cards = _revealedHands[String(seatIdx)]; reveal = true;
      } else if (isMe && _myHand.length > 0) {
        // My hand always face-up even before my sequence turn
        cards = _myHand; reveal = true;
      }
    } else if (phase === 'settled') {
      if (_revealedHands[String(seatIdx)]) {
        cards = _revealedHands[String(seatIdx)]; reveal = true;
      } else if (isMe && _myHand.length > 0) {
        cards = _myHand; reveal = true;
      }
    } else {
      if (isMe && _myHand.length > 0) { cards = _myHand; reveal = true; }
    }

    // 發牌動畫：限制此座位顯示張數
    if (_dealAnim.inProgress) {
      const arrived = _dealAnim.dealtForSeat[seatIdx] || 0;
      dealtCount = arrived;
      if (isMe) {
        // 自己：只顯示已翻面的張數為「face-up」，其餘先不渲染（等動畫飛到才出現）
        cards = (_myHand || []).slice(0, _myHandRevealedCount);
        reveal = true;
        dealtCount = _myHandRevealedCount;
      } else {
        // 其他玩家：顯示 arrived 張 face-down（由 cardHTML back 處理）
        cards = new Array(arrived).fill(null);
        reveal = false;
      }
    }

    // Hand-type label — 放在頭像上方
    // active = 正在亮牌（大字閃亮）；done = 已亮（縮小）；pending = 尚未亮
    let evalLbl = '';
    if ((revealed || phase === 'settled') && _handTypes[String(seatIdx)]) {
      const ht      = _handTypes[String(seatIdx)];
      const txt     = ht.is_sam_gong ? '三 公' : ht.points + ' 點';
      const typeCls = ht.is_sam_gong ? 'sam-gong' : ht.points >= 8 ? 'high' : '';
      const stateCls = (isLatest && !_sdDone) ? 'active' : 'done';
      evalLbl = `<div class="eval-lbl ${stateCls} ${typeCls}">${txt}</div>`;
    } else if (phase === 'showdown' && !revealed && !isMe) {
      evalLbl = '<div class="eval-lbl pending">？</div>';
    }

    // Badge
    let badge = '';
    if (p.is_folded) {
      badge = '<span class="bdg fold">棄牌</span>';
    } else if (p.has_acted && !p.is_banker && p.bet_amount > 0) {
      badge = `<span class="bdg call">跟 ${(p.bet_amount||0).toLocaleString()}</span>`;
    } else if (isBanker && p.bet_amount > 0) {
      badge = `<span class="bdg bnk">莊 ${(p.bet_amount||0).toLocaleString()}</span>`;
    } else if (isBanker) {
      badge = '<span class="bdg bnk">莊</span>';
    }

    // 結算泡泡
    let bubble = '';
    if (phase === 'settled' && seatIdx in seatResult) {
      const net = seatResult[seatIdx];
      if (net > 0)      bubble = `<div class="win-bubble">+${net.toLocaleString()} 🏆</div>`;
      else if (net < 0) bubble = `<div class="lose-bubble">${net.toLocaleString()} 💸</div>`;
      else              bubble = `<div class="tie-bubble">±0 🤝</div>`;
    }

    // Winner glow class
    const seatCls = (isWinner && (phase === 'settled' || (_sdDone && phase === 'showdown')))
      ? ' seat-winner' : isLatest && phase === 'showdown' ? ' seat-spotlight' : '';

    // seat position class: s-bot → s-bot, s-bl → s-bl, etc.
    const posClass = positions[i]; // already in the form "s-xxx"
    box.className = `seat ${posClass}${seatCls}`;

    box.innerHTML = `
      ${bubble}
      ${evalLbl}
      <div class="av${isBanker?' bnkav':''}${isMe?' meav':''}">${isBanker?'👑':isMe?'😊':'👤'}</div>
      <div class="sname">${esc(p.display_name||'玩家')}</div>
      <div class="schips">🪙 ${(p.chip_balance||0).toLocaleString()}</div>
      <div class="hand">${handHTML(cards, reveal, dealtCount)}</div>
      <div class="sbdg">${badge}</div>`;
  }

  renderActions(s, me);
  updateActionMarquee(s, me);
}

// 更新操作面板收合時的跑馬燈文字 — 把本局關鍵訊息濃縮成一行滾動
function updateActionMarquee(s, me) {
  const el = $('action-marquee');
  if (!el) return;
  const phase = s?.phase || 'waiting';
  const bits = [];

  if (me?.is_waiting_next_round) {
    bits.push('⏳ 您中途加入，等待下一局');
  } else if (phase === 'waiting') {
    const cnt = Array.isArray(s.players) ? s.players.length : 0;
    bits.push(cnt < 2 ? `⏳ 等待更多玩家（${cnt}/6）` : `✅ ${cnt} 名玩家就緒，即將開始`);
  } else if (phase === 'dealing') {
    bits.push('🎴 發牌中...');
  } else if (phase === 'banker-bet') {
    const iAmBanker = me?.is_banker;
    bits.push(iAmBanker ? `👑 您是莊家，請下注（${s.min_bet}–${s.max_bet}）` : '👑 莊家下注中...');
  } else if (phase === 'player-bet') {
    const myTurn = me && me.seat_index === s.current_player_turn_seat && !me.has_acted && !me.is_banker;
    if (me?.is_folded) bits.push('🚫 已棄牌，等待本局結算');
    else if (myTurn) bits.push(`▶ 輪到您跟注 ${s.banker_bet_amount} 或棄牌`);
    else {
      const cur = (s.players || []).find(p => p.seat_index === s.current_player_turn_seat);
      bits.push(cur ? `⏱ 輪到 ${cur.display_name || '玩家'} 行動` : '⏱ 閒家下注中...');
    }
  } else if (phase === 'showdown') {
    bits.push('🃏 開牌中...');
  } else if (phase === 'settled') {
    bits.push('✅ 本局結束，等待下一局自動開始');
  }

  // 本局獎池 + 房間代號（結算時錢已飛出去，獎池不再顯示金額）
  if (phase !== 'settled' && typeof s.current_pot === 'number' && s.current_pot > 0) {
    bits.push(`🪙 獎池 ${s.current_pot.toLocaleString()}`);
  }
  const rid = (_room && _room.id) ? _room.id : null;
  if (rid) bits.push(`🏠 ${rid}`);

  const text = bits.join('  ·  ');
  if (el.textContent !== text) el.textContent = text;
}

// ── Bet transition → coins fly to pot ────────────────────
function checkBetTransitions(newS) {
  const positions = ['s-bot','s-bl','s-tl','s-top','s-tr','s-br'];
  const potEl = $('c-pot');
  if (!potEl) return;

  // Helper: ordered array for new state
  const allP   = Array.isArray(newS.players) ? newS.players.slice() : [];
  const meP    = _myPid ? allP.find(p => p.player_id === _myPid) : allP[0] || null;
  const ordP   = meP ? [meP, ...allP.filter(p => p !== meP)] : [...allP];

  // BUG-20260422-002：莊家下注不入獎池（屬 escrow），不再觸發 banker→pot 動畫。
  // 莊家下注改為在莊家座位上播放 coin drop 音效作為視覺提示。
  if (newS.phase === 'player-bet' && _prevPhase === 'banker-bet') {
    playCoinDrop();
  }

  // 閒家剛跟注：has_acted 從 false → true
  // 同時涵蓋「最後一位跟注直接觸發 showdown」的情境（此時 newS.phase 已是 showdown）
  if (newS.phase === 'player-bet' || _prevPhase === 'player-bet') {
    allP.forEach(p => {
      if (!p.is_banker && p.has_acted && !_prevActedSeats.has(p.seat_index)) {
        const idx = ordP.findIndex(q => q.seat_index === p.seat_index);
        const fromEl = idx >= 0 ? $(positions[idx]) : null;
        if (fromEl) {
          setTimeout(() => { flyCoins(fromEl, potEl, 6); playCoinDrop(); }, 80);
          _lastBetAnimAt = Date.now(); // 記錄最後一次押注動畫時間
        }
        _prevActedSeats.add(p.seat_index);
      }
    });
  }

  // 更新追蹤
  _prevPot   = newS.current_pot || 0;
  _prevPhase = newS.phase || '';
  // 新局開始才清空（dealing / banker-bet），避免 showdown 觸發時被提前清掉
  if (newS.phase === 'dealing' || newS.phase === 'banker-bet' || newS.phase === 'waiting') {
    _prevActedSeats = new Set();
  }
}

// ── Showdown sequential reveal ────────────────────────────
function startShowdownSequence() {
  stopShowdownSequence();
  _sdRevealedSet = new Set();
  _sdDone = false;
  _sdWinnerSeats = new Set();

  // BUG-20260422-003：閒家先依座位順序亮牌，莊家最後亮牌決定輸贏（增加刺激感）
  const bankerSeat = _state?.banker_seat_index;
  const allSeats = Object.keys(_revealedHands).map(Number);
  const playerSeats = allSeats.filter(s => s !== bankerSeat).sort((a, b) => a - b);
  const seats = bankerSeat != null && allSeats.includes(bankerSeat)
    ? [...playerSeats, bankerSeat]
    : playerSeats;
  if (!seats.length) { _sdDone = true; renderState(_state); return; }

  const interval = Math.min(1300, 3000 / seats.length);
  let step = 0;

  function next() {
    if (step >= seats.length) {
      stopShowdownSequence();
      _sdDone = true;
      // Mark winners from hand_types (highest points / sam_gong)
      markWinners();
      renderState(_state);
      return;
    }
    const seat = seats[step++];
    _sdRevealedSet.add(seat);
    const ht  = _handTypes[String(seat)];
    const pla = (_state.players || []).find(p => p.seat_index === seat);
    const nm  = pla ? (pla.display_name || '玩家') : '玩家';
    if (ht) addLog(`  ${nm}：${ht.is_sam_gong ? '三公！' : ht.points + '點'}`, 'sys');
    renderState(_state);
  }

  next();                                        // immediate first
  _sdSeqTimer = setInterval(next, interval);
}

function stopShowdownSequence() {
  if (_sdSeqTimer) { clearInterval(_sdSeqTimer); _sdSeqTimer = null; }
}

function markWinners() {
  // Compute winner from hand_types (used for glow before settlement arrives)
  let bestPts = -1, bestSam = false;
  const winners = [];
  for (const [seatStr, ht] of Object.entries(_handTypes)) {
    const seat = Number(seatStr);
    if (ht.is_sam_gong && !bestSam) {
      bestSam = true; bestPts = 0; winners.length = 0; winners.push(seat);
    } else if (ht.is_sam_gong && bestSam) {
      winners.push(seat);
    } else if (!bestSam && ht.points > bestPts) {
      bestPts = ht.points; winners.length = 0; winners.push(seat);
    } else if (!bestSam && ht.points === bestPts) {
      winners.push(seat);
    }
  }
  _sdWinnerSeats = new Set(winners);
}

// ── Settle animation: coins fly + sound ──────────────────
// BUG-20260422-002：精準依三公規則演示資金流向
//   1) 輸家：獎池內的 called_bet → 莊家（抽水後歸莊家）
//   2) 平手：獎池內的 called_bet → 玩家（退回）
//   3) 贏家 called_bet 退回：獎池 → 贏家
//   4) 贏家賠付：莊家 → 贏家（N × banker_bet，從莊家籌碼支付）
//   5) 莊家破產情境：少量破碎動畫，象徵未獲得支付
function triggerSettleAnimation(s, ordered) {
  const positions = ['s-bot','s-bl','s-tl','s-top','s-tr','s-br'];
  const potEl = $('c-pot');
  if (!potEl) return;

  playCashRegister();

  const seatElOf = (seatIndex) => {
    const idx = ordered.findIndex(p => p.seat_index === seatIndex);
    return idx >= 0 ? $(positions[idx]) : null;
  };
  const bankerEl = seatElOf(s.banker_seat_index);

  const sett = s.settlement || {};
  const winners         = sett.winners || [];
  const losers          = sett.losers  || [];
  const ties            = sett.ties    || [];
  const insolventWinners = sett.insolvent_winners || [];

  let t = 0;

  // 1) 輸家的 called_bet：獎池 → 莊家（每位輸家 6 枚金幣，依順序）
  if (bankerEl) {
    losers.forEach((l, i) => {
      setTimeout(() => flyCoins(potEl, bankerEl, 6), t + i * 90);
    });
  }
  if (losers.length > 0) t += losers.length * 90 + 180;

  // 2) 平手的 called_bet：獎池 → 玩家（退回）
  ties.forEach((tie, i) => {
    const seatEl = seatElOf(tie.seat_index);
    if (seatEl) setTimeout(() => flyCoins(potEl, seatEl, 5), t + i * 90);
  });
  if (ties.length > 0) t += ties.length * 90 + 180;

  // 3) 贏家的 called_bet：獎池 → 贏家（退回本金）
  winners.forEach((w, i) => {
    const seatEl = seatElOf(w.seat_index);
    if (seatEl) setTimeout(() => flyCoins(potEl, seatEl, 5), t + i * 90);
  });
  // insolvent winners 的 called_bet 也從獎池退回（根據 PRD：本金退回後再檢查能否支付賠付）
  insolventWinners.forEach((iw, i) => {
    const seatEl = seatElOf(iw.seat_index);
    if (seatEl) setTimeout(() => flyCoins(potEl, seatEl, 3), t + (winners.length + i) * 90);
  });
  if (winners.length + insolventWinners.length > 0) t += (winners.length + insolventWinners.length) * 90 + 200;

  // 4) 贏家賠付：莊家 → 贏家（N × banker_bet 從莊家口袋飛出）
  if (bankerEl) {
    winners.forEach((w, i) => {
      const seatEl = seatElOf(w.seat_index);
      const n = w.payout_multiplier || 1;
      if (seatEl) setTimeout(() => flyCoins(bankerEl, seatEl, 6 + n * 2), t + i * 120);
    });
  }

  // 5) 莊家破產的贏家：只有 1~2 枚破碎金幣從莊家出發，象徵未能取得支付
  if (bankerEl && insolventWinners.length > 0) {
    insolventWinners.forEach((iw, i) => {
      const seatEl = seatElOf(iw.seat_index);
      if (seatEl) setTimeout(() => flyCoins(bankerEl, seatEl, 2), t + (winners.length + i) * 120 + 300);
    });
  }

  // 若全無 losers / winners / ties / insolventWinners（例如全員 Fold），
  // 莊家從 §8.0 規則拿回底注，但 current_pot=0 所以無動畫需要。
}

function flyCoins(fromEl, toEl, count) {
  if (!fromEl || !toEl) return;
  const fr = fromEl.getBoundingClientRect();
  const tr = toEl.getBoundingClientRect();
  if (!fr.width && !fr.height) return;   // element not visible

  const fx = fr.left + fr.width  / 2;
  const fy = fr.top  + fr.height / 2;
  const tx = tr.left + tr.width  / 2;
  const ty = tr.top  + tr.height / 2;

  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.textContent = i % 3 === 0 ? '💰' : '🪙';
    coin.style.cssText =
      `position:fixed;left:${fx}px;top:${fy}px;` +
      `font-size:${1.1 + Math.random() * 0.5}rem;` +
      `pointer-events:none;z-index:400;will-change:transform,opacity;`;
    document.body.appendChild(coin);

    const stagger = i * 55;
    const dur     = 520 + Math.random() * 180;
    // scatter: slight random offset around target
    const sx = (Math.random() - 0.5) * 50;
    const sy = (Math.random() - 0.5) * 50;
    const dx = tx + sx - fx;
    const dy = ty + sy - fy;

    // Use two rAFs so the browser records start position before transition fires
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => {
        coin.style.transition =
          `transform ${dur}ms cubic-bezier(.25,.46,.45,.94),` +
          `opacity 200ms ease ${dur - 180}ms`;
        coin.style.transform = `translate(${dx}px,${dy}px) scale(0.25)`;
        coin.style.opacity   = '0';
      }, stagger);
    }));

    setTimeout(() => coin.remove(), stagger + dur + 300);
  }
}

// BUG-20260422-003：發牌動畫 — 從莊家位置飛一張撲克牌到目標位置
function flyCard(fromEl, toEl, onLand) {
  if (!fromEl || !toEl) { if (onLand) setTimeout(onLand, 0); return; }
  const fr = fromEl.getBoundingClientRect();
  const tr = toEl.getBoundingClientRect();
  if (!fr.width || !tr.width) { if (onLand) setTimeout(onLand, 0); return; }

  const fx = fr.left + fr.width / 2;
  const fy = fr.top  + fr.height / 2;
  const tx = tr.left + tr.width / 2;
  const ty = tr.top  + tr.height / 2;

  const card = document.createElement('div');
  card.className = 'fly-card';
  card.textContent = '🂠';
  card.style.cssText = `position:fixed;left:${fx}px;top:${fy}px;`;
  document.body.appendChild(card);

  const dur = 420;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.style.transition = `transform ${dur}ms cubic-bezier(.25,.46,.45,.94), opacity 160ms ease ${dur - 160}ms`;
    card.style.transform = `translate(${tx-fx}px,${ty-fy}px) rotate(380deg) scale(.65)`;
    card.style.opacity = '0';
  }));
  setTimeout(() => { card.remove(); if (onLand) onLand(); }, dur + 20);
}

// BUG-20260422-003：開始發牌動畫
// - 從莊家座位順時鐘發牌（banker+1, banker+2, ..., banker 自己最後）
// - 每位玩家共 3 張，分 3 輪；每張間隔 CARD_DELAY ms
// - 牌飛到自己座位時，自己對應的手牌翻面（revealedCount++）
// - 動畫結束後 _dealAnim.inProgress = false；後續渲染恢復完整
function startDealAnimation(onComplete) {
  if (!_state || !Array.isArray(_state.players) || _state.players.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  const positions = ['s-bot','s-bl','s-tl','s-top','s-tr','s-br'];
  const bankerSeat = _state.banker_seat_index;

  // ordered = me-first；對照發牌座位 index
  const all = _state.players.slice();
  const meP = _myPid ? all.find(p => p.player_id === _myPid) : all[0] || null;
  const ordered = meP ? [meP, ...all.filter(p => p !== meP)] : all.slice();
  const bankerOrderedIdx = ordered.findIndex(p => p.seat_index === bankerSeat);
  const bankerEl = bankerOrderedIdx >= 0 ? $(positions[bankerOrderedIdx]) : null;
  if (!bankerEl) { if (onComplete) onComplete(); return; }

  // 發牌順序：依 seat_index 由莊家 +1 開始順時鐘，莊家最後
  const bySeat = all.slice().sort((a, b) => a.seat_index - b.seat_index);
  const startPos = bySeat.findIndex(p => p.seat_index === bankerSeat);
  const dealQueue = [];
  for (let i = 1; i <= bySeat.length; i++) {
    dealQueue.push(bySeat[(startPos + i) % bySeat.length]);
  }
  // dealQueue 最後一位 = 莊家

  _dealAnim.inProgress = true;
  _dealAnim.dealtForSeat = {};
  bySeat.forEach(p => { _dealAnim.dealtForSeat[p.seat_index] = 0; });
  _myHandRevealedCount = 0;
  renderState(_state);

  const CARD_DELAY = 140;  // 每張牌間隔
  const total = dealQueue.length * 3;
  let dealt = 0;

  for (let round = 0; round < 3; round++) {
    dealQueue.forEach((player, j) => {
      const delay = (round * dealQueue.length + j) * CARD_DELAY;
      const toOrderedIdx = ordered.findIndex(q => q.seat_index === player.seat_index);
      const toEl = toOrderedIdx >= 0 ? $(positions[toOrderedIdx]) : null;
      setTimeout(() => {
        flyCard(bankerEl, toEl, () => {
          _dealAnim.dealtForSeat[player.seat_index] = (_dealAnim.dealtForSeat[player.seat_index] || 0) + 1;
          if (player.player_id === _myPid) {
            _myHandRevealedCount = Math.min(3, _myHandRevealedCount + 1);
            playCoinDrop();  // 自己翻牌時有聲效
          }
          renderState(_state);
          dealt++;
          if (dealt === total) {
            setTimeout(() => {
              _dealAnim.inProgress = false;
              _myHandRevealedCount = 3;
              renderState(_state);
              if (onComplete) onComplete();
            }, 280);
          }
        });
      }, delay);
    });
  }
}

function playCashRegister() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Resume needed if browser suspended the context (requires prior user gesture)
    ctx.resume().then(() => {
      // cha-ching: ascending bell tones + low thud
      const notes = [
        // [freq,  start, dur,  gain, type]
        [1046.5, 0.00, 0.12, 0.30, 'sine'],
        [1318.5, 0.10, 0.12, 0.25, 'sine'],
        [1568.0, 0.20, 0.14, 0.28, 'sine'],
        [2093.0, 0.30, 0.18, 0.35, 'sine'],
        [180.0,  0.35, 0.40, 0.18, 'sawtooth'],   // metallic thud
      ];
      notes.forEach(([freq, start, dur, gain, type]) => {
        const osc  = ctx.createOscillator();
        const gn   = ctx.createGain();
        osc.connect(gn);
        gn.connect(ctx.destination);
        osc.type            = type;
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + start;
        gn.gain.setValueAtTime(gain, t0);
        gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
    });
  } catch (_) { /* AudioContext unavailable */ }
}

// showResult removed — result shown in oval (.oresult #c-result) without locking screen

// ── Action panel ──────────────────────────────────────────
function renderActions(s, me) {
  const box = $('actions'); if (!box) return;
  box.innerHTML = '';
  const phase    = s.phase||'waiting';
  const isBanker = me?.is_banker === true;
  const minBet   = s.min_bet || 100;
  const maxBet   = s.max_bet || 5000;

  // 判斷是否輪到我行動
  const myTurnAsPlayer = (phase === 'player-bet' && !isBanker && !me?.has_acted &&
                          me?.seat_index === s.current_player_turn_seat);
  const myTurnAsBanker = (phase === 'banker-bet' && isBanker);
  const isMyActionTurn = myTurnAsPlayer || myTurnAsBanker;

  // 不是我的行動回合 → 取消任何進行中的自動行動
  if (!isMyActionTurn) cancelAutoAct();

  if (!me) {
    box.innerHTML = '<p class="hint">觀看中（等待下一局可加入）</p>';
    return;
  }
  if (me.is_folded) {
    box.innerHTML = '<p class="hint">已棄牌，等待下一局</p>';
    return;
  }

  if (phase === 'waiting') {
    const cnt = Array.isArray(s.players) ? s.players.length : 0;
    box.innerHTML = cnt < 2
      ? `<p class="hint">等待更多玩家加入（${cnt}/6）<br><small style="font-size:.7rem;color:#555">需 2 人自動開始</small></p>`
      : `<p class="hint gold">✅ ${cnt} 名玩家就緒<br>遊戲即將開始...</p>`;
    return;
  }

  if (phase === 'dealing') {
    box.innerHTML = '<p class="hint">發牌中...</p>';
    return;
  }

  if (phase === 'banker-bet') {
    if (isBanker) {
      // 初始化本把選定金額：優先上一把記憶，否則 minBet
      if (!_selectedBetAmt || _selectedBetAmt < minBet || _selectedBetAmt > maxBet) {
        _selectedBetAmt = (_lastBankerBet >= minBet && _lastBankerBet <= maxBet)
          ? _lastBankerBet : minBet;
      }

      box.innerHTML = `<p class="hint gold">您是莊家，請下注</p>
        <input type="number" id="betval" value="${_selectedBetAmt}" min="${minBet}" max="${maxBet}" step="100"
               style="width:100%;margin:6px 0">
        <div id="qbets" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px"></div>`;

      // 同步 input 變動到 _selectedBetAmt
      const betInput = $('betval');
      if (betInput) {
        betInput.addEventListener('input', () => {
          const v = parseInt(betInput.value) || minBet;
          _selectedBetAmt = Math.min(maxBet, Math.max(minBet, v));
          // 重畫快速按鈕高亮（只更新 class，不重繪整個 box）
          refreshQBetHighlight();
        });
      }

      const quickBets = Array.isArray(s.quick_bet_amounts) && s.quick_bet_amounts.length
        ? s.quick_bet_amounts
        : [minBet, minBet*2, minBet*5];
      const qbox = $('qbets');
      quickBets.forEach(amt => {
        const b = document.createElement('button');
        b.dataset.amt = amt;
        // 選中的金額用 pri（金色），其他用 sec
        b.className = 'btn ' + (amt === _selectedBetAmt ? 'pri' : 'sec');
        b.style = 'flex:1;min-width:44px;font-size:.76rem;padding:4px';
        b.textContent = amt >= 1000 ? (amt/1000) + 'K' : amt;
        b.onclick = () => {
          cancelAutoAct();
          _selectedBetAmt = amt;
          const i = $('betval'); if (i) i.value = amt;
          refreshQBetHighlight();
        };
        qbox.appendChild(b);
      });

      addBtn(box,'👁 看牌（可選）','sec',() => { cancelAutoAct(); _room?.send('see_cards'); });
      addBtn(box,'✅ 確認下注','pri',() => {
        cancelAutoAct();
        const amt = Math.min(maxBet, Math.max(minBet, parseInt($('betval')?.value||_selectedBetAmt)));
        _lastBankerBet = amt;   // 記住這把的金額
        _selectedBetAmt = 0;    // 清空，下把重新初始化
        _room?.send('banker_bet', { amount: amt });
      });

      // 自動押注（使用選定金額 / 上把記憶金額）
      if (isAutoActEnabled()) {
        startAutoAct(() => {
          const amt = _selectedBetAmt || _lastBankerBet || minBet;
          _lastBankerBet = amt;
          _selectedBetAmt = 0;
          _room?.send('banker_bet', { amount: amt });
        });
        const elapsed = _autoActAt > 0 ? Date.now() - _autoActAt : 0;
        appendAutoProgress(box, AUTO_ACT_MS - elapsed);
      }
    } else {
      box.innerHTML = '<p class="hint">等待莊家下注...</p>';
    }
    return;
  }

  if (phase === 'player-bet') {
    if (isBanker) {
      box.innerHTML = '<p class="hint gold">莊家已下注，等待閒家行動</p>';
      return;
    }
    if (me.has_acted) {
      box.innerHTML = '<p class="hint">已跟注，等待其他玩家</p>';
      return;
    }
    const isMyTurn = me.seat_index === s.current_player_turn_seat;
    if (!isMyTurn) {
      box.innerHTML = '<p class="hint">等待其他玩家行動...</p>';
      return;
    }
    const bankerBet = s.banker_bet_amount || minBet;
    box.innerHTML = `<p class="hint">輪到您！莊家下注：${bankerBet.toLocaleString()}</p>`;
    addBtn(box,'💰 跟注 ('+bankerBet.toLocaleString()+')','pri',() => {
      cancelAutoAct(); _room?.send('call',{});
    });
    addBtn(box,'✋ 棄牌','danger',() => {
      if(confirm('確定棄牌？')) { cancelAutoAct(); _room?.send('fold'); }
    });
    // 自動跟注
    if (isAutoActEnabled()) {
      startAutoAct(() => _room?.send('call', {}));
      const elapsed = _autoActAt > 0 ? Date.now() - _autoActAt : 0;
      appendAutoProgress(box, AUTO_ACT_MS - elapsed);
    }
    return;
  }

  if (phase === 'showdown' || phase === 'settled') {
    box.innerHTML = '<p class="hint">本局結束，等待下一局自動開始</p>';
    return;
  }

  box.innerHTML = `<p class="hint">${PHASE_NAMES[phase]||phase}</p>`;
}

function addBtn(parent, label, cls, fn) {
  const b = document.createElement('button');
  b.className='btn '+cls; b.style='width:100%;margin-bottom:7px';
  b.textContent=label; b.onclick=fn; parent.appendChild(b);
}

// ── Quick-bet button highlight sync ──────────────────────
function refreshQBetHighlight() {
  const qbox = $('qbets'); if (!qbox) return;
  const inputVal = parseInt($('betval')?.value) || _selectedBetAmt;
  qbox.querySelectorAll('button[data-amt]').forEach(b => {
    const amt = parseInt(b.dataset.amt);
    b.className = 'btn ' + (amt === inputVal ? 'pri' : 'sec');
  });
}

// ── Auto-act helpers ──────────────────────────────────────
// BUG-20260422-001：無論玩家如何加入房間，自動行動預設關閉，
// 必須玩家主動勾選 checkbox 才啟用（修正前預設為 true，玩家未同意就自動下注）。
function isAutoActEnabled() {
  return $('auto-act-chk')?.checked === true;
}
function cancelAutoAct() {
  if (_autoActTimer) { clearTimeout(_autoActTimer); _autoActTimer = null; }
  _autoActAt = 0;
}
// 在 action box 末尾加入進度條（顯示還剩多少秒）
function appendAutoProgress(box, remainingMs) {
  const bar = document.createElement('div');
  bar.className = 'auto-progress';
  bar.style.animationDuration = Math.max(0, remainingMs) + 'ms';
  const lbl = document.createElement('p');
  lbl.className = 'hint';
  lbl.style.fontSize = '.7rem';
  lbl.style.marginTop = '2px';
  lbl.style.color = 'var(--gold)';
  lbl.textContent = '🤖 自動行動中，點按鈕可取消';
  box.appendChild(bar);
  box.appendChild(lbl);
}
// 啟動自動行動倒數，action 為回呼（3 秒後執行）
function startAutoAct(action) {
  if (_autoActTimer) return;      // 已在跑，不重複
  _autoActAt = Date.now();
  _autoActTimer = setTimeout(() => {
    _autoActTimer = null;
    _autoActAt   = 0;
    action();
  }, AUTO_ACT_MS);
}

// ── Chat ──────────────────────────────────────────────────
function sendChat() {
  const inp = $('chatinp'); if (!inp) return;
  const txt = inp.value.trim(); if (!txt) return;
  if (!_room) { toast('尚未連線','red'); return; }
  _room.send('send_chat',{text:txt});
  addLog(_nick+': '+txt, 'chat');  // 本地立刻顯示，server 廣播回來會跳過
  inp.value=''; inp.focus();
}

// ── Leave ─────────────────────────────────────────────────
function leaveGame() {
  if (!confirm('確定離開房間？')) return;
  _room?.leave(); _room=null;
  _myHand=[]; _revealedHands={};
  _state = { phase:'waiting', current_pot:0, players:[], hall_name:'青銅廳',
             min_bet:100, max_bet:5000, quick_bet_amounts:[],
             current_player_turn_seat:-1, banker_seat_index:-1,
             banker_bet_amount:0, settlement:null };
  // 清除 URL 房間參數 + 清空輸入框（避免下次建立/加入又回到同一房間）
  history.replaceState(null, '', location.pathname);
  const roomInp = $('room-join-id');
  if (roomInp) roomInp.value = '';
  const sb = $('share-box'); if (sb) sb.style.display = 'none';
  $('game').style.display='none';
  $('login').style.display='flex';
  setConn(false);
  $('joinbtn').disabled=false; $('joinbtn').textContent='🎴 建立／加入遊戲';
  $('errmsg').textContent='已離開房間';
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetch('http://'+API_HOST+'/api/v1/health')
    .then(r=>r.json()).then(()=>{ $('apistatus').textContent='✅ 伺服器正常'; })
    .catch(()=>{ $('apistatus').textContent='⚠️ API無回應（port-forward是否開啟？）'; });

  // 聊天室縮小 / 還原（state 存 localStorage，重整後保留）
  const chatPanel = $('chat-panel');
  const chatToggle = $('chat-toggle');
  if (chatPanel && chatToggle) {
    const applyChatState = (minimized) => {
      chatPanel.classList.toggle('minimized', minimized);
      chatToggle.textContent = minimized ? '+' : '−';
      chatToggle.setAttribute('aria-label', minimized ? '展開聊天室' : '縮小聊天室');
    };
    applyChatState(localStorage.getItem('chat_minimized') === '1');
    chatToggle.addEventListener('click', () => {
      const nowMin = !chatPanel.classList.contains('minimized');
      applyChatState(nowMin);
      localStorage.setItem('chat_minimized', nowMin ? '1' : '0');
    });
  }

  // 操作面板縮小 / 還原（收合時以跑馬燈顯示本局關鍵訊息）
  const actionPanel = $('action-panel');
  const actionToggle = $('action-toggle');
  if (actionPanel && actionToggle) {
    const applyActionState = (minimized) => {
      actionPanel.classList.toggle('minimized', minimized);
      actionToggle.textContent = minimized ? '+' : '−';
      actionToggle.setAttribute('aria-label', minimized ? '展開操作面板' : '縮小操作面板');
    };
    applyActionState(localStorage.getItem('action_minimized') === '1');
    actionToggle.addEventListener('click', () => {
      const nowMin = !actionPanel.classList.contains('minimized');
      applyActionState(nowMin);
      localStorage.setItem('action_minimized', nowMin ? '1' : '0');
    });
  }

  // 從 URL ?room= 自動帶入房間號碼
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) {
    const roomInput = $('room-join-id');
    if (roomInput) roomInput.value = urlRoom;
    const msg = $('errmsg');
    if (msg) { msg.style.color='#80cbc4'; msg.textContent='房間 '+urlRoom+'，輸入暱稱後按「建立/加入」'; }
    $('nick')?.focus();
  }

  // ── 按鈕事件 ─────────────────────────────
  // 建立/加入：有房間ID則 joinById，否則 joinOrCreate
  $('joinbtn').addEventListener('click', () => { unlockAudio(); joinGame(); });
  $('nick').addEventListener('keydown', e => { if(e.key==='Enter'){ unlockAudio(); joinGame(); } });

  // 清空房間代號
  $('clearbtn')?.addEventListener('click', () => {
    const inp = $('room-join-id');
    if (inp) { inp.value = ''; inp.focus(); }
    history.replaceState(null, '', location.pathname);
    const msg = $('errmsg');
    if (msg) { msg.textContent = ''; msg.style.color=''; }
  });

  // 房間代號輸入框 Enter 直接加入
  $('room-join-id')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const rid = ($('room-join-id')?.value||'').trim();
      if (rid) { unlockAudio(); joinGame(rid); }
      else     { unlockAudio(); joinGame(); }
    }
  });

  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'chatsend') sendChat();
  });
  document.addEventListener('keydown', e => {
    if (e.target && e.target.id === 'chatinp' && e.key === 'Enter') sendChat();
  });
});
