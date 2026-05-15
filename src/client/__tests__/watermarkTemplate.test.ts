import { describe, expect, it } from 'vitest';
import { buildWatermarkVariables, formatDateTime, getUserDepartment, resolveWatermarkTemplate } from '../watermarkTemplate';

describe('watermarkTemplate', () => {
  it('formatDateTime 应该输出默认时间格式', () => {
    const date = new Date(2026, 2, 18, 9, 7, 5);
    expect(formatDateTime(date)).toBe('2026-03-18 09:07:05');
  });

  it('getUserDepartment 应该优先主部门并支持多部门拼接', () => {
    expect(
      getUserDepartment({
        mainDepartment: { title: '研发部' },
        departments: [{ title: '市场部' }],
      })
    ).toBe('研发部');
    expect(
      getUserDepartment({
        departments: [{ title: '市场部' }, { name: '销售部' }],
      })
    ).toBe('市场部/销售部');
  });

  it('buildWatermarkVariables 应该包含用户部门与请求时间变量', () => {
    const variables = buildWatermarkVariables({
      user: {
        id: 100,
        username: 'nocobase',
        nickname: '管理员',
        departments: [{ title: '产品部' }],
      },
      requestedAt: new Date(2026, 2, 18, 9, 7, 5),
    });
    expect(variables['user.id']).toBe('100');
    expect(variables['user.department']).toBe('产品部');
    expect(variables['request.time']).toBe('2026-03-18 09:07:05');
  });

  it('resolveWatermarkTemplate 应该替换变量并忽略未知变量', () => {
    const result = resolveWatermarkTemplate('{{user.department}} @ {{request.time}} {{unknown}}', {
      user: {
        departments: [{ title: '技术中心' }],
      },
      requestedAt: new Date(2026, 2, 18, 9, 7, 5),
    });
    expect(result).toBe('技术中心 @ 2026-03-18 09:07:05 ');
  });
});
