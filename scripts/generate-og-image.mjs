import OpenAI from 'openai';
import sharp from 'sharp';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { basename, extname, join } from 'path';

const client = new OpenAI();

const PALETTE =
  'Use a 60-30-10 palette based on roitsystems.ca: deep navy and slate as the ' +
  'dominant foundation, soft white and light slate as the secondary tones, restrained ' +
  'blue accents, plus small pops of sand or warm light.';

function stripMarkdown(text) {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function extractTitleAndContext(content) {
  const lines = content.split('\n');

  const titleLine = lines.find(l => /^#+\s/.test(l)) ?? '';
  const title = stripMarkdown(titleLine);

  const bodyLines = lines
    .slice(lines.indexOf(titleLine) + 1)
    .map(l => l.trim())
    .filter(l =>
      l.length > 0 &&
      !l.startsWith('#') &&
      !l.startsWith('>') &&
      !l.startsWith('|') &&
      !l.startsWith('```') &&
      !/^\*\*[^*]+\*\*$/.test(l)
    );

  const bodyText = stripMarkdown(bodyLines.join(' '));
  const sentences = bodyText.match(/[^.!?]+[.!?]/g)?.map(s => s.trim()) ?? [];
  const firstTwoSentences = sentences.slice(0, 2).join(' ') || bodyText.slice(0, 300);

  return { title, firstTwoSentences };
}

async function alreadyExists(pngPath) {
  try {
    await access(pngPath);
    return true;
  } catch {
    return false;
  }
}

function imageSlug(mdFile) {
  return basename(mdFile, extname(mdFile))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function allVariantsExist(outputDir) {
  const variants = ['hero.png', 'card.png', 'social.png'];
  const checks = await Promise.all(variants.map(file => alreadyExists(join(outputDir, file))));
  return checks.every(Boolean);
}

async function generateImage(mdFile, { force = false } = {}) {
  const slug = imageSlug(mdFile);
  const outputDir = join('public', 'images', 'blog', slug);

  if (!force && await allVariantsExist(outputDir)) {
    console.log(`Skipping ${mdFile} — image variants already exist`);
    return;
  }

  const content = await readFile(mdFile, 'utf8');
  const { title, firstTwoSentences } = extractTitleAndContext(content);

  const prompt =
    `Create a sophisticated hero image for an enterprise technology consulting blog post. ` +
    `Audience: CIOs, CTOs, CISOs, board members, risk leaders, and enterprise architects ` +
    `in regulated industries. Theme: trustworthy AI adoption, governance, platform ` +
    `modernisation, and complex systems integration in high-stakes environments. Visual ` +
    `concept: a calm executive technology environment where complex systems are becoming ` +
    `understandable and governable. Show abstract layers of enterprise architecture, ` +
    `secure data flows, AI decision pathways, and governance controls converging into a ` +
    `clear, stable operating model. Style: premium enterprise consulting, polished, calm, ` +
    `credible, modern, not futuristic hype. Elegant editorial realism with subtle abstract ` +
    `technology overlays. Should feel like confidence, clarity, safety, and senior judgment. ` +
    `Composition: master image that can be cropped into a wide article hero, compact blog ` +
    `card thumbnail, and 1200x630 social sharing image. Use a wide landscape 16:9 aspect ` +
    `ratio, suitable for dark text-overlay or light text-overlay on a website. Leave clean ` +
    `negative space on the left side for headline text. Main visual energy should be on ` +
    `the right and center. Mood: confident, composed, high-trust, strategic, human-led, ` +
    `quietly powerful. Colour palette: ${PALETTE} Avoid purple gradients, neon cyberpunk, ` +
    `dark hacker imagery, stock-photo handshakes, robots, glowing brains, or generic AI ` +
    `icons. Subject matter: no visible brand names, no readable text, no logos, no cartoon ` +
    `style, and no people staring at floating holograms. If people are included, show them ` +
    `subtly as senior professionals reviewing systems calmly, not posing. Output: ` +
    `photorealistic with refined abstract overlays, 16:9 aspect ratio, website hero quality. ` +
    `Article header: ${title}. First two article sentences: ${firstTwoSentences}`;

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

  await mkdir(outputDir, { recursive: true });

  const variants = [
    { file: 'hero.png', width: 1600, height: 900 },
    { file: 'card.png', width: 640, height: 360 },
    { file: 'social.png', width: 1200, height: 630 },
  ];

  for (const variant of variants) {
    const outputPath = join(outputDir, variant.file);
    const resized = await sharp(raw)
      .resize(variant.width, variant.height, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();

    await writeFile(outputPath, resized);
    console.log(`Saved ${outputPath}`);
  }
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const files = args.filter(f => f.endsWith('.md'));

if (files.length === 0) {
  console.log('No markdown files provided.');
  process.exit(0);
}

for (const file of files) {
  await generateImage(file, { force });
}
