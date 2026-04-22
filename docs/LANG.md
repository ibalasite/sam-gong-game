# 技術選型文件（Language & Framework Selection）

<!-- SDLC Requirements Engineering — STEP 02 Output -->

**專案**: 三公遊戲（Sam Gong 3-Card Poker）即時多人線上平台
**版本**: v1.0
**日期**: 2026-04-21
**作者**: /devsop-autodev STEP-02（全自動選型）

---

## 選型決策

本專案技術選型已於 BRD §8.1 及 §13 中確認，STEP-02 執行正式選型文件化。

### Server 端

| 技術 | 版本 | 選型理由 |
|------|------|---------|
| Node.js | 22.x（Active LTS）| Colyseus 官方支援；2026-08-21 GA 時仍在 Active 維護期 |
| TypeScript | 5.4.x（minor locked）| 型別安全；Colyseus Schema 強型別支援 |
| Colyseus | ~0.15.0（locked）| 即時多人房間管理；Server-authoritative 架構官方框架 |
| PostgreSQL | 16.x | 牌局紀錄、帳號、籌碼流水；JSONB 支援複雜查詢 |
| Redis | 7.x | Presence/Matchmaking Queue/Session Cache；ACL 安全控制 |

### Client 端

| 技術 | 版本 | 選型理由 |
|------|------|---------|
| Cocos Creator | 3.8.x（minor locked）| 跨平台（Web/iOS/Android）；官方 Colyseus SDK；TypeScript 原生 |
| TypeScript | 5.4.x（minor locked）| 與 Server 共用型別定義（shared schema）|

### 架構決策

| 決策 | 內容 |
|------|------|
| 架構模式 | Server-authoritative：Client 僅顯示/輸入，零遊戲邏輯 |
| 通訊協定 | WebSocket（wss://）via Colyseus；Colyseus Schema 增量 State Sync |
| 部署目標 | Docker + k8s 或 Colyseus Cloud（待 Q5 決策，截止 2026-05-15）|
| 共用型別 | @colyseus/schema 定義 Room State；Client/Server 共享 TypeScript 型別 |
| 測試框架 | Jest（Server Unit/Integration）；Playwright（Client E2E）；k6（Performance）|

### 版本鎖定策略

| 套件 | 鎖定版本 | 升級政策 |
|------|---------|---------|
| Colyseus | ~0.15.0 | minor 升級須全團隊同步審查 |
| Cocos Creator | 3.8.x | patch 自動更新，minor 升級須測試 |
| Node.js | 22.x | LTS 週期內安全補丁自動更新 |
| TypeScript | 5.4.x | minor 升級須全團隊同步 |
| PostgreSQL | 16.x | patch 自動更新 |
| Redis | 7.x | patch 自動更新 |

### 排除選項（Not Selected）

| 技術 | 排除理由 |
|------|---------|
| Unity | 非 Web 優先；授權費；無 Colyseus 官方深度整合 |
| Socket.io | 無 Server-authoritative State Machine 框架；需自建 |
| MySQL | BRD 指定 PostgreSQL；JSONB 需求 |
| MongoDB | 帳號/籌碼流水需 ACID 事務，NoSQL 不適合 |
| Next.js/React | 非遊戲引擎，不支援 Canvas/WebGL 動畫需求 |
