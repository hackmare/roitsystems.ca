import OpenAI from 'openai';
import sharp from 'sharp';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { basename, extname, join } from 'path';

const client = new OpenAI();

// Visual direction from roitsystems.ca
const PALETTE =
  'Deep navy, slate, soft white, restrained blue accents, and subtle warm light. ' +
  'Avoid neon, purple gradients, cyberpunk palettes, and overly bright SaaS colours.';

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
  const { title, firstSentence } = extractTitleAndFirstSentence(content);

  const prompt =
    `Create a premium editorial blog header image for an enterprise AI governance ` +
    `and systems architecture article. Audience: CIOs, CTOs, CISOs, board members, ` +
    `risk leaders, and enterprise architects in regulated industries. Visual style: ` +
    `sophisticated, cinematic, calm, credible, high-trust enterprise technology. ` +
    `Use photorealistic or refined editorial realism with subtle abstract overlays. ` +
    `Scene: a quiet executive technology environment where senior professionals are ` +
    `reviewing complex system flows, governance controls, secure data movement, and ` +
    `AI decision pathways. The image should suggest responsible AI adoption, operational ` +
    `control, audit readiness, and leadership confidence. Composition: master image that ` +
    `can be cropped into a wide article hero, compact blog card thumbnail, and 1200x630 ` +
    `social sharing image. Use a wide 16:9 feel ` +
    `with strong visual focus in the centre/right and some clean negative space on the ` +
    `left or top-left so it works as a blog card, social sharing image, and article ` +
    `header. Mood: trust, safety, clarity, strategic confidence, serious systems, ` +
    `regulated environments. Calm and reassuring, not flashy. Colour palette: ${PALETTE} ` +
    `Important constraints: no words, no letters, no logos, no fake UI text, no brand ` +
    `names, no distorted hands, no obvious AI cliches, no robots, no glowing brains, ` +
    `no stock handshakes, no exaggerated holograms, and no cartoon illustration. ` +
    `Article title: ${title}. Article context: ${firstSentence}`;

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
