const { copy } = require('esbuild-plugin-copy')
const { buildNotificationPlugin } = require('./utils')

/**
 * Build the map bundle with unhashed names, so the map page can reference a fixed filename,
 * and copy its stylesheet alongside it
 */
const getMapConfig = buildConfig => ({
  entryPoints: buildConfig.map.entryPoints,
  outdir: buildConfig.map.outDir,
  entryNames: '[name]',
  minify: buildConfig.isProduction,
  sourcemap: !buildConfig.isProduction,
  platform: 'browser',
  target: 'es2018',
  format: 'esm',
  bundle: true,
  plugins: [
    copy({
      resolveFrom: 'cwd',
      assets: buildConfig.map.copy,
    }),
    buildNotificationPlugin('Assets (Map)', buildConfig.isWatchMode),
  ],
})

module.exports = { getMapConfig }
