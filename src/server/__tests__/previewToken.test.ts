import { afterEach, describe, expect, it } from 'vitest';
import { FILE_VIEWER_PROXY_PATH_KEYWORD } from '../../shared/constants';
import {
  FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE,
  FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN,
  FILE_VIEWER_PREVIEW_TOKEN_SCOPE,
  buildFileViewerPreviewTokenPayload,
  getPreviewTokenExpiresIn,
  isFileViewerPreviewTokenPayload,
  isFileViewerProxyUrl,
  isNocoBaseManagedFileUrl,
  parsePreviewTokenExpiresInToMs,
} from '../previewToken';

describe('getPreviewTokenExpiresIn', () => {
  const originalEnv = process.env.KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN;
    } else {
      process.env.KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN = originalEnv;
    }
  });

  it('未配置时回退到默认 10 分钟', () => {
    delete process.env.KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN;
    expect(getPreviewTokenExpiresIn()).toBe(FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN);
  });

  it('接受合法的分钟格式', () => {
    expect(getPreviewTokenExpiresIn('5m')).toBe('5m');
  });

  it('接受合法的秒格式', () => {
    expect(getPreviewTokenExpiresIn('300s')).toBe('300s');
  });

  it('超出上限时回退到默认值', () => {
    expect(getPreviewTokenExpiresIn('60m')).toBe(FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN);
  });

  it('低于下限时回退到默认值', () => {
    expect(getPreviewTokenExpiresIn('30s')).toBe(FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN);
  });

  it('格式非法时回退到默认值', () => {
    expect(getPreviewTokenExpiresIn('forever')).toBe(FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN);
  });

  it('环境变量配置的分钟格式同样生效', () => {
    process.env.KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN = '8m';
    expect(getPreviewTokenExpiresIn()).toBe('8m');
  });
});

describe('buildFileViewerPreviewTokenPayload', () => {
  it('包含用户、作用域与目标地址绑定', () => {
    const payload = buildFileViewerPreviewTokenPayload(1, {
      roleName: 'admin',
      targetUrl: '/files/main/main/attachments/13.pdf',
    });
    expect(payload.userId).toBe(1);
    expect(payload.aud).toBe(FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE);
    expect(payload.scope).toBe(FILE_VIEWER_PREVIEW_TOKEN_SCOPE);
    expect(payload.targetUrl).toBe('/files/main/main/attachments/13.pdf');
    expect(payload.roleName).toBe('admin');
  });

  it('roleName 缺失时不应写入负载', () => {
    const payload = buildFileViewerPreviewTokenPayload(1, { targetUrl: '' });
    expect(payload.roleName).toBeUndefined();
    expect(payload.targetUrl).toBe('');
  });
});

describe('isFileViewerPreviewTokenPayload', () => {
  it('正确识别 File Viewer 预览令牌负载', () => {
    expect(
      isFileViewerPreviewTokenPayload({
        aud: FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE,
        scope: FILE_VIEWER_PREVIEW_TOKEN_SCOPE,
      }),
    ).toBe(true);
  });

  it('缺少 audience 时判定为否', () => {
    expect(isFileViewerPreviewTokenPayload({ scope: FILE_VIEWER_PREVIEW_TOKEN_SCOPE })).toBe(false);
  });

  it('缺少 scope 时判定为否', () => {
    expect(isFileViewerPreviewTokenPayload({ aud: FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE })).toBe(false);
  });

  it('非对象输入判定为否', () => {
    expect(isFileViewerPreviewTokenPayload(null)).toBe(false);
    expect(isFileViewerPreviewTokenPayload('token')).toBe(false);
  });
});

describe('isFileViewerProxyUrl', () => {
  it('识别 File Viewer 代理地址', () => {
    expect(isFileViewerProxyUrl(`/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}:get?url=1`)).toBe(true);
    expect(isFileViewerProxyUrl(`http://localhost:13000/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}:get`)).toBe(true);
  });

  it('仅含关键字但无 :get action 的地址判定为否', () => {
    expect(isFileViewerProxyUrl(`/api/${FILE_VIEWER_PROXY_PATH_KEYWORD}`)).toBe(false);
    expect(isFileViewerProxyUrl(`http://localhost:13000/${FILE_VIEWER_PROXY_PATH_KEYWORD}-extra`)).toBe(false);
  });

  it('非代理地址判定为否', () => {
    expect(isFileViewerProxyUrl('/files/main/main/attachments/13.pdf')).toBe(false);
    expect(isFileViewerProxyUrl('')).toBe(false);
    expect(isFileViewerProxyUrl(null)).toBe(false);
  });
});

describe('isNocoBaseManagedFileUrl', () => {
  it('接受 /files/ 永久文件路径（相对与绝对、带扩展名与不带）', () => {
    expect(isNocoBaseManagedFileUrl('/files/main/main/attachments/13.pdf')).toBe(true);
    expect(isNocoBaseManagedFileUrl('http://localhost:13000/files/main/main/attachments/13')).toBe(true);
    expect(isNocoBaseManagedFileUrl('/files/main/main/attachments/13.pdf?download=1')).toBe(true);
  });

  it('接受 /storage/ 本地存储路径', () => {
    expect(isNocoBaseManagedFileUrl('/storage/uploads/demo.docx')).toBe(true);
    expect(isNocoBaseManagedFileUrl('http://localhost:13000/storage/uploads/demo.docx')).toBe(true);
  });

  it('拒绝任意外部 http(s) 地址（防 SSRF）', () => {
    expect(isNocoBaseManagedFileUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isNocoBaseManagedFileUrl('http://192.168.0.1:9000/private/bucket/x.xlsx')).toBe(false);
    expect(isNocoBaseManagedFileUrl('https://cdn.example.com/demo.pdf')).toBe(false);
  });

  it('拒绝畸形或空输入', () => {
    expect(isNocoBaseManagedFileUrl('')).toBe(false);
    expect(isNocoBaseManagedFileUrl(null)).toBe(false);
    expect(isNocoBaseManagedFileUrl('/files/main/main/attachments')).toBe(false);
    expect(isNocoBaseManagedFileUrl('/files/main/main/attachments/abc.pdf')).toBe(false);
  });
});

describe('parsePreviewTokenExpiresInToMs', () => {
  it('解析分钟与秒格式', () => {
    expect(parsePreviewTokenExpiresInToMs('10m')).toBe(10 * 60 * 1000);
    expect(parsePreviewTokenExpiresInToMs('300s')).toBe(300 * 1000);
  });

  it('非法格式回退到默认 10 分钟', () => {
    expect(parsePreviewTokenExpiresInToMs('')).toBe(10 * 60 * 1000);
    expect(parsePreviewTokenExpiresInToMs('forever')).toBe(10 * 60 * 1000);
  });
});
