import OpenAI from 'openai';
import sharp from 'sharp';
import { readFile, writeFile, access } from 'fs/promises';

const client = new OpenAI();

// 60-30-10 from roitsystems.ca
// 60% #f8fafc  — slate-50  (dominant light blue-gray background)
// 30% #1e3a8a  — blue-900  (deep navy)
// 10% #2563eb  — blue-600  (vivid blue accent)
const PALETTE =
  '60% light slate blue-gray #f8fafc as the dominant background, ' +
  '30% deep navy blue #1e3a8a as the secondary tone, ' +
  '10% vivid blue #2563eb as accent highlights. ' +
  'No other colours.';

function stripMarkdown(text) {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function extractTitleAndFirstSentence(content) {
  const lines = content.split('\n');

  const titleLine = lines.find(l => /^#+\s/.test(l)) ?? '';
  const title = stripMarkdown(titleLine);

  const bodyLines = lines
    .slice(lines.indexOf(titleLine) + 1)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('>'));

  const bodyText = bodyLines.join(' ');
  const firstSentence = bodyText.match(/[^.!?]+[.!?]/)?.[0]?.trim() ?? bodyText.slice(0, 200);

  return { title, firstSentence };
}

async function alreadyExists(pngPath) {
  try {
    await access(pngPath);
    return true;
  } catch {
    return false;
  }
}

async function generateImage(mdFile) {
  const pngPath = mdFile.replace(/\.md$/, '.png');

  if (await alreadyExists(pngPath)) {
    console.log(`Skipping ${mdFile} — image already exists`);
    return;
  }

  const content = await readFile(mdFile, 'utf8');
  const { title, firstSentence } = extractTitleAndFirstSentence(content);

  const prompt =
    `Professional blog post header image for an IT systems and cybersecurity company. ` +
    `Abstract, geometric, clean and modern. No text, no letters, no logos. ` +
    `Color palette (strictly): ${PALETTE} ` +
    `Article title: ${title}. ${firstSentence}`;

  console.log(`Generating image for ${mdFile}…`);
  console.log(`Prompt: ${prompt}\n`);

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    response_format: 'b64_json',
  });

  const raw = Buffer.from(response.data[0].b64_json, 'base64');

  const resized = await sharp(raw)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();

  await writeFile(pngPath, resized);
  console.log(`Saved ${pngPath}`);
}

const files = process.argv.slice(2).filter(f => f.endsWith('.md'));

if (files.length === 0) {
  console.log('No markdown files provided.');
  process.exit(0);
}

for (const file of files) {
  await generateImage(file);
}
