const path = require('path');
const fs = require('fs-extra');

async function copyToTargets(log) {
  const source = path.resolve(__dirname, '../../../../node_modules/@file-viewer/web-full/dist');
  const target = path.resolve(__dirname, './public/file-viewer');

  log(`[copy-assets] Copying @file-viewer/web-full/dist from ${source} to ${target}...`);

  if (!await fs.pathExists(source)) {
    log(`[copy-assets] ERROR: Source path ${source} does not exist!`);
    throw new Error(`Please ensure @file-viewer/web-full is installed in root node_modules.`);
  }

  await fs.ensureDir(target);
  await fs.copy(source, target, { overwrite: true });
  log('[copy-assets] Completed successfully!');
}

module.exports = {
  // beforeBuild 会在 nocobase-build 执行打包前被调用
  async beforeBuild(log) {
    await copyToTargets(log);
  },

  // afterBuild 会在 build 结束后被调用，防止打包工具 rimraf 清空输出
  async afterBuild(log) {
    await copyToTargets(log);
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
