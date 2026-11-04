import { readFileSync, writeFileSync } from 'node:fs';
const html=readFileSync('public/index.html','utf8');
writeFileSync('public/__enlarged.html',html.replace('</head>','<style>:root {--text-display:48px;--text-body:26px;--text-micro:22px;}</style></head>'));
// One failed source request, followed by the actual local API on explicit retry.
writeFileSync('public/__retry.html',html.replace('</head>',`<script>const realFetch=window.fetch.bind(window);let airFailed=false;window.fetch=(url,options)=>{if(String(url)==='/api/atlas/air-quality'&&!airFailed){airFailed=true;return Promise.resolve(new Response(JSON.stringify({status:'unavailable',reasonCode:'audit-source-offline',timestamp:new Date().toISOString()}),{status:503,headers:{'content-type':'application/json'}}));}return realFetch(url,options);};</script></head>`));
console.log('Local audit fixtures generated; remove public/__enlarged.html and public/__retry.html before release.');
