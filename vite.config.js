import { viteStaticCopy } from 'vite-plugin-static-copy'

export default {
    build: {
        outDir: '_mpdist',
        minify: false,
        rollupOptions: {
            treeshake: false,
        },
    },
    plugins: [
        viteStaticCopy({
          targets: [
            {
              src: 'src/mediapipe/*',
              dest: 'mediapipe/'
            }
          ]
        })
      ]
}