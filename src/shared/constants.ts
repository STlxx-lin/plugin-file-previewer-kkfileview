/**
 * 插件全局常量 — 由 client、server、collections 统一引用，避免重复定义。
 */

/** kkFileView、BaseMetas 服务默认支持的文件扩展名 */
export const DEFAULT_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'zip', 'rar', '7z'];

/** 微软在线预览默认支持的文件扩展名 */
export const DEFAULT_MICROSOFT_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'];

/** kkFileView 服务默认主机地址 */
export const DEFAULT_KKFILEVIEW_HOST = 'http://127.0.0.1:8012';

/** BaseMetas 文件预览服务默认主机地址 */
export const DEFAULT_BASEMETAS_HOST = 'https://fileview.basemetas.cn';

/** 微软在线预览服务默认地址 */
export const DEFAULT_MICROSOFT_HOST = 'https://view.officeapps.live.com/op/embed.aspx';

/** 默认优先的预览引擎 */
export const DEFAULT_PREFERRED_PREVIEW = 'microsoft';
