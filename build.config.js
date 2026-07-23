const path = require('path');
const fs = require('fs-extra');

async function findDistDir() {
  try {
    const pkgPath = require.resolve('@file-viewer/web-full/package.json');
    const distDir = path.join(path.dirname(pkgPath), 'dist');
    if (await fs.pathExists(distDir)) return distDir;
  } catch {}

  const startDirs = [__dirname, process.cwd()];
  for (const startDir of startDirs) {
    let curr = startDir;
    while (curr) {
      const candidate = path.join(curr, 'node_modules', '@file-viewer', 'web-full', 'dist');
      if (await fs.pathExists(candidate)) {
        return candidate;
      }
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  }
  return null;
}

async function copyToTargets(log) {
  const source = await findDistDir();
  const target = path.resolve(__dirname, './public/file-viewer');

  log(`[copy-assets] Copying @file-viewer/web-full/dist from ${source} to ${target}...`);

  if (!source || !await fs.pathExists(source)) {
    log(`[copy-assets] ERROR: Source path @file-viewer/web-full/dist does not exist!`);
    throw new Error(`Please ensure @file-viewer/web-full is installed in root node_modules.`);
  }

  await fs.ensureDir(target);
  await fs.copy(source, target, { overwrite: true });
  log('[copy-assets] Completed successfully!');
}

module.exports = {
  // beforeBuild 会在 nocobase-build 执行打包前被调用
  async beforeBuild(log) {
    const target = path.resolve(__dirname, './public/file-viewer');
    if (process.env.BUILD_FULL === 'true') {
      log('[build] BUILD_FULL is enabled. Embedding file-viewer static assets...');
      await copyToTargets(log);
    } else {
      // 确保打包前 public/file-viewer 目录已被清理，避免误打包大体积静态文件
      if (await fs.pathExists(target)) {
        log(`[cleanup] Cleaning up legacy file-viewer static assets at ${target}...`);
        await fs.remove(target);
        log('[cleanup] Cleanup completed successfully!');
      }
    }
  },

  modifyTsupConfig(config) {
    const next = { ...config };
    if (Array.isArray(next.entry)) {
      next.entry = next.entry.map((item) => {
        if (path.isAbsolute(item)) {
          return path.relative(process.cwd(), item).replace(/\\/g, '/');
        }
        return item;
      });
    }
    return next;
  },

  modifyRsbuildConfig(config) {
    const next = { ...config };
    
    // 注入全局环境变量 Define，用于让客户端感知当前构建是轻量版还是完整版
    next.source = {
      ...next.source,
      define: {
        ...next.source?.define,
        'process.env.BUILD_FULL': JSON.stringify(process.env.BUILD_FULL === 'true'),
      },
    };

    const originalRspack = next.tools?.rspack;

    next.tools = {
      ...next.tools,
      rspack(rspackConfig, utils) {
        if (typeof originalRspack === 'function') {
          originalRspack(rspackConfig, utils);
        }

        if (!rspackConfig.module) rspackConfig.module = {};
        if (!rspackConfig.module.rules) rspackConfig.module.rules = [];

        rspackConfig.module.rules.push({
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false,
          },
        });

        if (!rspackConfig.resolve) rspackConfig.resolve = {};
        rspackConfig.resolve.fallback = {
          ...rspackConfig.resolve.fallback,
          zlib: false,
          fs: false,
          'fs/promises': false,
          util: false,
          path: false,
          stream: false,
          buffer: false,
        };
      },
    };

    return next;
  },
};
