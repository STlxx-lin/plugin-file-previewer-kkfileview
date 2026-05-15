const path = require('path');

module.exports = {
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
};
