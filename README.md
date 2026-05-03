# DiggAI v0.5.1

DiggAI 是一个纯 Firefox WebExtension，会在 `chatgpt.com` 和 `chat.openai.com` 页面右侧注入控制面板，用于围绕原始问题 A 和最新回答 B/C/D 进行迭代收敛追问。

## 文件结构

```text
F:\work\github\diggAI
  manifest.json
  README.md
  src\
    shared\
      promptBuilder.js
    content\
      content.js
      panel.css
  scripts\
    install-to-f-drive.ps1
```

## 临时加载

1. 打开 Firefox Developer Edition。
2. 访问 `about:debugging`。
3. 进入 `This Firefox`。
4. 点击 `Load Temporary Add-on`。
5. 选择 `F:\work\github\diggAI\manifest.json`。

## 本地检查

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-to-f-drive.ps1
```

脚本会执行：

- `node --check .\src\shared\promptBuilder.js`
- `node --check .\src\content\content.js`
- `Get-Content .\manifest.json | ConvertFrom-Json | Out-Null`
- 检查 JS 文件中不存在 Markdown 代码块标记
