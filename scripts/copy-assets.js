const fs = require('fs-extra');
const path = require('path');

async function copyAssets() {
  const source = path.resolve(__dirname, '../../../../../node_modules/@file-viewer/web-full/dist');
  const target = path.resolve(__dirname, '../public/file-viewer');

  console.log(`Copying @file-viewer/web-full/dist from ${source} to ${target}...`);

  if (!await fs.pathExists(source)) {
    console.error(`Source path ${source} does not exist! Please ensure @file-viewer/web-full is installed.`);
    process.exit(1);
  }

  await fs.ensureDir(target);
  await fs.copy(source, target, { overwrite: true });
  console.log('Copying static assets completed successfully!');
}

copyAssets().catch((err) => {
  console.error('Failed to copy assets:', err);
  process.exit(1);
});
