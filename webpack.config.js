const path = require('path');
const fs   = require('fs');
const zlib = require('zlib');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** Read all .json.gz files from a campaigns sub-directory and return their parsed contents. */
function loadCampaignFiles(subdir) {
  const dir = path.resolve(__dirname, 'campaigns', subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json.gz'))
    .map(f => {
      const compressed = fs.readFileSync(path.join(dir, f));
      return JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
    });
}

/**
 * Webpack configuration factory.
 *
 * Pass --env flags to select a build mode (see BUILDS.md for the full matrix):
 *
 *   --env target=web|electron|android   Platform context (default: web)
 *   --env demo                           Sets IS_DEMO = true
 *   --env devControls                    Sets DEV_CONTROLS = true
 *
 * These flags are injected into the bundle as compile-time constants via
 * DefinePlugin so that dead branches (e.g. `if (DEV_CONTROLS) { ... }`) are
 * eliminated by the minifier in production builds.
 *
 * The preferred way to run a build is via the npm scripts in package.json
 * rather than invoking webpack directly with --env flags.
 */
module.exports = (env = {}, argv) => {
  const target      = env.target      || 'web';
  const isDemo      = !!env.demo;
  const devControls = !!env.devControls;
  const isProd      = argv.mode === 'production';

  const bundledCampaigns = loadCampaignFiles(isDemo ? 'demo' : 'full');

  // Electron renderer and Android (Capacitor WebView) load assets from disk
  // via file:// URLs and always need relative paths. The dev server needs an
  // absolute publicPath so its "Cannot GET /" errors don't appear.
  const publicPath =
    target === 'electron' || target === 'android' ? './'
    : isProd ? './'
    : '/';

  return {
    entry: './src/main.ts',

    // Electron renderer is a Chromium context; flag it so webpack does not
    // emit Node.js-only constructs into the renderer bundle.
    target: target === 'electron' ? 'electron-renderer' : 'web',

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.ogg$/,
          type: 'asset/resource',
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/i,
          type: 'asset/resource',
        },
      ],
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },

    // 'eval' (webpack default) violates CSP's script-src 'self' (no unsafe-eval).
    // Use file-based source maps in dev so breakpoints work without relaxing CSP.
    devtool: isProd ? false : 'cheap-module-source-map',

    output: {
      filename: '[name].[contenthash].js',
      chunkFilename: '[name].[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath,
      clean: true,
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        filename: 'index.html',
      }),
      new webpack.DefinePlugin({
        // JSON.stringify so the injected value is a quoted string literal, not
        // a bare identifier that webpack would try to resolve as a variable.
        BUILD_TARGET:        JSON.stringify(target),
        IS_DEMO:             JSON.stringify(isDemo),
        DEV_CONTROLS:        JSON.stringify(devControls),
        BUNDLED_CAMPAIGNS:   JSON.stringify(bundledCampaigns),
      }),
    ],

    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      compress: true,
      port: 8080,
    },
  };
};
