# 問句王

富邦人壽業務夥伴共用的反對問題問句庫。手機打開就能用：一次只看一句，順著客戶的回答往下問，五宮格會跟著亮。

網站：<https://dashin-team.github.io/objection-mindmap/>

題庫在 `data/bank.json`，共 240 題（保險 60、理財 80、進階 100），加上準客戶九宮格 9 格、目標五宮格 5 格。沒有登入、沒有追蹤、沒有外連字型。

## 怎麼用

- 首頁可以搜尋反對問題的標題，以及每一句問法（主問句、追問、收尾）。
- 三本題庫按分類展開。點一題進去。
- 開場話術收在「開場話術」裡：C 同理、A 確認、R 延伸。
- 畫面上只顯示現在這一句，和客戶可能的回答。點一個回答，就換成下一句。
- 「上一步」回到上一句。路徑可以點麵包屑跳回去。
- 問完，或隨時按「進入收尾」，會看到橋接問句、兩種客戶回答和接著問的話，以及邀請下一步。
- 下面的目標五宮格：現在這句屬於哪一面，那一格就亮。格子裡可以記下客戶的回答。
- 「複製五宮格」會複製成文字，貼到 LINE。
- 「投稿」可以補新的反對問題，或在某一句下面加客戶回答和追問。

## 筆記只留在手機

五宮格的文字存在這支手機的 localStorage（鍵名 `wenjuwang-five-notes-v1`），不會上傳。換題目也不會清掉，方便同一位客戶連著談。換下一位客戶前，請先複製或按清除。

請不要把客戶的姓名、電話、身分證寫進格子，也不要寫進投稿。

## 修改題庫

題目都在 `data/bank.json`。改完推上 `main`，GitHub Pages 會更新。

頂層有四個欄位：

| 欄位 | 內容 |
| --- | --- |
| `version` | 日期，顯示在頁尾 |
| `banks` | 三本題庫的 id 與名稱 |
| `frameworks` | 九宮格、五宮格。每一格有 `name`、`purpose`、`C`、`A`、`R`、`E` |
| `objections` | 240 題反對問題 |

一題反對問題：

| 欄位 | 說明 |
| --- | --- |
| `id` | `ins-001`、`fin-001`、`adv-001` 這種編號。不要改已上線的 id，否則舊連結會失效 |
| `bank` | `insurance`、`finance` 或 `advanced` |
| `bankTitle` | 保險反對問題、理財反對問題、保險進階反對問題 |
| `category` | 分類名稱 |
| `n` | 該題庫裡的序號 |
| `title` | 客戶的反對問題 |
| `C` `A` `R` | 同理、確認、延伸 |
| `E` | 探詢問句，至少一句 |
| `tree` | 一層一層的問句，見下方 |
| `closing` | 收尾，見下方 |

`tree` 的形狀：

```json
{
  "dimension": "目標",
  "text": "主問句",
  "branches": [
    {
      "clientSays": "客戶可能的回答",
      "dimension": "需求",
      "followUp": "我們接著問的話",
      "branches": []
    }
  ]
}
```

`dimension` 只使用這五個：目標、需求、決策流程、資源分配、競爭情報。每一層放 2 到 3 個客戶回答。`closing`：

```json
{
  "bridge": "帶到下一步的問句",
  "replies": [
    { "clientSays": "客戶可能的回答", "followUp": "接著問的一句" },
    { "clientSays": "另一種回答", "followUp": "接著問的一句" }
  ],
  "nextStep": "邀請下一步的一句話，是邀請，不是成交"
}
```

改完先確認 JSON 沒有壞掉：

```bash
python3 -m json.tool data/bank.json > /dev/null
node test/logic.test.mjs
```

五宮格第 5 格（競爭情報）的問句若要分外部、內部，在句子前面加上 `外部｜` 或 `內部｜`。

## 夥伴投稿

步驟寫在 [apps-script/SETUP.md](apps-script/SETUP.md)。摘要：

1. 把 `apps-script/Code.gs` 貼到試算表的 Apps Script，部署成「任何人」可開啟的網頁應用程式。
2. 把 `/exec` 網址填進 `js/config.js` 的 `SUBMIT_ENDPOINT`。
3. 預設是空字串。空的時候，表單仍可用：會產生一段文字，夥伴複製後貼到 LINE。
4. 填了網址之後，表單直接寫入試算表。`approved` 未勾的不會出現。勾了之後，網站會併進題庫，標成「夥伴分享」，並顯示投稿人名字。

`doPost` 新增一列。`doGet` 回傳 `approved` 為 TRUE 的列。

## 發布

這個網站是靜態檔，不用建置。檔案在 `main` 的根目錄。倉庫裡的 `.nojekyll` 是為了讓 Pages 不要用 Jekyll 處理這些檔案。

到 GitHub 倉庫的 **Settings → Pages**：

1. Source 選 **Deploy from a branch**。
2. Branch 選 `main`，資料夾選 `/ (root)`。
3. 按 Save。

約一分鐘後打開 <https://dashin-team.github.io/objection-mindmap/>。若還是 404，再等一下重新整理。
