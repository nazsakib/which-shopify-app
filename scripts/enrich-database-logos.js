/**
 * Offline Enrichment Script: Pre-populates official Shopify App Store icons into apps-database.json
 *
 * Sourced from official Shopify App Store dataset with high-resolution listing CDN images:
 * https://cdn.shopify.com/app-store/listing_images/<id>/icon/<token>.png
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function enrichDatabase() {
  const csvPath = '/home/agyworker/.gemini/antigravity-cli/brain/a1db117a-837b-4f2a-93ac-638e8ea66976/scratch/shopify_apps.csv';
  const dbPath = path.join(__dirname, '../src/data/apps-database.json');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV dataset not found at ${csvPath}`);
    process.exit(1);
  }

  console.log('1. Parsing Shopify App Store CSV dataset...');
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity
  });

  const slugMap = new Map();
  const nameMap = new Map();

  for await (const line of rl) {
    const firstComma = line.indexOf(',');
    if (firstComma === -1) continue;
    const slug = line.slice(0, firstComma).trim().toLowerCase();
    const iconMatch = line.match(/(https:\/\/cdn\.shopify\.com\/app-store\/listing_images\/[a-f0-9]+\/icon\/[^\s",]+)/);
    if (!iconMatch) continue;
    const iconUrl = iconMatch[1];

    slugMap.set(slug, iconUrl);

    const parts = line.split(',');
    if (parts.length >= 3) {
      const rawName = parts[2].replace(/^["\s]+|["\s]+$/g, '');
      const cleanName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName) {
        nameMap.set(cleanName, { slug, icon: iconUrl });
      }
    }
  }

  console.log(`   Loaded ${slugMap.size} unique Shopify app icons.`);

  // Explicit mappings for top hand-crafted apps
  const explicitTopSlugs = {
    'klaviyo': 'klaviyo-email-marketing',
    'loox': 'loox',
    'judge.me': 'judgeme',
    'judgeme': 'judgeme',
    'yotpo': 'yotpo-social-reviews',
    'recharge': 'subscription-payments',
    'aftership': 'aftership',
    'privy': 'privy',
    'smile.io': 'smile-io',
    'smileio': 'smile-io',
    'tidio': 'tidio-chat',
    'pagefly': 'pagefly',
    'gempages': 'gempages',
    'bold subscriptions': 'bold-subscriptions',
    'boldsubscriptions': 'bold-subscriptions',
    'gorgias': 'helpdesk',
    'omnisend': 'omnisend',
    'okendo': 'okendo-reviews',
    'zepto product personalizer': 'product-personalizer',
    'zeptoproductpersonalizer': 'product-personalizer',
    'neon sign customizer': 'neon-sign-customizer',
    'neonsigncustomizer': 'neon-sign-customizer',
    'zendesk': 'zendesk',
    'tawk.to': 'tawk-to',
    'tawkto': 'tawk-to',
    'hotjar': 'hotjar',
    'postscript': 'postscript',
    'triple whale': 'triple-whale',
    'triplewhale': 'triple-whale',
    'shogun': 'shogun',
    'alireviews': 'ali-reviews',
    'dsers': 'dsers-aliexpress-dropshipping',
    'printful': 'printful',
    'spocket': 'spocket',
    'cj dropshipping': 'cjdropshipping',
    'cjdropshipping': 'cjdropshipping'
  };

  console.log('2. Reading apps-database.json...');
  const rawDb = fs.readFileSync(dbPath, 'utf8');
  const appsDb = JSON.parse(rawDb);
  const isArray = Array.isArray(appsDb);
  const apps = isArray ? appsDb : (appsDb.apps || []);

  console.log(`   Found ${apps.length} apps in database.`);

  let enrichedCount = 0;
  for (const app of apps) {
    let s = (app.slug || '').toLowerCase().trim();
    const nameLower = (app.name || '').toLowerCase().trim();
    const nameNorm = nameLower.replace(/[^a-z0-9]/g, '');

    if (explicitTopSlugs[nameLower]) {
      s = explicitTopSlugs[nameLower];
      app.slug = s;
    } else if (explicitTopSlugs[nameNorm]) {
      s = explicitTopSlugs[nameNorm];
      app.slug = s;
    }

    let icon = null;
    if (s && slugMap.has(s)) {
      icon = slugMap.get(s);
    } else if (nameMap.has(nameNorm)) {
      const match = nameMap.get(nameNorm);
      icon = match.icon;
      if (!app.slug) app.slug = match.slug;
    }

    if (icon) {
      app.icon = icon;
      enrichedCount++;
    }
  }

  console.log(`3. Writing back enriched database (${enrichedCount} apps with official icons)...`);
  const outputData = isArray ? apps : { ...appsDb, apps };
  fs.writeFileSync(dbPath, JSON.stringify(outputData, null, 2), 'utf8');

  console.log(`✔ Successfully pre-populated ${enrichedCount} app icons into apps-database.json!`);
}

enrichDatabase().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
