# DIAGRAMS — 三公遊戲 系統流程圖

## Document Control

| Field | Value |
|-------|-------|
| Version | v1.0 |
| Date | 2026-04-21 |
| Author | devsop-autodev STEP-13 |

---

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph Client["🎮 Cocos Creator Client (Web)"]
        GM[GameManager\nSingleton]
        GPC[GamePlayController]
        CC[CardComponent]
        PS[PlayerSlotComponent]
    end

    subgraph Server["⚙️ Colyseus Server (Node.js 20)"]
        ROOM[SamGongRoom]
        SM[State Machine]
        subgraph Logic["Game Logic (Pure Functions)"]
            DECK[deck.ts]
            EVAL[evaluator.ts]
            SETTLE[settlement.ts]
            BANKER[banker.ts]
        end
        SCHEMA[SamGongState\n@colyseus/schema]
    end

    subgraph Infra["🏗️ Infrastructure"]
        NGINX[Nginx\n:80/:443]
        SQLITE[(SQLite\nAudit Log)]
    end

    Browser -->|HTTP| NGINX
    Browser -->|WebSocket| NGINX
    NGINX -->|ws://| ROOM
    NGINX -->|static| Client
    GM <-->|Colyseus WS| ROOM
    ROOM --> SM
    SM --> Logic
    ROOM --> SCHEMA
    SCHEMA -->|Diff Sync| GM
    GM --> GPC
    GPC --> CC
    GPC --> PS
    ROOM -->|Audit| SQLITE
```

---

## 2. Game State Machine

```mermaid
stateDiagram-v2
    [*] --> lobby : Room Created

    lobby --> banker_selection : start_game\n(host, ≥2 players)
    banker_selection --> betting : Banker Selected\n(random/rotation)

    betting --> dealing : ≥1 player called\n(30s timeout)
    betting --> lobby : All players folded\n(no-game 流局)

    dealing --> reveal : Cards dealt\nto all players

    reveal --> settling : Countdown expired\n(10s) or all ready

    settling --> round_end : Settlement\ncalculated

    round_end --> betting : Next round\n(banker rotates)
    round_end --> lobby : Game ends\n(explicit or all leave)

    note right of betting
        莊家設底注
        閒家跟注/棄牌
        30秒倒計時
    end note

    note right of reveal
        Server廣播所有牌
        客戶端翻牌動畫
    end note
```

---

## 3. Card Dealing Sequence (Anti-Cheat Critical)

```mermaid
sequenceDiagram
    participant C1 as Client P1 (玩家)
    participant C2 as Client P2 (莊家)
    participant SRV as Colyseus Server
    participant LOGIC as Game Logic

    Note over SRV, LOGIC: Server-Authoritative: Cards never leave server before reveal

    SRV->>LOGIC: shuffle(createDeck())
    LOGIC-->>SRV: shuffledDeck[52]

    SRV->>SRV: deal 3 cards to P1
    SRV->>SRV: deal 3 cards to P2 (banker)
    SRV->>SRV: store cards in SamGongState\n(revealed=false)

    Note over SRV: @filter: each player only sees own cards

    SRV-->>C1: Schema diff: my 3 cards (♠A, ♥7, ♣3)
    SRV-->>C2: Schema diff: my 3 cards (♦K, ♠Q, ♥J)

    Note over C1: P1 sees: [♠A][♥7][♣3]
    Note over C2: P2 sees: [♦K][♠Q][♥J]
    Note over C1: P1 cannot see P2's cards ✅
```

---

## 4. Reveal & Settlement Sequence

```mermaid
sequenceDiagram
    participant ALL as All Clients
    participant SRV as Colyseus Server
    participant DB as SQLite

    SRV->>SRV: countdown 10s expires
    SRV->>SRV: set all cards revealed=true
    SRV-->>ALL: Schema diff: all cards visible

    Note over ALL: Flip animation plays for each player

    SRV->>SRV: compareHands(player, banker)\nfor each non-folded player
    SRV->>SRV: calculateSettlement()
    SRV-->>ALL: broadcast "game_result"\n[{sessionId, outcome, chipsChange}]

    SRV->>DB: INSERT game_records\n(audit log)

    SRV->>SRV: update chips\nrotate banker
    SRV-->>ALL: Schema diff: new chips, new banker

    Note over ALL: Settlement animation\nchips flow to winners
```

---

## 5. Reconnection Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant SRV as Colyseus Server
    participant ROOM as SamGongRoom

    C->>SRV: WebSocket disconnect
    SRV->>ROOM: onLeave(client, consented=false)
    ROOM->>ROOM: player.status = "disconnected"
    ROOM->>ROOM: allowReconnection(client, 60)

    Note over ROOM: 60 second window\nGame continues without this player\n(auto-fold if in betting phase)

    alt Reconnect within 60s
        C->>SRV: client.reconnect(roomId, sessionId)
        SRV->>ROOM: client reconnected
        ROOM->>ROOM: player.status = "waiting"
        SRV-->>C: Full state sync\n(current game state)
        Note over C: Resume from current phase
    else Timeout (60s exceeded)
        ROOM->>ROOM: reconnection rejected
        ROOM->>ROOM: auto-fold / remove player
        Note over C: Shows "已離開房間"\nreturns to main menu
    end
```

---

## 6. Betting Flow

```mermaid
flowchart TD
    A[BETTING Phase Start] --> B[Banker sets bet amount\n10/20/50/100]
    B --> C{All players\ndecide?}

    C -->|30s timeout| D[Auto-fold undecided players]
    C -->|All decided| E{Any player\ncalled?}
    D --> E

    E -->|No - all folded| F[流局 No-Game\nReturn to LOBBY]
    E -->|Yes ≥1 called| G[DEALING Phase\nServer shuffles & deals]

    style F fill:#ff6b6b,color:#fff
    style G fill:#51cf66,color:#fff
```

---

## 7. Banker Rotation

```mermaid
flowchart LR
    subgraph BankerQueue["bankerQueue: [P1, P2, P3, P4]"]
        P1["P1\n(Current Banker 👑)"]
        P2["P2"]
        P3["P3"]
        P4["P4"]
    end

    P1 -->|"Round ends\nrotate()"| P2
    P2 -->|"Next round"| P3
    P3 -->|"Next round"| P4
    P4 -->|"Wraps around"| P1

    style P1 fill:#FFD700,color:#000
```

---

## 8. Error Handling Flow

```mermaid
flowchart TD
    MSG[Client sends message] --> V1{Valid\nsessionId?}
    V1 -->|No| E4003[Error 4003\nUNAUTHORIZED]
    V1 -->|Yes| V2{Correct\ngame phase?}
    V2 -->|No| E4004[Error 4004\nWRONG_PHASE]
    V2 -->|Yes| V3{Correct\nrole? Banker/Player}
    V3 -->|No| E4003b[Error 4003\nUNAUTHORIZED]
    V3 -->|Yes| V4{Valid\npayload?}
    V4 -->|No| E4006[Error 4006/4007\nINVALID INPUT]
    V4 -->|Yes| PROCESS[Process Message\nUpdate State]

    style E4003 fill:#ff6b6b,color:#fff
    style E4004 fill:#ff6b6b,color:#fff
    style E4003b fill:#ff6b6b,color:#fff
    style E4006 fill:#ff6b6b,color:#fff
    style PROCESS fill:#51cf66,color:#fff
```

---

## 9. Component Dependency Graph

```mermaid
graph LR
    subgraph Server
        IR[index.ts] --> SGR[SamGongRoom.ts]
        SGR --> SGS[SamGongState.ts]
        SGR --> DK[deck.ts]
        SGR --> EV[evaluator.ts]
        SGR --> ST[settlement.ts]
        SGR --> BK[banker.ts]
        SGR --> DB[gameRecords.ts]
    end

    subgraph Client
        GPC2[GamePlayController] --> GMG[GameManager]
        GPC2 --> CCC[CardComponent]
        GPC2 --> PSC[PlayerSlotComponent]
        GPC2 --> BPC[BettingPanelComponent]
        GMG --> COL[Colyseus.js SDK]
    end

    subgraph Shared
        TY[shared/types.ts]
    end

    SGR -.->|uses types| TY
    GMG -.->|uses types| TY
    COL <-->|WebSocket| SGR
```
