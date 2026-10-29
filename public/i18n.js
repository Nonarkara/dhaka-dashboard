// Translate presentation text only. API fields, source identifiers and links stay stable.
(function () {
  'use strict';
  const catalog = window.ATLAS_BN || {};
  const originals = new WeakMap();
  let language = 'bn';
  try { language = localStorage.getItem('dhaka-atlas-language') || 'bn'; } catch {}
  const query = new URLSearchParams(window.location.search).get('lang');
  if (query === 'en' || query === 'bn') language = query;
  if (!['bn', 'en'].includes(language)) language = 'bn';

  const phrases = Object.keys(catalog).sort((a, b) => b.length - a.length);
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = phrases.length > 0
    ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + phrases.map(escape).join('|') + ')(?![\\p{L}\\p{N}])', 'gu')
    : null;

  function translate(text) {
    if (language === 'en' || typeof text !== 'string') return text;
    const key = text.replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(catalog, key)) return text.replace(text.trim(), catalog[key]);
    if (parts) return text.replace(parts, match => catalog[match] || match);
    return text;
  }

  function update(node, attribute) {
    const value = attribute ? node.getAttribute(attribute) : node.nodeValue;
    if (!value) return;
    let record = originals.get(node);
    if (!record) { record = {}; originals.set(node, record); }
    const key = attribute || 'text';
    const prior = record[key];
    const original = prior && value === prior.last ? prior.original : value;
    const next = translate(original);
    record[key] = { original, last: next };
    if (value !== next) {
      if (attribute) node.setAttribute(attribute, next);
      else node.nodeValue = next;
    }
  }

  function visit(node) {
    if (node.nodeType === 3) { update(node); return; }
    if (node.nodeType !== 1 || node.hasAttribute('data-language-fixed') || /^(SCRIPT|STYLE|NOSCRIPT|CODE)$/.test(node.tagName)) return;
    ['aria-label', 'title', 'placeholder', 'alt'].forEach(attribute => {
      if (node.hasAttribute(attribute)) update(node, attribute);
    });
    for (const child of node.childNodes) visit(child);
  }

  function apply() {
    document.documentElement.lang = language;
    const select = document.getElementById('atlas-language');
    if (select) select.value = language;
    const toggle = document.getElementById('language-toggle');
    if (toggle) {
      toggle.textContent = language === 'bn' ? 'English' : 'বাংলা';
      toggle.setAttribute('aria-label', language === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন');
    }
    // The same control appears in the Map menu on narrow screens, where the
    // header has no room for it. Both say the same thing at the same time.
    const menuToggle = document.getElementById('language-toggle-menu');
    if (menuToggle) {
      menuToggle.textContent = language === 'bn' ? 'English' : 'বাংলা';
      menuToggle.setAttribute('aria-label', language === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন');
    }
    visit(document.body);
    const title = document.querySelector('title');
    if (title) visit(title);
    const description = document.querySelector('meta[name="description"]');
    if (description) update(description, 'content');
  }

  function set(value) {
    if (!['bn', 'en'].includes(value)) return;
    language = value;
    try { localStorage.setItem('dhaka-atlas-language', value); } catch {}
    if (window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', value);
      window.history.replaceState(null, '', url.toString());
    }
    apply();
    window.dispatchEvent(new CustomEvent('atlas:language', { detail: value }));
  }

  document.documentElement.lang = language;
  window.AtlasLanguage = { translate, apply, set, language: () => language };

  document.addEventListener('DOMContentLoaded', function () {
    apply();
    document.getElementById('atlas-language')?.addEventListener('change', event => set(event.target.value));
    document.getElementById('language-toggle')?.addEventListener('click', () => set(language === 'bn' ? 'en' : 'bn'));
    document.getElementById('language-toggle-menu')?.addEventListener('click', () => set(language === 'bn' ? 'en' : 'bn'));
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') for (const node of record.addedNodes) visit(node);
        else if (record.type === 'attributes') update(record.target, record.attributeName);
        else visit(record.target);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder', 'alt']
    });
  });
})();
