// 引入 defineCollection 方法用于定义数据表集合
import { defineCollection } from '@nocobase/database';
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_MICROSOFT_EXTENSIONS,
  DEFAULT_KKFILEVIEW_HOST,
  DEFAULT_BASEMETAS_HOST,
  DEFAULT_MICROSOFT_HOST,
  DEFAULT_PREFERRED_PREVIEW,
} from '../../shared/constants';

// 导出 kkfileviewSettings 集合定义
export default defineCollection({
    // 集合名称，用于数据库表名和 API 路径
    name: 'kkfileviewSettings',
    // 集合标题，用于界面显示
    title: 'kkFileView Settings',
    // 定义集合字段
    fields: [
        {
            type: 'string',
            name: 'host',              // 旧版本兼容字段
            defaultValue: DEFAULT_KKFILEVIEW_HOST,
        },
        {
            type: 'string',
            name: 'kkfileviewHost',
            defaultValue: DEFAULT_KKFILEVIEW_HOST,
        },
        {
            type: 'string',
            name: 'basemetasHost',
            defaultValue: DEFAULT_BASEMETAS_HOST,
        },
        {
            type: 'string',
            name: 'microsoftHost',
            defaultValue: DEFAULT_MICROSOFT_HOST,
        },
        {
            type: 'string',
            name: 'nocobaseHost',
            defaultValue: '',
        },
        {
            type: 'text',
            name: 'extensions',        // 旧版本兼容字段，存储 JSON 字符串
            defaultValue: JSON.stringify(DEFAULT_EXTENSIONS),
        },
        {
            type: 'text',
            name: 'kkfileviewExtensions',
            defaultValue: JSON.stringify(DEFAULT_EXTENSIONS),
        },
        {
            type: 'text',
            name: 'basemetasExtensions',
            defaultValue: JSON.stringify(DEFAULT_EXTENSIONS),
        },
        {
            type: 'text',
            name: 'microsoftExtensions',
            defaultValue: JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS),
        },
        {
            type: 'boolean',
            name: 'preferKkfileview',  // 旧版本兼容字段
            defaultValue: false,
        },
        {
            type: 'boolean',
            name: 'enableKkfileview',
            defaultValue: true,
        },
        {
            type: 'boolean',
            name: 'enableBasemetas',
            defaultValue: false,
        },
        {
            type: 'boolean',
            name: 'enableMicrosoft',
            defaultValue: true,
        },
        {
            type: 'boolean',
            name: 'enablePrint',
            defaultValue: false,
        },
        {
            type: 'boolean',
            name: 'enableOpenInNewWindow',
            defaultValue: true,
        },
        {
            type: 'boolean',
            name: 'enableFullscreenButton',
            defaultValue: true,
        },
        {
            type: 'boolean',
            name: 'enableMobileAutoFullscreen',
            defaultValue: false,
        },
        {
            type: 'boolean',
            name: 'enableDownload',
            defaultValue: true,
        },
        {
            type: 'string',
            name: 'basemetasRequestType',
            defaultValue: 'query',
        },
        {
            type: 'boolean',
            name: 'enableCopyEmbedHtml',
            defaultValue: true,
        },
        {
            type: 'string',
            name: 'copyEmbedHtmlPermission',
            defaultValue: 'user',
        },
        {
            type: 'text',
            name: 'copyEmbedHtmlRoles',
            defaultValue: '[]',
        },
        {
            type: 'string',
            name: 'watermarkType',
            defaultValue: 'preview',
        },
        {
            type: 'text',
            name: 'watermark',
            defaultValue: '',
        },
        {
            type: 'string',
            name: 'serviceType',       // 旧版本兼容字段
            defaultValue: 'kkfileview',
        },
        {
            type: 'string',
            name: 'preferredPreview',  // 优先预览引擎：microsoft | kkfileview | basemetas | none
            defaultValue: DEFAULT_PREFERRED_PREVIEW,
        },
    ],
});
