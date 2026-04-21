# Cocos Creator Manual Test Guide — Sam Gong (三公)

## Overview

Cocos Creator 4.x renders through WebGL/WebGPU and does not expose a standard DOM that Playwright can interact with directly. This document provides a structured manual test checklist mapped to all BDD scenarios in `client/tests/bdd/`. It also documents known automation limitations and the recommended workarounds used in this project.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Cocos Creator | 4.x | Run Preview mode |
| Chrome DevTools | Any | Console output / network inspection |
| Colyseus Server | Running on port 2567 | Backend for integration |
| Test spreadsheet | Optional | Cross-reference with server E2E results |

### Start the Preview Environment

```bash
# 1. Start the Colyseus server
cd /path/to/sam-gong-game/server
npm run dev

# 2. Open Cocos Creator
# File → Open Project → select sam-gong-game/client/

# 3. Press the ▶ Play button (top toolbar) to launch Preview in Chrome
#    URL: http://localhost:7456 (default Cocos preview port)
```

---

## Known Cocos Automation Limitations

| Limitation | Reason | Workaround Used in This Project |
|-----------|--------|--------------------------------|
| No DOM tree | Cocos renders to a `<canvas>` element; Playwright's element locators do not apply | Server-side WebSocket E2E tests (`tests/e2e/server_e2e.test.ts`) cover all game-logic flows |
| No accessible tree | ARIA roles are not emitted by Cocos runtime | Visual verification during manual test; no automated a11y scan |
| Canvas screenshot diff | Pixel layout changes between OS/GPU | Not used for regression; manual visual sign-off instead |
| No reliable click coordinates | UI nodes move with resolution scaling | Coordinate-based Playwright clicks are fragile; omitted |
| Cocos test framework | `@jest/globals` do not run inside Cocos runtime | Unit-testable game logic is extracted to pure TS utilities |

### Recommended Strategy

```
Automated (CI)                 Manual (QA Gate)
─────────────────────────      ──────────────────────────────
Server WebSocket E2E tests  ←→  Cocos Preview visual checklist
Pure TS unit tests              BDD scenario walkthroughs (this doc)
```

---

## BDD Checklist: Main Menu (`main_menu.feature`)

### MM-01 — Create Room navigates to lobby
- [ ] Launch preview; land on Main Menu scene
- [ ] Click **創建房間**
- [ ] Verify: 6-character room code appears (format `[A-Z0-9]{6}`)
- [ ] Verify: Scene transitions to Game Lobby

### MM-02 — Join Room with valid code
- [ ] Enter a valid room code in the input field
- [ ] Click **加入房間**
- [ ] Verify: Scene transitions to Game Lobby
- [ ] Verify: Player appears in the correct seat

### MM-03 — Join Room with invalid code shows error
- [ ] Enter `XXXXXX` in room code input
- [ ] Click **加入房間**
- [ ] Verify: Toast "找不到房間，請確認房間碼" appears
- [ ] Verify: Scene remains on Main Menu

### MM-04 — Join button disabled when input is empty
- [ ] Clear room code input
- [ ] Verify: **加入房間** button is visually disabled (greyed out / no pointer events)

---

## BDD Checklist: Game Lobby (`game_lobby.feature`)

### GL-01 — Lobby displays room code
- [ ] Enter lobby as host
- [ ] Verify: Room code is prominently displayed
- [ ] Verify: Copy button is present

### GL-02 — Lobby shows all connected players
- [ ] Have 3 players join the same room
- [ ] Verify: 3 filled player slots visible
- [ ] Verify: 3 empty slots visible

### GL-03 — Start button only visible to host
- [ ] As host: Verify **開始遊戲** button is visible
- [ ] As non-host: Verify **開始遊戲** button is hidden

### GL-04 — Start button disabled with 1 player
- [ ] Remain as solo host in room
- [ ] Verify: **開始遊戲** button is disabled

### GL-05 — Start button enabled with 2+ players
- [ ] Have a second player join
- [ ] Verify: **開始遊戲** button becomes enabled

### GL-06 — Room code copy button
- [ ] Click copy button next to room code
- [ ] Verify: Clipboard contains room code (paste into notepad)
- [ ] Verify: "已複製" confirmation label briefly appears

---

## BDD Checklist: Game Play (`game_play.feature`)

### GP-01 — Banker is visually identified
- [ ] Start a round; note who is banker (P1 by default)
- [ ] Verify: Banker's slot shows a crown icon (莊家標識)
- [ ] Verify: Banker's slot border is gold coloured

### GP-02 — Betting panel shown to non-banker players
- [ ] As a non-banker player in betting phase
- [ ] Verify: Betting panel visible with **跟注** and **棄牌** buttons
- [ ] Verify: 30-second countdown timer visible

### GP-03 — Betting panel hidden from banker
- [ ] As banker in betting phase
- [ ] Verify: Betting panel NOT visible
- [ ] Verify: Status shows "等待閒家押注"

### GP-04 — My cards are visible to me
- [ ] During dealing phase, observe own card area
- [ ] Verify: Card faces (suit + rank) are shown
- [ ] Verify: Point total "點數: X" is displayed

### GP-05 — Other players' cards shown face-down before reveal
- [ ] During dealing phase, observe an opponent's card area
- [ ] Verify: Card backs shown (no rank/suit visible)
- [ ] Verify: Cannot see opponent card values

### GP-06 — Countdown shows urgent state at 5 seconds
- [ ] Let betting timer run down to ≤5 seconds
- [ ] Verify: Timer turns red
- [ ] Verify: Timer pulses / blinks

### GP-07 — Game result shows win/lose status
- [ ] Complete a round where you win
- [ ] Verify: Player slot shows "WIN" with gold highlight
- [ ] Verify: Chip increase animation plays

### GP-08 — Phase-appropriate UI
- [ ] When game transitions to settling phase
- [ ] Verify: Betting panel hidden
- [ ] Verify: Settlement results overlay appears

---

## BDD Checklist: Card Animations (`card_animation.feature`)

### CA-01 — Dealing animation
- [ ] Trigger dealing phase (start game + betting complete)
- [ ] Verify: Cards fly from centre to each player
- [ ] Verify: Animation completes within ~1.5 seconds (use stopwatch)

### CA-02 — Flip animation on reveal
- [ ] Observe card area when reveal phase starts
- [ ] Verify: Each card performs a rotateY flip before showing face

### CA-03 — Win highlight animation
- [ ] Win a round
- [ ] Verify: Gold glow effect on winning player slot for ≥1 second

### CA-04 — Chip counter animation
- [ ] Observe chip counter after settlement
- [ ] Verify: Number animates smoothly from old to new value (~1s duration)

---

## BDD Checklist: Error Handling & Disconnection (`error_and_disconnect.feature`)

### ED-01 — Room full error shows toast
- [ ] Fill room to 6 players (use 6 browser tabs)
- [ ] Attempt to join with a 7th tab
- [ ] Verify: Toast "房間已滿（最多6人）" appears on 7th tab
- [ ] Verify: 7th tab stays on Main Menu

### ED-02 — Disconnect overlay on network loss
- [ ] During active game, disable network (Chrome DevTools → Network → Offline)
- [ ] Verify: Full-screen overlay "重新連線中..." appears immediately
- [ ] Verify: 60-second countdown visible

### ED-03 — Reconnect success hides overlay
- [ ] With overlay visible, re-enable network within 60 seconds
- [ ] Verify: Overlay disappears
- [ ] Verify: Game state syncs to current phase

### ED-04 — 60s timeout redirects to main menu
- [ ] Stay offline for >60 seconds
- [ ] Verify: Toast "已離開房間" appears
- [ ] Verify: Scene changes to Main Menu

### ED-05 — Insufficient chips button feedback
- [ ] Engineer scenario where chips < bet amount (use server debug command if available,
     or set initial chips low in config)
- [ ] Verify: **跟注** button is disabled
- [ ] Verify: "籌碼不足" label visible below button

---

## Automated vs Manual Coverage Matrix

| BDD Feature File | Automated (Server E2E) | Manual (This Guide) |
|-----------------|----------------------|---------------------|
| `room_management.feature` | ✅ Full | — |
| `banker_mechanic.feature` | ✅ Rotation & assignment | — |
| `betting_flow.feature` | ✅ call / fold / phase advance | — |
| `card_dealing.feature` | ✅ 3 cards per player | — |
| `reveal_settlement.feature` | ✅ Chip update verified | — |
| `reconnection.feature` | ✅ Disconnect + reconnect | — |
| `main_menu.feature` | — | ✅ MM-01 – MM-04 |
| `game_lobby.feature` | — | ✅ GL-01 – GL-06 |
| `game_play.feature` | — | ✅ GP-01 – GP-08 |
| `card_animation.feature` | — | ✅ CA-01 – CA-04 |
| `error_and_disconnect.feature` | Partial (server error codes) | ✅ ED-01 – ED-05 |

---

## Running Server E2E Tests (CI Reference)

```bash
# From project root
cd server && npm install

# Install colyseus.js client dependency
npm install colyseus.js --save-dev

# Start server in background
npm run dev &

# Run E2E tests
npx jest --config ../tests/e2e/jest.e2e.config.js

# Or add to server/package.json scripts:
# "test:e2e": "jest --config ../tests/e2e/jest.e2e.config.js"
```

---

## Sign-Off

| Tester | Date | Build | Pass / Fail | Notes |
|--------|------|-------|-------------|-------|
| | | | | |
| | | | | |
