# 海島心臟病

可愛海島風的撲克牌「心臟病」。系統輪流自動翻牌、同時喊 A、2、3……K，
翻出來的點數跟喊的數字一樣就趕快拍，最慢（或拍錯）的人收走整疊牌，先把牌出完的人獲勝。

- 一副 52 張、沒有鬼牌；系統排好座位順序，一人一張輪流發完
- 每次收牌後由收牌者按「自動發牌」，並從 A 重新喊
- 單機：跟 1～3 個電腦玩，四段難度（幼幼班／簡單／普通／困難）
- 線上：2～4 人房間、電腦補位、觀戰（上限 20 人）、邀請連結、聊天室、斷線重連
- 手機／平板／桌機直橫向都能玩；右上角設定可調音樂、音效、喊數語音、震動、減少動態、四色牌
- 整個專案零依賴，不需要 `npm install`

## 怎麼啟動

**Windows**：雙擊 `啟動遊戲.bat`，會自動打開 <http://localhost:3080>。

**其他**：

```bash
npm start            # 或 node server.js；換埠號：PORT=4000 npm start
```

只想玩單機也可以直接用瀏覽器打開 `public/index.html`（這時沒有線上模式）。

## 操作

| 動作 | 觸控 | 鍵盤 |
| --- | --- | --- |
| 拍牌 | 按紅色「拍牌」鈕，或直接點中間牌堆 | 空白鍵 |
| 開始／自動發牌 | 輪到你時出現的按鈕 | Enter |
| 暫停／選單 | 左上角（寬螢幕在左欄上方） | Esc |
| 設定 | 右上角齒輪 | — |

線上拍牌以「伺服器收到的先後」判定，網路較慢的人可能被記成比較晚拍，進大廳時會提示。

## 測試

```bash
npm run verify       # 規則＋電腦、線上房間、無頭瀏覽器（沒有 Playwright 會自動略過）
npm test             # 只跑規則與電腦
npm run test:online  # 只跑線上
```

瀏覽器檢查的截圖會存到 `screenshots/`。

## 部署（Render 伺服器 ＋ GitHub Pages 前端）

1. 伺服器：把 repo 匯入 Render，會讀 `render.yaml`（免費方案、`node server.js`、健康檢查 `/health`）。
   環境變數 `ALLOW_ORIGIN` 填前端網址（例如 `https://<帳號>.github.io`）。
2. 前端：`.github/workflows/pages.yml` 在 push 到 `main` 時跑測試、把 `GAME_SERVER_URL`
   注入 `public/js/config.js`，再把 `public/` 佈署到 GitHub Pages。
   網址優先序：手動執行時填的值 → repo Variable `GAME_SERVER_URL` → workflow 裡的 `DEFAULT_GAME_SERVER_URL`。
3. 伺服器位置只從 `config.js` 取得；也可以用 `?server=https://...` 臨時指定。正式建置不接受 localhost。

免費方案限制：服務會休眠（第一次進入要等 30～60 秒，畫面會顯示「喚醒伺服器中」），
房間只存在記憶體，服務重啟後未打完的對局不會恢復。

## 環境變數

見 `.env.example`：`PORT`（預設 3080）、`GAME_SERVER_URL`、`ALLOW_ORIGIN`。

## 資產

所有美術（撲克牌、動物、圖示）都是程式內手繪 SVG；音樂與音效用 Web Audio 即時合成；喊數語音有兩種來源：
內建錄音（`public/js/voice-clips.js`，用開源 espeak-ng 離線合成 A、二……十、J、Q、K 共 13 段，跟翻牌同時念出）
和裝置的中文語音。設定裡的「喊數聲音」可選自動／遊戲內建／裝置語音，並可試聽。沒有外部素材與授權問題。要換成正式美術或音檔，只需替換 `public/js/art.js`、`public/js/audio.js`；換真人喊數錄音就把 `voice-clips.js` 裡 13 段 mp3（base64）換掉。
