// npm 11 supports Node ^20.17.0 || >=22.9.0. Older CLI runtimes keep
// their existing npm; modern runtimes use the repository's tested version.
function selectNpm(nodeVersion, packageManager) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(nodeVersion);
  if (!match || !/^npm@11\.\d+\.\d+$/.test(packageManager)) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const supported = (major === 20 && minor >= 17) || major > 22 || (major === 22 && minor >= 9);
  return supported ? packageManager : null;
}

module.exports = { selectNpm };

if (require.main === module) {
  const { packageManager } = require("../package.json");
  process.stdout.write(selectNpm(process.versions.node, packageManager) || "");
}
