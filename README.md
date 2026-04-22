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

- ✅ 1 莊 + 最多 5 閒，即時多人對戰
- ✅ 完整押注流程（莊家下注 → 閒家跟注/棄牌）
- ✅ 自動開牌動畫：逐座亮牌、牌型閃字
- ✅ 金幣飛入獎池動畫 + 收銀機音效
- ✅ 自動跟注 / 最低押注（可勾選、3 秒倒數）
- ✅ 結算泡泡顯示盈虧，不鎖畫面
- ✅ 聊天室、房間邀請代號分享

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

---

Generated with [devsop-autodev](https://github.com/ibalasite) · 2026-04-22
