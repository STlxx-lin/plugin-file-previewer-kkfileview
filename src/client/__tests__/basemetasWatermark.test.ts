import { describe, expect, it } from 'vitest';
import { Base64 } from 'js-base64';

describe('BaseMetas Watermark Base64 & Query Specs', () => {
  it('should generate watermark query parameters for query mode', () => {
    const watermarkText = '机密文件 仅供预览';
    const safeWm = encodeURIComponent(watermarkText);

    const baseUrl = 'https://fileview.example.com/preview/view';
    const url = encodeURIComponent('https://example.com/doc.pdf');
    const fileName = encodeURIComponent('doc.pdf');
    const displayName = encodeURIComponent('doc.pdf');

    let previewUrl = `${baseUrl}?url=${url}&fileName=${fileName}&displayName=${displayName}`;
    previewUrl += `&watermark=${safeWm}&watermarkTxt=${safeWm}`;

    expect(previewUrl).toContain(`watermark=${safeWm}`);
    expect(previewUrl).toContain(`watermarkTxt=${safeWm}`);
  });

  it('should include official watermark object { value } in base64 JSON payload', () => {
    const watermarkText = '内部资料 严禁外传';
    const payloadObj: Record<string, any> = {
      url: 'https://example.com/test.docx',
      fileName: 'test.docx',
      displayName: 'test.docx',
      ext: 'docx',
      watermark: {
        value: watermarkText,
      },
      watermarkTxt: watermarkText,
    };
    const encodedData = encodeURIComponent(Base64.encode(JSON.stringify(payloadObj)));
    const decodedPayload = JSON.parse(Base64.decode(decodeURIComponent(encodedData)));

    expect(decodedPayload.watermark).toEqual({ value: watermarkText });
    expect(decodedPayload.watermark.value).toBe(watermarkText);
    expect(decodedPayload.watermarkTxt).toBe(watermarkText);
  });
});
