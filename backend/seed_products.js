require('dotenv').config();
const supabase = require('./db/supabase');

const PRODUCTS = [
  { code:'p01', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Nightshades & Pods',    name:'Tomatoes',         regional_name:'தக்காளி',       unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:2400,handling:0},{district:'Tiruchirappalli',market_price:2500,handling:0},{district:'Thanjavur',market_price:2300,handling:0}] },
  { code:'p02', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Nightshades & Pods',    name:'Brinjal',          regional_name:'கத்திரிக்காய்', unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:3200,handling:0},{district:'Tiruchirappalli',market_price:3300,handling:0},{district:'Thanjavur',market_price:3100,handling:0}] },
  { code:'p03', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Herbs & Seasonals',     name:'Green Chilli',     regional_name:'பச்சை மிளகாய்', unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:5500,handling:0},{district:'Tiruchirappalli',market_price:5700,handling:0},{district:'Thanjavur',market_price:5300,handling:0}] },
  { code:'p04', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Root Vegetables',       name:'Onion',            regional_name:'வெங்காயம்',     unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:3800,handling:0},{district:'Tiruchirappalli',market_price:4000,handling:0},{district:'Thanjavur',market_price:3700,handling:0}] },
  { code:'p05', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Root Vegetables',       name:'Potato',           regional_name:'உருளைக்கிழங்கு',unit:'kg',   exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:2800,handling:0},{district:'Tiruchirappalli',market_price:2900,handling:0},{district:'Thanjavur',market_price:2700,handling:0}] },
  { code:'p06', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Root Vegetables',       name:'Carrot',           regional_name:'கேரட்',         unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:4500,handling:0},{district:'Tiruchirappalli',market_price:4700,handling:0},{district:'Thanjavur',market_price:4400,handling:0}] },
  { code:'p07', product_group:'Fresh Produce',              category:'Fruits',               sub_type:'Tropical & Exotic',     name:'Banana',           regional_name:'வாழைப்பழம்',    unit:'bunch', exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:4000,handling:0},{district:'Tiruchirappalli',market_price:4200,handling:0},{district:'Thanjavur',market_price:3900,handling:0}] },
  { code:'p08', product_group:'Fresh Produce',              category:'Fruits',               sub_type:'Tropical & Exotic',     name:'Mango',            regional_name:'மாம்பழம்',      unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:8000,handling:0},{district:'Tiruchirappalli',market_price:8300,handling:0},{district:'Thanjavur',market_price:7800,handling:0}] },
  { code:'p09', product_group:'Fresh Produce',              category:'Fruits',               sub_type:'Tropical & Exotic',     name:'Guava',            regional_name:'கொய்யா',        unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:5000,handling:0},{district:'Tiruchirappalli',market_price:5200,handling:0},{district:'Thanjavur',market_price:4800,handling:0}] },
  { code:'p10', product_group:'Groceries & Pantry Staples', category:'Grains, Rice & Pasta', sub_type:'Rice & Quinoa',         name:'Raw Rice',         regional_name:'பச்சரிசி',      unit:'kg',    exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:5500,handling:0},{district:'Tiruchirappalli',market_price:5700,handling:0},{district:'Thanjavur',market_price:5300,handling:0}] },
  { code:'p11', product_group:'Groceries & Pantry Staples', category:'Canned & Packaged Goods',sub_type:'Canned Beans & Vegetables',name:'Toor Dal',      regional_name:'துவரம் பருப்பு',unit:'kg',   exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:12000,handling:0},{district:'Tiruchirappalli',market_price:12500,handling:0},{district:'Thanjavur',market_price:11600,handling:0}] },
  { code:'p12', product_group:'Meat & Poultry',             category:'Poultry',              sub_type:'Chicken',               name:'Country Chicken',  regional_name:'நாட்டுக் கோழி', unit:'kg',    exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:32000,handling:1000},{district:'Tiruchirappalli',market_price:33300,handling:1000},{district:'Thanjavur',market_price:31000,handling:500}] },
  { code:'p13', product_group:'Meat & Poultry',             category:'Poultry',              sub_type:'Chicken',               name:'Broiler Chicken',  regional_name:'பிராயிலர் கோழி',unit:'kg',   exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:18000,handling:1000},{district:'Tiruchirappalli',market_price:18700,handling:1000},{district:'Thanjavur',market_price:17500,handling:500}] },
  { code:'p14', product_group:'Meat & Poultry',             category:'Red Meat',             sub_type:'Lamb & Mutton',         name:'Goat Mutton',      regional_name:'ஆட்டிறைச்சி',  unit:'kg',    exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:75000,handling:1000},{district:'Tiruchirappalli',market_price:78000,handling:1000},{district:'Thanjavur',market_price:72800,handling:500}] },
  { code:'p15', product_group:'Meat & Poultry',             category:'Seafood',              sub_type:'Freshwater Fish',       name:'Catfish',          regional_name:'கெளுத்தி மீன்', unit:'kg',    exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:22000,handling:1000},{district:'Tiruchirappalli',market_price:22900,handling:1000},{district:'Thanjavur',market_price:21300,handling:500}] },
  { code:'p16', product_group:'Meat & Poultry',             category:'Seafood',              sub_type:'Shellfish',             name:'Prawn',            regional_name:'இறால்',          unit:'kg',    exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:45000,handling:1000},{district:'Tiruchirappalli',market_price:46800,handling:1000},{district:'Thanjavur',market_price:43600,handling:500}] },
  { code:'p17', product_group:'Dairy & Plant-Based Alternatives', category:'Milk & Cream',  sub_type:'Whole Milk',            name:'Fresh Milk',       regional_name:'பால்',           unit:'litre', exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:6000,handling:1000},{district:'Tiruchirappalli',market_price:6200,handling:1000},{district:'Thanjavur',market_price:5800,handling:500}] },
  { code:'p18', product_group:'Dairy & Plant-Based Alternatives', category:'Yogurt & Eggs', sub_type:'Yogurt',                name:'Curd',             regional_name:'தயிர்',          unit:'kg',    exotic:true,  platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:7000,handling:1000},{district:'Tiruchirappalli',market_price:7300,handling:1000},{district:'Thanjavur',market_price:6800,handling:500}] },
  { code:'p19', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Herbs & Seasonals',     name:'Coriander Leaves', regional_name:'கொத்தமல்லி',    unit:'bunch', exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:1500,handling:0},{district:'Tiruchirappalli',market_price:1600,handling:0},{district:'Thanjavur',market_price:1500,handling:0}] },
  { code:'p20', product_group:'Fresh Produce',              category:'Vegetables',           sub_type:'Herbs & Seasonals',     name:'Curry Leaves',     regional_name:'கறிவேப்பிலை',   unit:'bunch', exotic:false, platform_fee_pct:5,
    prices:[{district:'Pudukkottai',market_price:1000,handling:0},{district:'Tiruchirappalli',market_price:1000,handling:0},{district:'Thanjavur',market_price:1000,handling:0}] },
];

async function seed() {
  console.log('\nSeeding product catalogue…');
  console.log('─'.repeat(72));

  for (const p of PRODUCTS) {
    const { prices, ...product } = p;
    product.available  = true;
    product.price_date = '2026-06-25';

    // Upsert product (update if code already exists)
    const { data: prod, error: pe } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'code' })
      .select('id, code, name')
      .single();

    if (pe) { console.error(`FAIL  ${p.code} ${p.name}: ${pe.message}`); continue; }

    // Upsert district prices
    const priceRows = prices.map(pr => ({ product_id: prod.id, ...pr }));
    const { error: dpe } = await supabase
      .from('product_district_prices')
      .upsert(priceRows, { onConflict: 'product_id,district' });

    if (dpe) {
      console.error(`FAIL  prices for ${p.name}: ${dpe.message}`);
    } else {
      const tag = p.exotic ? '🥩' : '🌿';
      console.log(`OK  ${tag}  ${p.code}  ${p.name.padEnd(20)} [${p.category} › ${p.sub_type}]`);
    }
  }

  console.log('─'.repeat(72));
  console.log(`Done. ${PRODUCTS.length} products seeded.`);
}

seed().catch(e => { console.error(e); process.exit(1); });
