import { dirname } from 'node:path'
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'

// Fonts the first screen uses. They're preloaded so the text settles into them sooner.
const HERO_FONTS = ['plus-jakarta-sans-latin-wght-normal', 'instrument-serif-latin-400-italic']

/**
 * Gets the first screen up as fast as possible, which matters most on phones:
 * the stylesheet is inlined into index.html (no extra round trip before the first paint),
 * the hero fonts are preloaded, and the 3D chunk starts downloading straight away, at low priority.
 */
function fastFirstPaint(): Plugin {
  return {
    name: 'fast-first-paint',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const tags: HtmlTagDescriptor[] = []

        for (const [fileName, file] of Object.entries(bundle)) {
          if (file.type === 'asset' && fileName.endsWith('.css')) {
            const link = new RegExp(`<link rel="stylesheet"[^>]*href="\\./${fileName}"[^>]*>`)
            if (!link.test(html)) continue
            // Font URLs are relative to the stylesheet; once inlined they must be relative to the page.
            const css = String(file.source).replace(/url\(\.\//g, `url(./${dirname(fileName)}/`)
            html = html.replace(link, () => `<style>${css}</style>`)
            delete bundle[fileName]
          } else if (file.type === 'asset' && fileName.endsWith('.woff2') && HERO_FONTS.some((f) => fileName.includes(f))) {
            tags.push({
              tag: 'link',
              attrs: { rel: 'preload', href: `./${fileName}`, as: 'font', type: 'font/woff2', crossorigin: true },
              injectTo: 'head',
            })
          } else if (file.type === 'chunk' && file.isDynamicEntry && file.name === 'stage') {
            tags.push({
              tag: 'link',
              attrs: { rel: 'modulepreload', href: `./${fileName}`, fetchpriority: 'low' },
              injectTo: 'head',
            })
          }
        }
        return { html, tags }
      },
    },
  }
}

// Relative base so the build works on any host or sub-path (Vercel, Netlify, GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [fastFirstPaint()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    // Keep fonts as files: inlined into the page, they'd load even for alphabets the visitor never needs.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
})
