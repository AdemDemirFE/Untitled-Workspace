'use strict';

const { randomUUID } = require('node:crypto');

const SEED_MENU = [
  {
    name: 'Kahvaltı',
    description: 'Her gün 08:00 – 12:00 arası',
    items: [
      { name: 'Serpme Kahvaltı (2 kişilik)', description: 'Peynir çeşitleri, zeytin, bal-kaymak, reçel, domates, salatalık, sahanda yumurta ve sınırsız çay.', price: 650, tags: ['yeni'], allergens: 'Süt, yumurta, gluten', isFeatured: true },
      { name: 'Menemen', description: 'Domates, biber ve yumurtanın tereyağında buluşması.', price: 180, tags: ['vejetaryen'], allergens: 'Yumurta, süt' },
      { name: 'Peynirli Gözleme', description: 'El açması yufka, beyaz peynir ve maydanoz.', price: 160, tags: ['vejetaryen'], allergens: 'Gluten, süt' },
    ],
  },
  {
    name: 'Çorbalar',
    description: '',
    items: [
      { name: 'Mercimek Çorbası', description: 'Limon ve kıtır ekmek ile.', price: 120, tags: ['vegan'], allergens: '' },
      { name: 'Yayla Çorbası', description: 'Yoğurt, pirinç ve nane.', price: 130, tags: ['vejetaryen', 'glutensiz'], allergens: 'Süt' },
    ],
  },
  {
    name: 'Ana Yemekler',
    description: 'Tüm ana yemekler pilav ve közlenmiş sebze ile servis edilir.',
    items: [
      { name: 'Adana Kebap', description: 'Zırh kıyması, közlenmiş domates ve biber, lavaş.', price: 420, tags: ['acı'], allergens: 'Gluten', isFeatured: true },
      { name: 'İskender', description: 'Döner, tereyağı, domates sosu ve yoğurt.', price: 460, tags: [], allergens: 'Gluten, süt' },
      { name: 'Izgara Köfte', description: 'Ev yapımı köfte, piyaz ile.', price: 360, tags: [], allergens: 'Gluten, yumurta' },
      { name: 'Fırında Sebze Güveç', description: 'Mevsim sebzeleri, zeytinyağı ve kekik.', price: 290, tags: ['vegan', 'glutensiz'], allergens: '' },
    ],
  },
  {
    name: 'Tatlılar',
    description: '',
    items: [
      { name: 'Künefe', description: 'Hatay peyniri, kadayıf, Antep fıstığı.', price: 220, tags: [], allergens: 'Süt, gluten, fıstık', isFeatured: true },
      { name: 'Fırın Sütlaç', description: 'Taş fırında, tarçın ile.', price: 140, tags: ['glutensiz'], allergens: 'Süt' },
      { name: 'Kabak Tatlısı', description: 'Tahin ve ceviz ile.', price: 150, tags: ['vegan', 'glutensiz'], allergens: 'Ceviz, susam', isAvailable: false },
    ],
  },
  {
    name: 'İçecekler',
    description: '',
    items: [
      { name: 'Çay', description: 'İnce belli bardakta demlik çay.', price: 25, tags: ['vegan'], allergens: '' },
      { name: 'Türk Kahvesi', description: 'Lokum ile.', price: 80, tags: [], allergens: '' },
      { name: 'Ayran', description: 'Köpüklü, ev yapımı.', price: 45, tags: ['vejetaryen'], allergens: 'Süt' },
      { name: 'Taze Portakal Suyu', description: 'Günlük sıkılır.', price: 95, tags: ['vegan', 'yeni'], allergens: '' },
    ],
  },
];

/** Sample Turkish restaurant written to the data file on first run. */
function createSeedData() {
  const categories = [];
  const items = [];
  SEED_MENU.forEach((cat, catIndex) => {
    const categoryId = randomUUID();
    categories.push({
      id: categoryId,
      name: cat.name,
      description: cat.description,
      sortOrder: catIndex,
      isVisible: true,
    });
    cat.items.forEach((item, itemIndex) => {
      items.push({
        id: randomUUID(),
        categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        imageUrl: '',
        tags: item.tags,
        allergens: item.allergens,
        isAvailable: item.isAvailable ?? true,
        isFeatured: item.isFeatured ?? false,
        sortOrder: itemIndex,
      });
    });
  });

  return {
    settings: {
      restaurantName: 'Lezzet Durağı',
      description: 'Ev yapımı lezzetler, taze malzemeler. Afiyet olsun!',
      logoUrl: '',
      currency: '₺',
      primaryColor: '#c2410c',
    },
    categories,
    items,
  };
}

module.exports = { createSeedData };
