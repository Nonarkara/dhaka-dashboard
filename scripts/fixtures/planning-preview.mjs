// Local-only states; release preflight rejects public/__* files.
import {readFileSync,writeFileSync} from 'node:fs';
const html=readFileSync('public/index.html','utf8');
writeFileSync('public/__planning-oversized.html',html.replace('</head>','<style>.planning-evidence summary{padding-block:80px!important}</style></head>'));
writeFileSync('public/__planning-outage.html',html.replace('<head>',`<head><script>const planningFetch=window.fetch;let planningOffline=true;window.fetch=(input,options)=>planningOffline&&String(input).includes('/api/dhaka/shelters')?Promise.resolve(Response.json({status:'unavailable',reasonCode:'fixture-source-offline'},{status:503})):planningFetch(input,options);document.addEventListener('click',event=>{if(event.target.closest('#planning-review-retry'))planningOffline=false;},true);</script>`));
