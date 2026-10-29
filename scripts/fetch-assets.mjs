/**
 * 下载 MediaPipe 任务模型，并把 wasm 运行时复制到 public/。
 *
 * 由 npm 的 predev / prebuild 钩子调用，因此 `npm run dev` 与 CI 构建都能自给自足，
 * 运行时不依赖 CDN。脚本可重复执行：已存在且完整的文件会被跳过。
 */
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, copyFile, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = path.join(root, 'public', 'models');
const wasmDestDir = path.join(root, 'public', 'wasm');
const wasmSrcDir = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models';

// minBytes 用于判断文件是否完整：小于该体积就视为下载不完整并重新获取。
const MODELS = [
  {
    file: 'face_landmarker.task',
    url: `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
    minBytes: 2_000_000,
  },
  {
    file: 'hand_landmarker.task',
    url: `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
    minBytes: 4_000_000,
  },
];

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

/** 读取文件大小；文件不存在时返回 -1，便于用统一条件判断"是否需要下载"。 */
async function sizeOf(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return -1;
  }
}

/**
 * 下载文件，最多重试 3 次。
 * 先写入 .download 临时文件，校验体积通过后再重命名，
 * 这样中途失败不会留下看似完整的损坏文件。
 */
async function download(url, dest, minBytes) {
  const tmp = `${dest}.download`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
      const size = await sizeOf(tmp);
      if (size < minBytes) throw new Error(`unexpected size ${size}`);
      await rename(tmp, dest);
      return size;
    } catch (error) {
      await rm(tmp, { force: true });
      if (attempt === 3) throw error;
      console.warn(`  retry ${attempt}/3: ${error.message}`);
      // 重试间隔逐次加长，避免连续失败时打满网络。
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  return 0;
}

async function main() {
  await mkdir(modelsDir, { recursive: true });
  await mkdir(wasmDestDir, { recursive: true });

  let failures = 0;

  // 逐个下载模型：命中缓存（体积达标）就直接跳过。
  for (const model of MODELS) {
    const dest = path.join(modelsDir, model.file);
    if ((await sizeOf(dest)) >= model.minBytes) {
      console.log(`= ${model.file} (cached)`);
      continue;
    }
    try {
      const size = await download(model.url, dest, model.minBytes);
      console.log(`+ ${model.file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (error) {
      failures += 1;
      console.error(`! ${model.file}: ${error.message}`);
    }
  }

  // wasm 运行时来自 node_modules，直接复制，无需联网。
  for (const file of WASM_FILES) {
    const dest = path.join(wasmDestDir, file);
    if ((await sizeOf(dest)) > 1000) continue;
    try {
      await copyFile(path.join(wasmSrcDir, file), dest);
      console.log(`+ wasm/${file}`);
    } catch (error) {
      failures += 1;
      console.error(`! wasm/${file}: ${error.message}`);
    }
  }

  if (failures > 0) {
    console.error(
      '\nAsset preparation failed. Run `npm install` first and make sure you have network access.',
    );
    process.exitCode = 1;
  } else {
    console.log('Assets ready in public/.');
  }
}

await main();
