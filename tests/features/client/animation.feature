Feature: 動畫播放（客戶端動畫觸發與播放）
  As a 玩家
  I want to 看到流暢的遊戲動畫
  So that 我能直觀感受遊戲狀態的變化

  Background:
    Given 客戶端已與 Colyseus Server 建立 WebSocket 連線
    And 玩家已進入遊戲桌面（SCR-007）
    And 所有動畫資源已完成預載入

  # ── 發牌動畫 ──

  Scenario: 進入 dealing phase 時觸發發牌動畫
    Given 遊戲處於 waiting phase
    When Server 廣播 phase = "dealing"
    Then 客戶端觸發發牌動畫
    And 牌背面朝上（face-down）依序滑入每位玩家的 3 張手牌槽（slot）
    And 每張牌的滑入動畫間隔符合視覺節奏（順序為各玩家依 seat_index 順序）

  Scenario: dealing phase 結束後本玩家手牌翻面顯示
    Given dealing phase 發牌動畫播放中
    When Server 推送私人訊息 "myHand" 至本地玩家（包含 3 張牌資料）
    Then 本地玩家（P0）的 3 張手牌執行翻牌動畫（0.3s flip）
    And 翻面後顯示牌面（face-up，正確花色與點數）
    And 對手玩家手牌保持 face-down（不翻面）

  Scenario: showdown phase 觸發對手手牌翻面動畫
    Given 遊戲處於 player-bet phase
    When Server 廣播 phase = "showdown" 並同時廣播 "showdown_reveal"（含所有未棄牌玩家手牌）
    Then 所有未 Fold 玩家手牌依次執行翻牌動畫（0.3s flip per card）
    And 翻面後顯示對應牌面（花色、點數正確）
    And 已 Fold 玩家手牌保持 face-down 不翻面

  Scenario: 翻牌動畫完成後每位玩家手牌下方顯示點數標籤
    Given showdown 翻牌動畫播放完成
    Then 每位未棄牌玩家手牌下方顯示點數標籤
    And 三公玩家顯示「三公！」金色標籤

  # ── 結算動畫 ──

  Scenario: settled phase 觸發籌碼飛行動畫
    Given Server 廣播 phase = "settled"
    And settlement.winners 包含本地玩家（net_chips = 500）
    Then CMP-002 Chip Stack 執行籌碼飛行動畫（0.5s，籌碼飛向本玩家頭像區）
    And 動畫完成後本玩家 chip_balance 顯示更新後數值

  Scenario: 輸家結算動畫籌碼飛離玩家
    Given Server 廣播 phase = "settled"
    And settlement.losers 包含座位2玩家（net_chips = -300）
    Then 座位2 CMP-002 Chip Stack 執行籌碼飛離動畫（0.5s，籌碼飛向莊家區域）
    And 動畫完成後座位2 chip_balance 顯示更新後數值

  Scenario: Settlement Overlay 結算疊加層出現動畫
    Given Server 廣播 phase = "settled"
    When SCR-009 Settlement Overlay 顯示
    Then Overlay 以淡入動畫（fade-in）出現
    And 每位玩家結算行依序顯示（含頭像、手牌、net_chips 計數動畫 0.5s）
    And 正值 net_chips 以向上計數動畫顯示（#27AE60 綠色）
    And 負值 net_chips 以向下計數動畫顯示（#C0392B 紅色）

  # ── 三公特效 ──

  Scenario: 玩家手牌為三公時觸發金色光暈特效
    Given showdown 翻牌完成
    And 某玩家 SettlementEntry.is_sam_gong = true
    Then 該玩家 3 張手牌觸發金色邊框光暈動畫（fx_sam_gong_glow.anim）
    And 光暈顏色為 #D4AF37（金色）
    And Settlement Overlay 該玩家行顯示「三公！」金色標籤

  Scenario: 非三公手牌不觸發金色光暈特效
    Given showdown 翻牌完成
    And 某玩家 SettlementEntry.is_sam_gong = false
    Then 該玩家手牌不顯示任何光暈效果
    And Settlement Overlay 該玩家行不顯示「三公！」標籤

  # ── 莊家皇冠動畫 ──

  Scenario: 遊戲開始時莊家頭像顯示皇冠圖示
    Given Server 廣播 banker_seat_index = 3
    Then seat_index=3 玩家頭像右上角顯示皇冠圖示（ic_crown.png）
    And 頭像邊框顏色為 #D4AF37（金色）
    And 其他玩家頭像不顯示皇冠圖示

  Scenario: 輪莊後皇冠移動至新莊家頭像
    Given 上局莊家為 seat_index=1
    When Server 廣播新局 banker_seat_index = 2
    Then seat_index=1 頭像移除皇冠圖示與金色邊框
    And seat_index=2 頭像顯示皇冠圖示並套用金色邊框
    And 皇冠移動伴隨過渡動畫（舊皇冠淡出，新皇冠淡入）

  Scenario: 莊家破產時頭像顯示破產動畫
    Given Server 廣播 settlement.banker_insolvent = true
    Then 莊家頭像邊框閃爍 #C0392B（紅色）
    And 頭像上顯示「破產！」紅色標籤
    And CMP-003 玩家頭像套用破產視覺狀態

  # ── Loading 骨架動畫 ──

  Scenario: 玩家頭像圖片載入期間顯示骨架動畫
    Given 玩家頭像圖片正在網路下載
    Then CMP-003 頭像區域顯示骨架佔位圖（Skeleton circle）
    And 骨架動畫為灰色脈衝效果（pulse animation）
    And 圖片下載完成後直接切換為實際頭像（無過渡動畫）

  # ── 計時條動畫 ──

  Scenario: CMP-007 計時條顏色依剩餘時間動態變化
    Given player-bet phase 且本玩家輪到行動
    And action_deadline_timestamp 已由 Server 廣播
    When 剩餘時間 > 20 秒
    Then 計時條顏色為 #2980B9（藍色，正常）
    When 剩餘時間介於 10–20 秒
    Then 計時條顏色變為 #E67E22（橙色，警示）
    When 剩餘時間 ≤ 10 秒
    Then 計時條顏色變為 #C0392B（紅色，緊急）

  Scenario: 計時條歸零時執行閃爍動畫
    Given 本玩家輪到行動且計時條倒數中
    When 計時條剩餘時間歸零
    Then 計時條執行閃爍動畫（閃爍 3 次）
    And Client 等待 Server 確認最終行動（Client 不自行執行 Fold）
