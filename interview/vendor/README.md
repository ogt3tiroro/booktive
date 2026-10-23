# 同梱ライブラリ

| ファイル | 元のパッケージ | ライセンス |
| --- | --- | --- |
| `anthropic-sdk.js` | `@anthropic-ai/sdk` 0.132.1 を esbuild でブラウザ用の1ファイルにまとめたもの | MIT |
| `mammoth.browser.min.js` | `mammoth` 1.12.3（Word .docx の文字を取り出す） | BSD-2-Clause |

更新するとき:

```sh
npm i @anthropic-ai/sdk@<版> esbuild
echo 'export { default } from "@anthropic-ai/sdk";' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --platform=browser --outfile=anthropic-sdk.js
```
