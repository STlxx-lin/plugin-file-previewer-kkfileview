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

/** File Viewer 资源基础路径默认值 */
export const DEFAULT_FILE_VIEWER_ASSET_BASE = ''; // 定义 File Viewer 资源基础路径默认值为空字符串。

/** File Viewer 默认支持的文件扩展名 */
export const DEFAULT_FILE_VIEWER_EXTENSIONS = [
  'pdf', // 默认支持 PDF 文件格式。
  'doc', // 默认支持 DOC 文件格式。
  'docx', // 默认支持 DOCX 文件格式。
  'xls', // 默认支持 XLS 文件格式。
  'xlsx', // 默认支持 XLSX 文件格式。
  'ppt', // 默认支持 PPT 文件格式。
  'pptx', // 默认支持 PPTX 文件格式。
  'ofd', // 默认支持 OFD 文件格式。
  'rtf', // 默认支持 RTF 文件格式。
  'odt', // 默认支持 ODT 文件格式。
  'ods', // 默认支持 ODS 文件格式。
  'odp', // 默认支持 ODP 文件格式。
]; // 结束 File Viewer 默认扩展名列表定义。

/** 默认优先的预览引擎 */
export const DEFAULT_PREFERRED_PREVIEW = 'microsoft';
