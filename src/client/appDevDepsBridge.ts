type RequireJsDefinedModules = Record<string, unknown>;

type RequireJsLike = {
  s?: {
    contexts?: Record<string, { defined?: RequireJsDefinedModules }>;
  };
};

type LegacyAppDevGlobal = typeof window & {
  __nocobase_app_dev_deps__?: Record<string, unknown>;
  requirejs?: RequireJsLike;
};

// 仅回填 legacy `/admin` 入口当前会直接用到的开发态外部依赖，避免污染全局依赖表。
const LEGACY_APP_DEV_DEP_ALIASES: Array<[targetId: string, sourceId: string]> = [
  ['react', 'react'],
  ['react-dom', 'react-dom'],
  ['antd', 'antd'],
  ['@ant-design/icons', '@ant-design/icons'],
  ['@nocobase/client', '@nocobase/client'],
  ['@nocobase/client/client', '@nocobase/client'],
  ['@nocobase/plugin-file-manager/client', '@nocobase/plugin-file-manager/client'],
  ['file-saver', 'file-saver'],
];

function getDefinedModules(globalObject?: Partial<LegacyAppDevGlobal>) {
  const contexts =
    globalObject?.requirejs?.s?.contexts ||
    (globalObject?.requirejs as { requirejs?: RequireJsLike } | undefined)?.requirejs?.s?.contexts;
  if (!contexts) return {} as RequireJsDefinedModules;

  for (const context of Object.values(contexts)) {
    if (context?.defined) {
      return context.defined;
    }
  }

  return {} as RequireJsDefinedModules;
}

export function ensureLegacyAppDevDeps(globalObject?: Partial<LegacyAppDevGlobal>) {
  if (!globalObject) return {} as Record<string, unknown>;
  if (globalObject.__nocobase_app_dev_deps__) return globalObject.__nocobase_app_dev_deps__;

  const definedModules = getDefinedModules(globalObject);
  const resolvedDeps = LEGACY_APP_DEV_DEP_ALIASES.reduce<Record<string, unknown>>((memo, [targetId, sourceId]) => {
    if (definedModules[sourceId] !== undefined) {
      memo[targetId] = definedModules[sourceId];
    }
    return memo;
  }, {});

  if (Object.keys(resolvedDeps).length === 0) {
    return resolvedDeps;
  }

  globalObject.__nocobase_app_dev_deps__ = resolvedDeps;
  return resolvedDeps;
}

// 旧版 `/admin` 页面不会像 modern client 那样预先注入 `__nocobase_app_dev_deps__`，这里在入口最早阶段补齐。
if (typeof window !== 'undefined') {
  ensureLegacyAppDevDeps(window as LegacyAppDevGlobal);
}
