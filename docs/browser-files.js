import {exportTemplates, importTemplates} from './core.js';

const MAX_PREFS_BYTES = 16 * 1024 * 1024;
const MAX_LINK_LENGTH = 2000;
const MAX_TEMPLATE_BYTES = 64 * 1024;
const LINK_TOO_LARGE = 'This template is too large for a share link. Export it as Lua instead.';

export async function readPrefsFile(file) {
  if (file.size > MAX_PREFS_BYTES) throw new Error('Choose a prefs file of 16 MB or less.');
  const bytes = await file.arrayBuffer();
  try {
    // Keep a BOM if the original has one so bytes outside template edits are preserved.
    return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  } catch {
    throw new Error('This prefs file is not valid UTF-8.');
  }
}

export async function createTemplateLink(template, units, address) {
  const data = new TextEncoder().encode(exportTemplates([template], units));
  if (data.length > MAX_TEMPLATE_BYTES) throw new Error(LINK_TOO_LARGE);

  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  if (compressed.length > MAX_LINK_LENGTH * 3 / 4) throw new Error(LINK_TOO_LARGE);

  const base64 = btoa(String.fromCharCode(...compressed));
  const packed = base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL(address);
  url.search = '';
  url.hash = 'template=1.' + packed;
  if (url.href.length > MAX_LINK_LENGTH) throw new Error(LINK_TOO_LARGE);
  return url.href;
}

export async function readTemplateLink(value) {
  if (value.length > MAX_LINK_LENGTH || !/^1\.[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('Invalid template link. Check that the full link was copied.');
  }
  const base64 = value.slice(2).replaceAll('-', '+').replaceAll('_', '/');
  const compressed = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value: chunk} = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > MAX_TEMPLATE_BYTES) throw new Error('Template link data is too large.');
      chunks.push(decoder.decode(chunk, {stream: true}));
    }
    chunks.push(decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }

  const templates = importTemplates(chunks.join(''));
  if (templates.length !== 1) throw new Error('A share link must contain one template.');
  return templates[0];
}
