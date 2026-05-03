# DiggAI v0.6.1

DiggAI 是一个纯 Firefox WebExtension，会在 `chatgpt.com` 和 `chat.openai.com` 页面右侧注入控制面板，用于从原始提示词 A 一键开始自动迭代追问。

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

## 使用方式

1. 打开 `https://chatgpt.com/`
2. 在 DiggAI 面板的“原始提示词 A”里输入第一次问题
3. 设置最大迭代轮数
4. 可选填写自定义追加字符串
5. 点击“开始迭代”
6. 插件会自动发送 A，并继续基于最新回答追问，直到达到轮数或检测到“局部收敛：是”

## 调试区

高级调试区里的“捕获 A+B”“仅捕获最新回答”“生成下一轮 Prompt”“填入输入框”仅用于页面异常时手动排查，不是正常使用流程。

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
