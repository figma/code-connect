const path = require('path')
const webpack = require('webpack')

// Webpack is used to bundle the app + all its dependencies into a single .js
// file for packaging with `pkg`, as it doesn't seem to work well with separate
// dependencies. Note that we have to use `prettier` v2.8, as v3 uses some
// dynamic `import`s that pkg can't seem to handle
module.exports = {
  entry: './src/cli.ts',
  target: 'node',
  // Don't polyfill any node built-ins
  node: false,
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    modules: [path.resolve(__dirname, 'src'), 'node_modules'],
  },
  output: {
    filename: 'figma.js',
    path: path.resolve(__dirname, 'webpack-dist'),
  },
  // This prevents it splitting the bundle into multiple files
  optimization: {
    splitChunks: false,
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
}
