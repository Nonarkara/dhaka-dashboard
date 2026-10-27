/* Palette plate 241; see docs/DESIGN-OUTLOOK.md and THIRD_PARTY_NOTICES.md. */
(function () {
  'use strict';
  const colors = { civic: '#dd4027', commerce: '#547076', homes: '#c5a56e', industry: '#ffefae', unknown: '#b4b0a3' };
  function classify(p) {
    const use = p['building:use'] || p.building;
    if (p.office === 'government' || ['school','college','university','hospital','place_of_worship','community_centre','townhall','courthouse','library','police','fire_station'].includes(p.amenity) || ['public','civic','government','hospital','school','college','university','mosque','church','temple'].includes(use)) return 'civic';
    if (['industrial','warehouse','factory','service','utility','power'].includes(use)) return 'industry';
    if (['residential','apartments','house','detached','dormitory','terrace','semidetached_house'].includes(use)) return 'homes';
    if ((p.shop && p.shop !== 'no') || (p.office && p.office !== 'no') || ['commercial','retail','office','restaurant','hotel'].includes(use)) return 'commerce';
    return 'unknown';
  }
  window.DhakaDesign = { colors, classify, paint: ['match', ['get', 'use_class'], ...Object.entries(colors).filter(([k]) => k !== 'unknown').flat(), colors.unknown] };
  function render() {
    const bn = document.documentElement.lang === 'bn';
    const node = document.getElementById('building-key');
    if (!node) return;
    const labels = bn ? ['নাগরিক / সামাজিক','বাণিজ্য','আবাসন','শিল্প / পরিষেবা','ব্যবহার অজানা'] : ['Civic / community','Commerce','Homes','Industry / utilities','Use unknown'];
    node.innerHTML = `<details><summary>${bn ? 'ভবনের ব্যবহার' : 'Building use'}</summary><div class="building-swatches">${Object.entries(colors).map(([k,c],i) => `<span><i style="background:${c}"></i>${labels[i]}</span>`).join('')}</div><p>${bn ? 'OSM ট্যাগ অনুযায়ী রং। স্ট্রিম করা ভবনের ব্যবহার অজানা। উচ্চতা নথিভুক্ত বা আনুমানিক।' : 'Colors follow OSM tags. Streamed buildings have unknown use. Heights mapped or estimated.'}</p></details>`;
  }
  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('atlas:language', render);
})();
