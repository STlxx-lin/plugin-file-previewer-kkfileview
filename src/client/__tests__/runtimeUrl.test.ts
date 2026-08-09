import { afterEach, describe, expect, it } from 'vitest';
import { FILE_VIEWER_PROXY_PATH_KEYWORD } from '../../shared/constants';
import { buildFileViewerProxyUrl, getApiBaseUrl, getRuntimePublicBase, isFileViewerProxyUrl, normalizePublicPath, resolveFileUrl } from '../runtimeUrl';

describe('runtimeUrl', () => {
  const originalPublicPath = window.__nocobase_public_path__;
  const originalApiBaseUrl = (window as any).__nocobase_api_base_url__;

  afterEach(() => {
    window.__nocobase_public_path__ = originalPublicPath;
    (window as any).__nocobase_api_base_url__ = originalApiBaseUrl;
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

  it('getApiBaseUrl 应该优先读取运行时 API 基址，否则回退默认 /api', () => {
    (window as any).__nocobase_api_base_url__ = '/custom-api';
    expect(getApiBaseUrl()).toBe('/custom-api');
    (window as any).__nocobase_api_base_url__ = undefined;
    expect(getApiBaseUrl()).toBe('/api');
  });

  it('buildFileViewerProxyUrl 应该生成指向 File Viewer 安全代理的完整地址', () => {
    const url = 'http://localhost:13000/storage/uploads/demo.pdf';
    const proxy = buildFileViewerProxyUrl(url, 'jwt_token_123');
    expect(proxy).toContain(`/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}:get`);
    expect(proxy).toContain(encodeURIComponent(url));
    expect(proxy).toContain('token=jwt_token_123');
  });

  it('buildFileViewerProxyUrl 在无 token 时不应附加 token 参数', () => {
    const proxy = buildFileViewerProxyUrl('/storage/uploads/demo.pdf', null);
    expect(proxy).toContain('url=');
    expect(proxy).not.toContain('token=');
  });

  it('buildFileViewerProxyUrl 对空输入返回空字符串', () => {
    expect(buildFileViewerProxyUrl('', 'token')).toBe('');
  });

  it('isFileViewerProxyUrl 识别 File Viewer 代理地址', () => {
    expect(isFileViewerProxyUrl(`/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}:get?url=1`)).toBe(true);
    expect(isFileViewerProxyUrl(`http://localhost:13000/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}:get`)).toBe(true);
    expect(isFileViewerProxyUrl(`/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}`)).toBe(false);
    expect(isFileViewerProxyUrl('/files/main/main/attachments/13.pdf')).toBe(false);
    expect(isFileViewerProxyUrl('')).toBe(false);
  });
});
