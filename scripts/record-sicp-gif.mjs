#!/usr/bin/env node
/**
 * SICP REPL のデモ GIF を生成する。
 * 依存: npx playwright (初回のみブラウザ DL)、ffmpeg
 *
 *   node scripts/record-sicp-gif.mjs
 */
import { spawn } from 'child_process';
import { mkdir, rm } from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FRAMES_DIR = path.join(ROOT, 'docs', 'assets', '_sicp-frames');
const OUT_GIF = path.join(ROOT, 'docs', 'assets', 'sicp-repl-demo.gif');
const PORT = 9876;

function serveStatic(root) {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? '/sicp-repl.html' : urlPath;
    const fp = path.join(root, rel.replace(/^\//, ''));
    if (!fp.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    import('fs').then((fs) => {
      fs.readFile(fp, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        const ext = path.extname(fp);
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css'
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(cmd + ' exit ' + code))));
  });
}

async function main() {
  await rm(FRAMES_DIR, { recursive: true, force: true });
  await mkdir(FRAMES_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_GIF), { recursive: true });

  const server = serveStatic(ROOT);
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  let frame = 0;
  async function shot() {
    const name = `frame${String(frame++).padStart(3, '0')}.png`;
    await page.screenshot({ path: path.join(FRAMES_DIR, name) });
  }
  const shots = [
    { url: `http://127.0.0.1:${PORT}/sicp-repl.html?ch=1&ex=1.1`, wait: 700 },
    { url: `http://127.0.0.1:${PORT}/sicp-repl.html?ch=1&ex=1.7`, wait: 700, run: true },
    { url: `http://127.0.0.1:${PORT}/sicp-repl.html?ch=2&ex=2.1`, wait: 700, run: true },
    { url: `http://127.0.0.1:${PORT}/sicp-repl.html?ch=3&ex=3.1`, wait: 700, run: true }
  ];

  for (const step of shots) {
    await page.goto(step.url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#btn-run');
    await page.waitForTimeout(step.wait);
    await shot();
    if (step.run) {
      await page.click('#btn-run');
      await page.waitForTimeout(1400);
      await shot();
    }
  }

  await browser.close();
  server.close();

  await run('ffmpeg', [
    '-y',
    '-framerate', '0.8',
    '-i', path.join(FRAMES_DIR, 'frame%03d.png'),
    '-vf', 'fps=8,scale=880:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    OUT_GIF
  ]);

  await rm(FRAMES_DIR, { recursive: true, force: true });
  console.log('Wrote', OUT_GIF);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
