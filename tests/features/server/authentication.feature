Feature: Authentication
  As a game server
  I want to authenticate and authorize players securely
  So that only valid players can access the game and banned accounts are immediately rejected

  Background:
    Given JWT 使用 RS256（RSA 2048-bit）或 ES256（ECDSA P-256）簽名
    And Access Token TTL = 1 小時
    And Refresh Token TTL = 7 天（一次性使用，Rotation 機制）
    And 封鎖後 Redis 黑名單 TTL = 60 秒

  # ── JWT 有效/失效 ──

  Scenario: JWT 有效 - 成功加入 Colyseus 房間
    Given 有效的 JWT Access Token（player_id = "p1"，未過期）
    When 玩家使用此 Token 連線至 SamGongRoom
    Then onJoin 成功
    And PlayerState 被初始化

  Scenario: JWT 過期 - 拒絕加入房間
    Given 已過期的 JWT Access Token（exp < now）
    When 玩家嘗試使用過期 Token 連線
    Then onJoin 拋出 ServerError
    And 錯誤碼為 "token_expired"
    And 玩家無法加入房間

  Scenario: JWT 簽名偽造 - 拒絕連線
    Given 使用 HS256 或無效私鑰偽造的 JWT
    When 玩家使用偽造 Token 連線
    Then 伺服器拒絕連線
    And 記錄安全 warning log

  Scenario: JWT 有效 - REST API 取得玩家資料
    Given 有效的 JWT Access Token（Authorization: Bearer <token>）
    When 呼叫 GET /api/v1/player/me
    Then HTTP 200 回應
    And 回應包含玩家資料（player_id, display_name, chip_balance）

  Scenario: JWT 缺失 - REST API 拒絕存取
    Given 請求不包含 Authorization header
    When 呼叫 GET /api/v1/player/me
    Then HTTP 401 回應
    And 錯誤訊息包含驗證失敗原因

  Scenario: JWT 有效 - 取得玩家自身 session 資訊
    Given 玩家成功加入 SamGongRoom（有效 JWT）
    When 伺服器建立 PlayerState
    Then 伺服器推送私人訊息 my_session_info { session_id, player_id } 至玩家
    And session_id 不在公開 Room State 中（防止其他玩家存取）

  # ── Refresh Token 輪換 ──

  Scenario: Refresh Token Rotation - 成功換發新 Token
    Given 有效的 Refresh Token（未過期，未使用）
    When 呼叫 POST /api/v1/auth/refresh { refresh_token: <valid> }
    Then HTTP 200 回應
    And 回應包含新的 access_token 和新的 refresh_token
    And 舊的 refresh_token 被標記為已使用（revoked）

  Scenario: Refresh Token 重複使用 - 拒絕輪換
    Given 已使用過的 Refresh Token（revoked = true）
    When 再次呼叫 POST /api/v1/auth/refresh 使用相同 Refresh Token
    Then HTTP 401 回應
    And 錯誤碼為 "token_revoked"
    And 不發放新 Token

  Scenario: Refresh Token 過期 - 拒絕輪換
    Given Refresh Token 已超過 7 天（TTL 過期）
    When 呼叫 POST /api/v1/auth/refresh
    Then HTTP 401 回應
    And 錯誤碼為 "token_expired"

  # ── 封號後拒絕 ──

  Scenario: 封號後即時踢出 WS（Close Code 4001）
    Given 玩家 "p1" 正在遊戲中（WS 連線中）
    When Admin 執行封號操作 POST /api/v1/admin/player/p1/ban
    Then 系統在 PostgreSQL 設定 is_banned = true
    And Redis 黑名單 key 設置（TTL = 60s）
    And Redis Pub/Sub 廣播封號事件至所有 Colyseus 節點
    And 玩家 WS 連線以 Close Code 4001 關閉（≤ 60 秒內）

  Scenario: 封號後嘗試重新連線 - 拒絕
    Given 玩家帳號已被封鎖（is_banned = true）
    When 玩家嘗試使用有效 JWT 加入房間
    Then onJoin 拋出 ServerError
    And 拒絕原因包含封號資訊

  Scenario: 多裝置登入 - 踢出舊裝置（Close Code 4005）
    Given 玩家 "p1" 已在裝置 A 登入
    When 玩家 "p1" 從裝置 B 登入（新 session）
    Then 裝置 A 收到 WS Close Code 4005
    And 裝置 B 登入成功

  # ── Rate Limit ──

  Scenario: Rate Limit - 認證端點 30 次/分鐘限制
    Given 來自同一 IP 的請求
    When 在 1 分鐘內發送 30 次 POST /api/v1/auth/login
    Then 前 29 次回應 HTTP 200 或 401（正常回應）
    And 第 30 次觸發 HTTP 429
    And 回應包含 Retry-After header

  Scenario: Rate Limit - 高敏感端點 5 次/分鐘限制
    Given 認證用戶發送請求
    When 在 1 分鐘內呼叫 6 次 POST /api/v1/player/daily-chip
    Then 第 6 次回應 HTTP 429

  Scenario: Rate Limit - IP 全局 300 次/分鐘限制
    Given 來自同一 IP 的大量請求
    When 在 1 分鐘內發送 301 次請求（任意端點）
    Then 第 301 次回應 HTTP 429

  Scenario: Rate Limit - WS 訊息速率 10 次/秒限制
    Given 玩家已連線至 SamGongRoom
    When 玩家每秒發送超過 10 條 WebSocket 訊息
    Then 超限訊息被丟棄
    And 伺服器回應 rate_limit { error: "rate_limit", retry_after_ms: <number> }

  # ── 登入流程 ──

  Scenario: 用戶登入成功
    Given 有效的登入憑證
    When 呼叫 POST /api/v1/auth/login { credential: <valid> }
    Then HTTP 200 回應
    And 回應包含 access_token 和 refresh_token
    And access_token 為 RS256 簽名的 JWT

  Scenario: 用戶登入失敗 - 憑證錯誤
    Given 無效的登入憑證
    When 呼叫 POST /api/v1/auth/login { credential: <invalid> }
    Then HTTP 401 回應
    And 錯誤碼為 "account_not_found"
    And 不洩漏帳號是否存在的資訊
