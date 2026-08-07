import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  brotliCompress,
  constants,
  gzip,
} from 'node:zlib';
import sirv from 'sirv';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const compressibleAsset = /\.(?:css|html|js|json|mjs|svg|txt|wasm|xml)$/i;

function precompressedAssets(): Plugin {
  return {
    name: 'digital-peony-precompressed-assets',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      await Promise.all(
        Object.values(bundle).map(async (output) => {
          if (!compressibleAsset.test(output.fileName)) return;
          const source = Buffer.from(
            output.type === 'chunk' ? output.code : output.source,
          );
          const [brotli, gzipped] = await Promise.all([
            compressBrotli(source, {
              params: {
                [constants.BROTLI_PARAM_QUALITY]: 11,
              },
            }),
            compressGzip(source, { level: 9 }),
          ]);
          this.emitFile({
            type: 'asset',
            fileName: `${output.fileName}.br`,
            source: brotli,
          });
          this.emitFile({
            type: 'asset',
            fileName: `${output.fileName}.gz`,
            source: gzipped,
          });
        }),
      );
    },
    configurePreviewServer(server) {
      const outputDirectory = resolve(
        server.config.root,
        server.config.build.outDir,
      );
      server.middlewares.use(
        sirv(outputDirectory, {
          brotli: true,
          dev: true,
          etag: false,
          gzip: true,
          single: true,
        }),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const allowedHosts = environment.VITE_ALLOWED_HOSTS
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  return {
    base: './',
    plugins: [precompressedAssets()],
    preview: {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    server: { allowedHosts },
  };
});
