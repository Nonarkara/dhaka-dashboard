/* Palette plate 001 (English Red #d96629 + Cerulian Blue #0093a5); see docs/DESIGN-OUTLOOK.md and THIRD_PARTY_NOTICES.md. */
(function () {
  'use strict';
  const colors = {
    civic: '#d96629',
    commerce: '#0093a5',
    retail: '#e2953b',
    homes: '#c5a56e',
    apartments: '#d17b58',
    industry: '#5a6772',
    mosque: '#2d8a88',
    education: '#2563a8',
    healthcare: '#10b981',
    unknown: '#b4b0a3'
  };

  function classify(p) {
    const use = p['building:use'] || p.building;
    if (p.office === 'government' || ['school','college','university','hospital','place_of_worship','community_centre','townhall','courthouse','library','police','fire_station'].includes(p.amenity) || ['public','civic','government','hospital','school','college','university','mosque','church','temple'].includes(use)) return 'civic';
    if (['industrial','warehouse','factory','service','utility','power'].includes(use)) return 'industry';
    if (['residential','apartments','house','detached','dormitory','terrace','semidetached_house'].includes(use)) return 'homes';
    if ((p.shop && p.shop !== 'no') || (p.office && p.office !== 'no') || ['commercial','retail','office','restaurant','hotel'].includes(use)) return 'commerce';
    return 'unknown';
  }

  const paint = [
    'match',
    ['coalesce', ['get', 'use_class'], ['get', 'building'], ['get', 'amenity'], ['get', 'office'], ['get', 'class'], 'unknown'],
    // Palette 1 Anchor: Civic & Government -> English Red
    'civic', '#d96629',
    'government', '#d96629',
    'public', '#d96629',
    'townhall', '#d96629',
    'courthouse', '#d96629',
    'police', '#d96629',
    'fire_station', '#d96629',
    // Palette 1 Anchor: Commerce & Office -> Cerulian Blue
    'commerce', '#0093a5',
    'commercial', '#0093a5',
    'office', '#0093a5',
    'company', '#0093a5',
    'bank', '#0093a5',
    'hotel', '#0093a5',
    // Retail & Wholesale Markets -> Warm Amber
    'retail', '#e2953b',
    'supermarket', '#e2953b',
    'mall', '#e2953b',
    'marketplace', '#e2953b',
    'market', '#e2953b',
    'kiosk', '#e2953b',
    'restaurant', '#e2953b',
    // Homes -> Isabella Sand
    'homes', '#c5a56e',
    'residential', '#c5a56e',
    'house', '#c5a56e',
    'detached', '#c5a56e',
    'terrace', '#c5a56e',
    // Apartments & Housing Towers -> Terracotta Brick
    'apartments', '#d17b58',
    'dormitory', '#d17b58',
    // Industry & RMG Factories -> Industrial Slate
    'industry', '#5a6772',
    'industrial', '#5a6772',
    'warehouse', '#5a6772',
    'factory', '#5a6772',
    'manufacture', '#5a6772',
    'service', '#5a6772',
    'utility', '#5a6772',
    'power', '#5a6772',
    // Religious & Mosques -> Mosque Jade Teal
    'mosque', '#2d8a88',
    'place_of_worship', '#2d8a88',
    'temple', '#2d8a88',
    'church', '#2d8a88',
    'shrine', '#2d8a88',
    // Education -> Academic Lapis
    'school', '#2563a8',
    'university', '#2563a8',
    'college', '#2563a8',
    'kindergarten', '#2563a8',
    // Healthcare -> Medical Celadon
    'hospital', '#10b981',
    'clinic', '#10b981',
    'pharmacy', '#10b981',
    // Default neutral ground
    '#b4b0a3'
  ];

  window.DhakaDesign = { colors, classify, paint };

  function render() {
    const bn = document.documentElement.lang === 'bn';
    const node = document.getElementById('building-key');
    if (!node) return;
    const items = [
      { key: 'civic', color: colors.civic, en: 'Civic / Gov (Palette 1 Red)', bn: 'নাগরিক / সরকার (প্যালেট ১ লাল)' },
      { key: 'commerce', color: colors.commerce, en: 'Commerce / Office (Palette 1 Blue)', bn: 'বাণিজ্য / অফিস (প্যালেট ১ নীল)' },
      { key: 'retail', color: colors.retail, en: 'Retail / Markets', bn: 'খুচরা ও পাইকারি বাজার' },
      { key: 'apartments', color: colors.apartments, en: 'Apartments / Towers', bn: 'অ্যাপার্টমেন্ট ও ফ্ল্যাট' },
      { key: 'homes', color: colors.homes, en: 'Houses / Residential', bn: 'আবাসিক বাড়ি' },
      { key: 'mosque', color: colors.mosque, en: 'Mosques / Religious', bn: 'মসজিদ ও ধর্মীয় স্থান' },
      { key: 'education', color: colors.education, en: 'Education / Campus', bn: 'শিক্ষা ও বিশ্ববিদ্যালয়' },
      { key: 'healthcare', color: colors.healthcare, en: 'Healthcare / Hospitals', bn: 'হাসপাতাল ও স্বাস্থ্য' },
      { key: 'industry', color: colors.industry, en: 'Industry / RMG / EPZ', bn: 'শিল্প ও তৈরি পোশাক' },
      { key: 'unknown', color: colors.unknown, en: 'Neutral Ground', bn: 'সাধারণ ভবন' },
    ];
    node.innerHTML = `<details><summary>${bn ? 'ভবনের ধরন (প্যালেট ১)' : 'Building types (Palette 1)'}</summary><div class="building-swatches">${items.map(it => `<span><i style="background:${it.color}"></i>${bn ? it.bn : it.en}</span>`).join('')}</div><p>${bn ? 'সানজো ওয়াদা প্যালেট ১ (ইংরেজি লাল ও নীল) অনুসারে ভবনের ধরন চিহ্নিত। অন্যান্য ভবন প্রাকৃতিক ধূসর।' : 'Sanzo Wada Palette 1 tone (English Red & Cerulian Blue). Streamed buildings use mapped OSM types.'}</p></details>`;
  }

  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('atlas:language', render);
})();
