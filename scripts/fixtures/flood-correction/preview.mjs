// Temporary browser-only states. Never deploy the generated __river-*.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { RIVER_STATIONS } from '../../../src/dhaka-data.ts';
import { execFileSync } from 'node:child_process';
const stations=RIVER_STATIONS.map((s,i)=>({...s, rainfall:{status:i===3?'unavailable':'ok', value:i===3?null:i*12.5, unit:'mm', reasonCode:i===3?'rainfall-query-not-mapped':null, retrievedAt:i===3?null:'2026-10-29T14:00:00Z',validFrom:'2026-10-29T13:00:00Z',validTo:'2026-10-30T13:00:00Z',source:'Open-Meteo Weather API',query:i===3?null:{latitude:23.7,longitude:90.4}},floodRisk:{status:'unavailable',tier:null}}));
const html=readFileSync('public/index.html','utf8');
writeFileSync('public/__river-values.html',html.replace('<head>','<head><script>const originalFetch=window.fetch;window.fetch=(input,options)=>String(input).includes("/api/dhaka/rivers")?Promise.resolve(Response.json('+JSON.stringify({status:'partial',stations})+')):originalFetch(input,options);</script>'));
const old=p=>execFileSync('git',['show','481746b:'+p],{encoding:'utf8'});
const oldStations=RIVER_STATIONS.map((s,i)=>({...s,floodRisk:{tier:'normal',reasonCode:i===3?'rainfall-data-unavailable':null,rain_24h_mm:i===3?null:0.8,rainfallStatus:i===3?'unavailable':'ok',note:'Modeled flood risk proxy from 24h rainfall accumulation. Not an official FFWC flood warning.'}}));
const oldBody={status:'ok',summary:{normal:6,watch:0,alert:0,danger:0,unavailable:0},stations:oldStations};
writeFileSync('public/__river-before.html',old('public/index.html').replace('<head>','<head><script>const oldFetch=window.fetch;window.fetch=(input,options)=>String(input).includes("/api/dhaka/rivers")?Promise.resolve(Response.json('+JSON.stringify(oldBody)+')):oldFetch(input,options);</script>').replace(/src="\/dashboard.js[^\"]*"/,'src="/__river-before.js"').replace(/href="\/dhaka-design.css[^\"]*"/,'href="/__river-before.css"'));
writeFileSync('public/__river-before.js',old('public/dashboard.js'));
writeFileSync('public/__river-before.css',old('public/dhaka-design.css'));
console.log('Preview fixtures generated; remove public/__river-* before deploy.');
