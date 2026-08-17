#!/usr/bin/env node
// CLI 發布入口：載入 build 後的 dist/cli.js 並執行 main()。
// 開發期請改用 `pnpm dev:cli`（tsx src/cli.ts）。
import('./dist/cli.js')
  .then(async ({ main }) => {
    const code = await main();
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('[s12ryt-base] 無法載入 CLI，請先執行 `pnpm build`。');
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
