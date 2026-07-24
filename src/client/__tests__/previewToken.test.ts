import { describe, expect, it } from 'vitest';
import { attachTokenToNocoFileUrl } from '../previewUtils';

describe('attachTokenToNocoFileUrl', () => {
  it('应该对空的 url 或 token 返回原始 url', () => {
    expect(attachTokenToNocoFileUrl('', 'token123')).toBe('');
    expect(attachTokenToNocoFileUrl('http://example.com/demo.pdf', '')).toBe('http://example.com/demo.pdf');
    expect(attachTokenToNocoFileUrl('http://example.com/demo.pdf', null)).toBe('http://example.com/demo.pdf');
  });

  it('应该为 NocoBase 永久文件路径（/files/）追加 token 参数', () => {
    const url = 'http://localhost:13000/files/main/main/attachments/13.pdf';
    const result = attachTokenToNocoFileUrl(url, 'jwt_token_123');
    expect(result).toBe('http://localhost:13000/files/main/main/attachments/13.pdf?token=jwt_token_123');
  });

  it('应该为相对 /files/ 路径追加 token 参数', () => {
    const url = '/files/main/main/attachments/13.pdf';
    const result = attachTokenToNocoFileUrl(url, 'jwt_token_123');
    expect(result).toBe('/files/main/main/attachments/13.pdf?token=jwt_token_123');
  });

  it('如果 URL 已有其他 query 参数，应该使用 & 分隔符追加 token', () => {
    const url = 'http://localhost:13000/files/main/main/attachments/13.pdf?download=1';
    const result = attachTokenToNocoFileUrl(url, 'jwt_token_123');
    expect(result).toBe('http://localhost:13000/files/main/main/attachments/13.pdf?download=1&token=jwt_token_123');
  });

  it('如果 URL 中已经包含 token= 参数，应该保持原样不再重复追加', () => {
    const url = 'http://localhost:13000/files/main/main/attachments/13.pdf?token=existing';
    const result = attachTokenToNocoFileUrl(url, 'new_token');
    expect(result).toBe('http://localhost:13000/files/main/main/attachments/13.pdf?token=existing');
  });

  it('对非 /files/ 的外部云存储直链（如 S3 OBS 直链），不应该追加 NocoBase token', () => {
    const url = 'https://obs.test.com/aifle/测试页-sk8cpe.pdf';
    const result = attachTokenToNocoFileUrl(url, 'jwt_token_123');
    expect(result).toBe('https://obs.test.com/aifle/测试页-sk8cpe.pdf');
  });
});
