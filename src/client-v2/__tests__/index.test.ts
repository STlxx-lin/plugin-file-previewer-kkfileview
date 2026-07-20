import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/client', () => {
  throw new Error('client-v2 entry should not eagerly import @nocobase/client');
});

vi.mock('@nocobase/plugin-file-manager/client', () => {
  throw new Error('client-v2 entry should not eagerly import @nocobase/plugin-file-manager/client');
});

vi.mock('@nocobase/client-v2', () => ({
  Plugin: class Plugin {},
}));

vi.mock('@nocobase/plugin-file-manager/client-v2', () => ({
  filePreviewTypes: {
    add: vi.fn(),
  },
}));

describe('client-v2 index', () => {
  it('should load the modern entry without eagerly touching legacy client modules', async () => {
    const mod = await import('../index');
    expect(mod.default).toBeDefined();
  });
});
