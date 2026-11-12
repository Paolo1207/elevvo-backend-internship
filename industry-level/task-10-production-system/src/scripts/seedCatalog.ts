// Adds a larger, more varied catalog (outdoor gear, clothing, home, some Arabic names) so semantic search has
// something interesting to find. Safe to run more than once: products are matched by name.
import { disconnectDatabase, prisma } from '../lib/prisma';

const catalog = [
  { name: 'Alpine Down Jacket', description: 'Warm, lightweight insulated jacket for winter hiking and mountaineering in freezing weather', price: '149.00', stock: 25 },
  { name: 'Waterproof Hiking Boots', description: 'Sturdy leather boots with grip soles for rocky trails and snow', price: '119.00', stock: 30 },
  { name: 'Merino Wool Base Layer', description: 'Thermal underwear that keeps you warm in cold weather and wicks sweat', price: '59.00', stock: 40 },
  { name: 'Trekking Poles', description: 'Collapsible carbon poles that reduce knee strain on long mountain hikes', price: '45.00', stock: 35 },
  { name: 'Insulated Water Bottle', description: 'Stainless steel bottle keeps drinks hot for 12 hours or cold for 24', price: '27.00', stock: 80 },
  { name: 'Summer Linen Shirt', description: 'Breathable light shirt for hot beach days', price: '34.00', stock: 60 },
  { name: 'Running Shoes', description: 'Cushioned lightweight sneakers for road running and jogging', price: '89.00', stock: 45 },
  { name: 'Yoga Mat', description: 'Non-slip exercise mat for yoga, stretching and pilates', price: '25.00', stock: 70 },
  { name: 'Camping Tent 2 Person', description: 'Compact waterproof tent for two people, easy to pitch', price: '129.00', stock: 15 },
  { name: 'Sleeping Bag -10C', description: 'Warm mummy sleeping bag rated for freezing nights outdoors', price: '99.00', stock: 20 },
  { name: 'Espresso Machine', description: 'Compact coffee maker with milk frother for making espresso at home', price: '199.00', stock: 12 },
  { name: 'Cast Iron Pan', description: 'Heavy skillet for searing steak and baking cornbread', price: '39.00', stock: 33 },
  { name: 'Bluetooth Speaker', description: 'Portable waterproof speaker with deep bass and 20 hours of music', price: '55.00', stock: 50 },
  { name: 'Smart Watch', description: 'Fitness tracker with heart rate, GPS and sleep monitoring', price: '179.00', stock: 22 },
  { name: 'Leather Wallet', description: 'Slim genuine leather wallet with card slots', price: '29.00', stock: 60 },
  { name: 'Backpack 30L', description: 'Daypack with laptop sleeve for commuting and travel', price: '65.00', stock: 38 },
  { name: 'LED Desk Lamp', description: 'Dimmable reading lamp with adjustable arm for studying at night', price: '31.00', stock: 44 },
  { name: 'سترة شتوية دافئة', description: 'سترة خفيفة الوزن ودافئة مناسبة للتخييم والمشي في الجبال في الشتاء', price: '95.00', stock: 18 },
  { name: 'حذاء رياضي للجري', description: 'حذاء مريح وخفيف للجري والتمارين الرياضية اليومية', price: '75.00', stock: 28 },
  { name: 'ماكينة قهوة', description: 'جهاز لتحضير القهوة والإسبريسو في المنزل', price: '140.00', stock: 10 },
  { name: 'حقيبة سفر', description: 'حقيبة ظهر واسعة ومتينة للسفر والرحلات', price: '58.00', stock: 26 },
];

async function main(): Promise<void> {
  let created = 0;
  for (const item of catalog) {
    const exists = await prisma.product.findFirst({ where: { name: item.name }, select: { id: true } });
    if (exists === null) {
      await prisma.product.create({ data: item });
      created++;
    }
  }
  console.log(`Catalog ready: ${created} new products added, ${catalog.length - created} already existed.`);
  console.log('Next: npm run index:products');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
