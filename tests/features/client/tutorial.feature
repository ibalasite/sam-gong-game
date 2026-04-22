Feature: 教學流程（客戶端新手引導 UI）
  As a 新玩家
  I want to 透過三輪教學了解三公遊戲玩法
  So that 我能掌握基本操作後進入正式對戰

  Background:
    Given 客戶端已與 Colyseus Server 建立 WebSocket 連線

  # ── 教學觸發入口 ──

  Scenario: 首次登入自動進入教學流程
    Given 玩家首次登入（無教學完成記錄）
    When 客戶端完成資源載入進入主大廳（SCR-004）
    Then 客戶端自動跳轉至 SCR-008 教學畫面
    And 顯示教學第一輪（R1）的說明文字與固定牌局
    And 教學模式標籤顯示於畫面頂部

  Scenario: 點擊大廳「新手引導」按鈕進入教學
    Given 玩家在主大廳（SCR-004）
    When 玩家點擊底部快捷列「新手引導」按鈕
    Then 客戶端跳轉至 SCR-008 教學畫面
    And 顯示教學第一輪（R1）起始說明

  # ── 教學第一輪（R1）──

  Scenario: R1 教學顯示固定牌局說明文字
    Given 玩家進入 SCR-008 教學模式（R1）
    When R1 教學初始化
    Then 畫面顯示教學說明文字（i18n: tutorial.round1.intro）
    And 顯示 R1 固定牌局的手牌（面朝下狀態）
    And 說明文字提示玩家「本輪您為閒家，請觀察莊家下注後決定跟注或棄牌」

  Scenario: R1 教學中提示文字引導玩家完成跟注操作
    Given 玩家在 R1 教學中，莊家已下注（Server TutorialScriptEngine 固定劇本）
    When 輪到玩家行動（player-bet phase）
    Then 顯示提示文字「提示：點擊「跟注」可以跟進莊家的賭注」
    And Call 按鈕以高亮框線強調
    And Fold 按鈕同時可見（玩家可自由選擇）

  Scenario: R1 教學跟注後顯示結算結果說明
    Given 玩家在 R1 教學中且已點擊 Call
    When Server TutorialScriptEngine 廣播 phase = "settled"
    Then Settlement Overlay 顯示 R1 結算結果
    And 說明文字顯示「比較牌點：您的點數 vs 莊家點數」
    And 顯示「繼續下一局」按鈕

  # ── 教學第二輪（R2）──

  Scenario: R1 完成後自動進入 R2 教學
    Given 玩家已完成 R1 教學
    When 玩家點擊「繼續下一局」按鈕
    Then 客戶端顯示 R2 教學說明文字（i18n: tutorial.round2.intro）
    And 說明文字提示「本輪介紹棄牌操作，當您認為勝算低時可選擇棄牌」
    And 教學輪次標示更新為「教學 2/3」

  Scenario: R2 教學中提示文字引導玩家完成棄牌操作
    Given 玩家在 R2 教學中，輪到玩家行動（player-bet phase）
    Then 顯示提示文字「提示：點擊「棄牌」可保留部分籌碼，放棄本輪競爭」
    And Fold 按鈕以高亮框線強調
    And 說明文字指出棄牌不扣除籌碼

  Scenario: R2 教學結算後顯示棄牌結果說明
    Given 玩家在 R2 教學中且已點擊 Fold
    When Server TutorialScriptEngine 廣播 phase = "settled"（R2）
    Then Settlement Overlay 顯示棄牌玩家行：「棄牌」灰色標籤，net_chips = 0
    And 說明文字顯示「棄牌玩家不參與比牌，籌碼無損失」

  # ── 教學第三輪（R3）──

  Scenario: R2 完成後自動進入 R3 教學
    Given 玩家已完成 R2 教學
    When 玩家點擊「繼續下一局」按鈕
    Then 客戶端顯示 R3 教學說明文字（i18n: tutorial.round3.intro）
    And 說明文字提示「本輪介紹三公（Sam Gong）特殊牌型」
    And 教學輪次標示更新為「教學 3/3」

  Scenario: R3 教學顯示三公特效說明
    Given 玩家在 R3 教學中，showdown 翻牌後某玩家出現三公
    When Server TutorialScriptEngine 廣播 showdown_reveal（含三公玩家）
    Then 三公玩家手牌觸發金色光暈特效（fx_sam_gong_glow.anim）
    And 顯示說明文字「三公（Sam Gong）！三張都是 10/J/Q/K，點數為 0 但最強！賠率 N=3」
    And Settlement Overlay 顯示「三公！」金色標籤於對應玩家行

  Scenario: R3 教學結算完成後顯示教學完成頁面
    Given 玩家已完成 R3 教學結算
    When Settlement Overlay 顯示並玩家點擊「完成教學」按鈕
    Then 顯示教學完成頁面（i18n: tutorial.complete）
    And 頁面標題「教學完成！」
    And 頁面說明「您已掌握三公基本玩法，現在可以開始正式對戰！」
    And 顯示「進入正式對戰」按鈕

  # ── 教學完成後解鎖正式對戰 ──

  Scenario: 教學完成後點擊「進入正式對戰」跳轉至廳別選擇
    Given 教學完成頁面已顯示
    When 玩家點擊「進入正式對戰」按鈕
    Then 客戶端導向主大廳（SCR-004）
    And 教學完成標記寫入本地 / 由 Server 記錄
    And 廳別選擇按鈕解鎖（不再觸發自動教學）

  Scenario: 已完成教學的玩家再次登入不自動跳轉教學
    Given 玩家教學完成記錄存在（is_tutorial_completed = true）
    When 玩家登入並進入主大廳（SCR-004）
    Then 客戶端不自動跳轉至 SCR-008 教學畫面
    And 「新手引導」按鈕仍顯示（可選擇再次進入教學）

  # ── 教學 UI 細節 ──

  Scenario: 教學模式下牌局不包含真實業務邏輯結果
    Given 玩家在 SCR-008 教學模式
    Then 教學牌局由 Server TutorialScriptEngine 固定劇本驅動
    And Client 不計算任何點數、比牌、結算邏輯
    And Client 僅渲染 Server 廣播的固定 Room State

  Scenario: 教學說明文字來自 i18n 外部化，非硬編碼
    Given 玩家在 SCR-008 教學任意輪次
    Then 所有說明文字從 locale/zh-TW.json 中 tutorial 命名空間取得
    And Client bundle 不包含任何硬編碼教學字串常數

  Scenario: 跳過教學說明文字後繼續下一步
    Given 玩家在 R1 教學且說明文字正在顯示
    When 玩家點擊「跳過說明」按鈕
    Then 說明文字消失
    And 進入當前教學輪次的實際操作步驟（等待玩家行動）
    And 教學進度不重置（仍在 R1）
