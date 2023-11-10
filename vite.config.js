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
            },
            {
              src: 'node_modules/@mediapipe/tasks-vision/*',
              dest: 'mediapipe/'
            }
          ]
        })
      ]
}