# 三公 Sam Gong — Multiplayer Card Game

> 即時多人三公牌局 · Colyseus 0.15 · Node.js · Kubernetes

[![Deploy to GitHub Pages](https://github.com/ibalasite/sam-gong-game-test/actions/workflows/pages.yml/badge.svg)](https://github.com/ibalasite/sam-gong-game-test/actions/workflows/pages.yml)

## 🎴 線上文件

📖 **[https://ibalasite.github.io/sam-gong-game-test/](https://ibalasite.github.io/sam-gong-game-test/)**

## 技術架構

| 層級 | 技術 |
|------|------|
| 遊戲伺服器 | [Colyseus 0.15](https://colyseus.io) + Node.js + TypeScript |
| 前端 | 原生 HTML5 / CSS3 / Vanilla JS |
| 資料庫 | PostgreSQL + Redis |
| 部署 | Kubernetes (Rancher Desktop) |
| CI/CD | GitHub Actions |

## 遊戲功能

### 核心對戰
- ✅ 1 莊 + 最多 5 閒，即時多人對戰（Colyseus room state）
- ✅ 完整押注流程（莊家下注 → 閒家跟注/棄牌），傳統 Sam Gong 規則
- ✅ **中途加入**（mid-game join）：空位即可入房，本局排隊等下一局
- ✅ **Spectator 加入流程**：進房預設觀察者，按黃色發光按鈕才算加入；60 秒未按自動踢出
- ✅ 莊家輪莊（順時鐘 + 跳過破產/斷線）

### 動畫與 UX
- ✅ **Round-table 發牌動畫**：牌由莊家順時鐘飛出，每張 1 秒（第 3 張 2 秒增加緊張感）
- ✅ **自己的牌逐張翻面**：飛到座位時翻面 + coin drop 音效
- ✅ **開牌順序**：閒家依 seat 順序先亮牌，**莊家最後**揭曉
- ✅ **圓桌相對座位**：每位玩家看到的相對位置一致（你的右邊永遠是 seat+1）
- ✅ **頭頂計時器**：輪到誰頭上浮現金色脈動秒數（≤ 5 秒變紅色急促）
- ✅ 金幣精準流向：結算時輸家→莊家、平手/贏家→退回 called_bet、莊家→贏家付 N× 賠率
- ✅ 自動跟注 / 最低押注（CHECKBOX 預設不勾選，需主動啟用）
- ✅ 結算泡泡顯示盈虧，獎池立即歸 0 對齊動畫
- ✅ 3 秒遊戲開始倒數（2 人按下加入後）
- ✅ 15 秒 per-turn timeout（莊家超時 auto-min-bet / 閒家超時 auto-fold）

### 聊天與介面
- ✅ 左下角聊天室 + 操作面板並排（可獨立縮合，縮合時跑馬燈顯示本局關鍵訊息）
- ✅ 房間代號分享 / 複製邀請連結 URL
- ✅ 離開按鈕守衛：籌碼押注中時變灰，避免意外損失

### 斷線與永續（BUG-20260422-019）
- ✅ **已押錢斷線照常結算**：保留手牌，依牌贏輸，不影響其他玩家權益
- ✅ **莊家 banker-bet 階段離開**：自動中止本局 + 重新倒數，無人損失
- ✅ **PostgreSQL chip_balance 永續**：結算後寫入 DB + 記 `chip_transactions` audit trail
- ✅ **重連保護**：30 秒重連視窗 + 同暱稱自動接回上次的 chip_balance
- ✅ DB 失敗降級：退化為 in-memory，遊戲不中斷

## 本地啟動

```bash
# 1. 安裝依賴
npm install

# 2. 啟動 Kubernetes 本地環境
kubectl apply -f infra/k8s/local/ -n sam-gong-local

# 3. Port-forward
kubectl port-forward -n sam-gong-local svc/sam-gong-client-service 8080:80
kubectl port-forward -n sam-gong-local svc/sam-gong-server-service 2567:2567

# 4. 開啟瀏覽器
open http://localhost:8080
```

## 文件目錄

| 文件 | 說明 |
|------|------|
| [BRD](docs/BRD.md) | 商業需求文件 |
| [PRD](docs/PRD.md) | 產品需求規格 |
| [EDD](docs/EDD.md) | 工程設計文件 |
| [API](docs/API.md) | API 參考文件 |
| [ARCH](docs/ARCH.md) | 系統架構圖 |

## 變更歷史

| BUG ID | 修正 |
|--------|------|
| BUG-20260422-001 | 中途加入房間 + 押注 checkbox 預設不勾選 |
| BUG-20260422-002 | `current_pot` 排除莊家下注 + 精準結算動畫 |
| BUG-20260422-003 | Round-table 發牌動畫 + 逐張翻面 + 莊家最後開牌 |
| BUG-20260422-004 | Mid-game join 卡死修正 + 清空房號後建立新房 |
| BUG-20260422-005 | 圓桌相對座位映射（跨玩家視角一致） |
| BUG-20260422-006/007 | 發牌節奏 140ms → 1s/張；第 3 張 2s 增加緊張感 |
| BUG-20260422-008 | 關分頁主動送 consented leave |
| BUG-20260422-009 | 3 秒遊戲開始倒數 + 發牌動畫起點同步 |
| BUG-20260422-010 | 頭頂倒數計時器 + 觀察者不發牌 |
| BUG-20260422-011 | 廣播 `action_deadline_timestamp` |
| BUG-20260422-012 | Turn timeout 30s → 15s |
| BUG-20260422-013 | Spectator 加入流程（黃色按鈕 + 60 秒踢出） |
| BUG-20260422-014 | 莊家輪莊排除觀察者 / 排隊者 |
| BUG-20260422-015 | 被踢 / 斷線回到登入畫面 |
| BUG-20260422-016 | 離開按鈕守衛（籌碼押注中不可離開） |
| BUG-20260422-017 | 觀察者不出現金幣飛向獎池動畫 |
| BUG-20260422-018 | 按鈕點擊需 2-3 下 → memoize renderActions |
| BUG-20260422-019 | 斷線處理重寫 + PostgreSQL chip_balance 永續 |

---

Generated with [devsop-autodev](https://github.com/ibalasite) · 2026-04-23
