const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');

const pluginDir = path.resolve(__dirname, '../');
const pkgJsonPath = path.resolve(pluginDir, 'package.json');
// 从 scripts 目录向上 5 级到达仓库根目录（存放 build/tar 脚本的 package.json）
const rootDir = path.resolve(__dirname, '../../../../..');

function runCmd(cmd, cwd, env = {}) {
  console.log(`[Executing] ${cmd}`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
}

async function main() {
  console.log('=== START PACKING DUAL VERSIONS ===');
  
  // 1. 读取原 package.json
  const pkgContent = await fs.readFile(pkgJsonPath, 'utf8');
  const pkg = JSON.parse(pkgContent);
  const originalVersion = pkg.version;
  
  try {
    // ----------------------------------------------------
    // Step 1: Pack Light Version (默认不包含内置静态资源)
    // ----------------------------------------------------
    console.log('\n--- Step 1: Packing Light Version ---');
    // 确保清理了可能存在的本地资源
    const targetDir = path.resolve(pluginDir, './public/file-viewer');
    if (await fs.pathExists(targetDir)) {
      console.log('Cleaning up existing public/file-viewer directory...');
      await fs.remove(targetDir);
    }
    
    // 运行构建和打包
    runCmd('yarn build @nocobase/plugin-file-previewer-kkfileview', rootDir, { BUILD_FULL: 'false' });
    runCmd('yarn tar @nocobase/plugin-file-previewer-kkfileview', rootDir);
    console.log('[Success] Light Version packed successfully.');

    // ----------------------------------------------------
    // Step 2: Pack Full Version (包含内置静态资源)
    // ----------------------------------------------------
    console.log('\n--- Step 2: Packing Full Version ---');
    // 修改 package.json 的版本号，添加 -full 后缀
    pkg.version = `${originalVersion}-full`;
    await fs.writeJson(pkgJsonPath, pkg, { spaces: 2 });
    console.log(`Temporarily updated version to ${pkg.version}`);

    // 设置 BUILD_FULL 为 true 运行构建和打包
    runCmd('yarn build @nocobase/plugin-file-previewer-kkfileview', rootDir, { BUILD_FULL: 'true' });
    runCmd('yarn tar @nocobase/plugin-file-previewer-kkfileview', rootDir);
    console.log('[Success] Full Version packed successfully.');

  } catch (error) {
    console.error('[Error] Packing failed:', error);
  } finally {
    // ----------------------------------------------------
    // Cleanup: 还原 package.json 和清理临时静态资源
    // ----------------------------------------------------
    console.log('\n--- Cleaning Up & Restoring ---');
    // 还原 package.json
    await fs.writeFile(pkgJsonPath, pkgContent, 'utf8');
    console.log('Restored package.json to original state.');

    // 清理生成的 public/file-viewer（恢复轻量状态）
    const targetDir = path.resolve(pluginDir, './public/file-viewer');
    if (await fs.pathExists(targetDir)) {
      console.log('Cleaning up temporary public/file-viewer directory...');
      await fs.remove(targetDir);
    }
    console.log('Cleanup completed.');
  }
  
  console.log('\n=== DUAL PACKING COMPLETED ===');
  console.log(`Light Version: storage/tar/@nocobase/plugin-file-previewer-kkfileview-${originalVersion}.tgz`);
  console.log(`Full Version:  storage/tar/@nocobase/plugin-file-previewer-kkfileview-${originalVersion}-full.tgz`);
}

main().catch(console.error);
