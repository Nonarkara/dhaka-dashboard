// Isolated restored-layout and outage cases. Generated public/__foundation* files never ship.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const old=path=>execFileSync('git',['show',`c11e916:${path}`],{encoding:'utf8'});
const html=readFileSync('public/index.html','utf8');
writeFileSync('public/__foundation-old.html',old('public/index.html').replace(/src="\/collage.js[^\"]*"/,'src="/__foundation-old.js"').replace(/href="\/dhaka-design.css[^\"]*"/,'href="/__foundation-old.css"'));
writeFileSync('public/__foundation-old.js',old('public/collage.js'));
writeFileSync('public/__foundation-old.css',old('public/dhaka-design.css'));
const failure=`<script>const fetchStored=window.fetch;let fixtureOffline=true;window.fetch=(input,options)=>String(input).includes('/api/atlas/collage')&&fixtureOffline?Promise.resolve(Response.json({status:'unavailable',reasonCode:'fixture-storage-offline',districts:[]},{status:503})):fetchStored(input,options);document.addEventListener('DOMContentLoaded',()=>{const button=document.createElement('button');button.textContent='Restore stored snapshot (test only)';button.style='position:fixed;bottom:0;z-index:999999';button.onclick=()=>{fixtureOffline=false;button.remove();};document.body.appendChild(button);});</script>`;
writeFileSync('public/__foundation-outage.html',html.replace('<head>','<head>'+failure));
