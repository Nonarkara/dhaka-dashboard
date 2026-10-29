// Local rendered regression/failure states. Remove public/__people-* before release.
import {readFileSync,writeFileSync} from 'node:fs';
const html=readFileSync('public/index.html','utf8');
writeFileSync('public/__people-before.css', readFileSync('scripts/fixtures/geometry/before-controls.css','utf8')+'\n.people-key-body{padding:48px;max-height:none}\n');
writeFileSync('public/__people-before.html',html.replace('</head>','<link rel="stylesheet" href="/__people-before.css"></head>'));
writeFileSync('public/__people-outage.html',html.replace('<head>',`<head><script>const originalFetch=window.fetch;let failOnce=true;window.fetch=(input,options)=>{if(failOnce&&String(input).includes('/api/atlas/people')){return Promise.resolve(Response.json({status:'unavailable',reasonCode:'fixture-reference-offline'},{status:503}));}return originalFetch(input,options);};document.addEventListener('click',event=>{if(event.target.closest('#people-retry'))failOnce=false;},true);</script>`));
console.log('Created isolated people before/outage fixtures; remove public/__people-* before release.');
