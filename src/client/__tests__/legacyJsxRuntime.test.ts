import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 锁定 legacy `/admin` 入口使用的 TSX 文件列表，避免再次回到不兼容的自动 JSX 运行时。
const legacyClientTsxFiles = [
  'GlobalWatermarkProvider.tsx',
  'KKFilePreviewer.tsx',
  'SettingsPage.tsx',
  'index.tsx',
  'settingsSections.tsx',
];

describe('legacy client JSX runtime', () => {
  it('should pin classic JSX runtime for legacy admin TSX files', () => {
    legacyClientTsxFiles.forEach((fileName) => {
      // 从测试目录回到 legacy client 目录后读取目标文件头部，检查 pragma 是否存在。
      const filePath = path.resolve(__dirname, '..', fileName);
      // 只读取前几行即可覆盖 pragma 场景，避免测试和实现细节耦合过深。
      const header = readFileSync(filePath, 'utf8').split(/\r?\n/).slice(0, 5).join('\n');

      expect(header).toContain('@jsxRuntime classic');
    });
  });
});
