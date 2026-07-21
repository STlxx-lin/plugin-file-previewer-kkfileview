import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimePublicBase, normalizePublicPath, resolveFileUrl } from '../runtimeUrl';

describe('runtimeUrl', () => {
  const originalPublicPath = window.__nocobase_public_path__;

  afterEach(() => {
    window.__nocobase_public_path__ = originalPublicPath;
    window.history.replaceState({}, '', '/');
  });

  it('normalizePublicPath 应该将公共路径归一化为首尾带斜杠的格式', () => {
    expect(normalizePublicPath('v')).toBe('/v/');
    expect(normalizePublicPath('/v')).toBe('/v/');
    expect(normalizePublicPath('/v/')).toBe('/v/');
    expect(normalizePublicPath('')).toBe('/');
  });

  it('getRuntimePublicBase 应该优先读取运行时公共路径', () => {
    window.__nocobase_public_path__ = '/v/';
    expect(getRuntimePublicBase()).toBe('http://localhost:3000/v/');
  });

  it('resolveFileUrl 应该为相对附件地址自动补上运行时公共路径并剥离前端路由前缀', () => {
    window.__nocobase_public_path__ = '/v/';
    expect(resolveFileUrl('/storage/uploads/demo.docx')).toBe('http://localhost:3000/storage/uploads/demo.docx');
  });

  it('resolveFileUrl 应该在根路径场景下保持原有补全结果', () => {
    window.__nocobase_public_path__ = '/';
    expect(resolveFileUrl('/storage/uploads/demo.docx')).toBe('http://localhost:3000/storage/uploads/demo.docx');
  });

  it('resolveFileUrl 应该优先使用手工配置的 nocobaseHost 并剥离前端路由前缀', () => {
    window.__nocobase_public_path__ = '/v/';
    expect(resolveFileUrl('/storage/uploads/demo.docx', 'http://localhost:13000/v')).toBe(
      'http://localhost:13000/storage/uploads/demo.docx',
    );
  });

  it('resolveFileUrl 应该对绝对 URL 保持透传', () => {
    window.__nocobase_public_path__ = '/v/';
    expect(resolveFileUrl('https://cdn.example.com/demo.docx')).toBe('https://cdn.example.com/demo.docx');
  });
});
