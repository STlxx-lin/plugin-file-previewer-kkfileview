// 定义部门信息结构，供水印变量解析时读取部门名称。
export interface DepartmentInfo {
  // 部门标题字段，优先用于展示。
  title?: string;
  // 部门名称字段，作为标题缺失时的回退值。
  name?: string;
  // 部门显示名称字段，作为最终兜底值。
  displayName?: string;
}

// 定义角色信息结构，兼容字符串角色与对象角色两种来源。
export type RoleInfo = string | {
  // 角色标题。
  title?: string;
  // 角色名称。
  name?: string;
  // 角色显示名称。
  displayName?: string;
  // 兼容服务端常见角色名字段。
  roleName?: string;
  // 兼容角色编码字段。
  code?: string;
};

// 定义用户信息结构，供服务端与客户端统一解析水印模板变量。
export interface UserInfo {
  // 用户主键标识。
  id?: number | string;
  // 用户登录名。
  username?: string;
  // 用户昵称。
  nickname?: string;
  // 用户邮箱字段。
  email?: string;
  // 用户备用邮箱字段。
  mail?: string;
  // 主部门对象字段。
  mainDepartment?: DepartmentInfo | null;
  // 兼容下划线命名的主部门对象字段。
  main_department?: DepartmentInfo | null;
  // 部门列表字段。
  departments?: DepartmentInfo[];
  // 单部门字段，可能是字符串或对象。
  department?: string | DepartmentInfo | null;
  // 角色列表字段，在没有部门信息时作为兼容兜底。
  roles?: RoleInfo[];
}

// 定义水印模板解析上下文。
export interface WatermarkTemplateContext {
  // 当前用户信息。
  user?: UserInfo | null;
  // 请求时间，用于生成固定时间变量。
  requestedAt?: Date;
}

// 定义默认的时间格式。
const DEFAULT_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

// 将时间片段补齐为两位字符串。
function padTimePart(value: number) {
  // 使用前导零补齐位数，保持时间格式稳定。
  return `${value}`.padStart(2, '0');
}

// 按统一格式输出日期时间文本。
export function formatDateTime(date: Date, format: string = DEFAULT_TIME_FORMAT) {
  // 提取年份。
  const year = date.getFullYear();
  // 提取月份并补零。
  const month = padTimePart(date.getMonth() + 1);
  // 提取日期并补零。
  const day = padTimePart(date.getDate());
  // 提取小时并补零。
  const hour = padTimePart(date.getHours());
  // 提取分钟并补零。
  const minute = padTimePart(date.getMinutes());
  // 提取秒数并补零。
  const second = padTimePart(date.getSeconds());
  // 按指定格式替换输出。
  return format
    .replace(/YYYY/g, `${year}`)
    .replace(/MM/g, `${month}`)
    .replace(/DD/g, `${day}`)
    .replace(/HH/g, `${hour}`)
    .replace(/mm/g, `${minute}`)
    .replace(/ss/g, `${second}`);
}

// 从部门对象中提取可展示的部门名称。
function getDeptName(dept?: DepartmentInfo | null): string {
  // 部门为空时直接返回空字符串。
  if (!dept) return '';
  // 依次尝试常见名称字段。
  return dept.title || dept.name || dept.displayName || '';
}

// 统一提取用户部门文本。
export function getUserDepartment(user?: UserInfo | null) {
  // 用户为空时返回空字符串。
  if (!user) return '';

  // 若 department 本身就是字符串，则直接使用。
  if (typeof user.department === 'string') return user.department;
  // 若 department 是对象，则尝试从对象中提取名称。
  if (user.department && typeof user.department === 'object') {
    // 读取单部门对象名称。
    const name = getDeptName(user.department as DepartmentInfo);
    // 成功取值后直接返回。
    if (name) return name;
  }

  // 优先读取主部门信息。
  const mainDept = user.mainDepartment || user.main_department;
  // 从主部门中提取名称。
  const mainName = getDeptName(mainDept);
  // 若主部门有值则直接返回。
  if (mainName) return mainName;

  // 若存在部门列表，则将多个部门名称拼接返回。
  if (Array.isArray(user.departments) && user.departments.length > 0) {
    // 使用斜杠拼接多个部门名称。
    return user.departments.map(getDeptName).filter(Boolean).join('/');
  }

  // 当部门信息缺失时，兼容使用角色名称作为兜底。
  const roles = user.roles;
  // 若存在角色列表，则拼接角色名称返回。
  if (Array.isArray(roles) && roles.length > 0) {
    // 使用角色标题或名称作为备用显示内容。
    return roles
      .map((role) => {
        // 字符串角色直接返回原值。
        if (typeof role === 'string') return role;
        // 对象角色依次读取常见名称字段。
        return role.title || role.name || role.displayName || role.roleName || role.code || '';
      })
      .filter(Boolean)
      .join('/');
  }

  // 所有字段都不存在时返回空字符串。
  return '';
}

// 构建水印模板可用的变量映射。
export function buildWatermarkVariables(context: WatermarkTemplateContext) {
  // 读取上下文中的用户对象，缺失时回退为空对象。
  const user = context.user || {};
  // 读取请求时间，缺失时使用当前时间。
  const requestedAt = context.requestedAt || new Date();
  // 解析用户部门文本。
  const department = getUserDepartment(user);
  // 格式化请求时间文本。
  const requestTime = formatDateTime(requestedAt);
  // 统一读取邮箱字段。
  const userEmail = user.email || user.mail || '';

  // 返回支持的变量映射表。
  return {
    // 用户 ID 变量。
    'user.id': user.id == null ? '' : `${user.id}`,
    // 用户名变量。
    'user.username': user.username || '',
    // 用户昵称变量。
    'user.nickname': user.nickname || '',
    // 用户邮箱变量。
    'user.email': userEmail,
    // 用户部门变量。
    'user.department': department,
    // currentUser 前缀的 ID 变量。
    'currentUser.id': user.id == null ? '' : `${user.id}`,
    // currentUser 前缀的用户名变量。
    'currentUser.username': user.username || '',
    // currentUser 前缀的昵称变量。
    'currentUser.nickname': user.nickname || '',
    // currentUser 前缀的邮箱变量。
    'currentUser.email': userEmail,
    // currentUser 前缀的部门变量。
    'currentUser.department': department,
    // 简写用户名变量。
    username: user.username || '',
    // 简写昵称变量。
    nickname: user.nickname || '',
    // 简写邮箱变量。
    email: userEmail,
    // 简写部门变量。
    department,
    // 请求时间变量。
    'request.time': requestTime,
    // 请求时间简写变量。
    requestTime,
  };
}

// 按统一规则解析水印模板中的变量占位符。
export function resolveWatermarkTemplate(template: string = '', context: WatermarkTemplateContext) {
  // 模板为空时直接返回空字符串。
  if (!template) return '';
  // 先构建变量表。
  const variables = buildWatermarkVariables(context);
  // 使用统一正则替换模板中的占位符。
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, variable: string) => variables[variable] ?? '');
}
