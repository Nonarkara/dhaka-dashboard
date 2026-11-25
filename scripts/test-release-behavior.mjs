import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createReceipt, applyStage, finalizeReceipt, saveReceipt, runStage, assertWriterIdle, REQUIRED_RELEASE_STAGES } from './lib/release-receipt.mjs';

const prior={id:'previous-deployment',status:'passed',exitCode:0,required:false};
const receipt=createReceipt('2026-11-25T00:00:00Z');
applyStage(receipt,prior,{output:JSON.stringify([{id:'old',created_on:'2026-11-20T00:00:00Z',versions:[{version_id:'old-version',percentage:100}]}])});
assert.equal(receipt.previousDeployment.versions[0].versionId,'old-version');
assert.equal(receipt.rollback.eligibility,'candidate-recorded');
assert.equal(receipt.rollback.automatic,false);
const failedCapture=createReceipt();applyStage(failedCapture,{...prior,status:'failed',exitCode:1});
assert.equal(failedCapture.previousDeployment,null);assert.equal(failedCapture.rollback.reasonCode,'previous-deployment-unavailable');
const stage=(id,exitCode=0)=>({id,required:true,status:exitCode?'failed':'passed',exitCode});
const good=createReceipt();
good.stages=REQUIRED_RELEASE_STAGES.map(id=>stage(id));
applyStage(good,good.stages.find(s=>s.id==='deploy'),{output:'Current Version ID: 11111111-1111-1111-1111-111111111111'});
applyStage(good,good.stages.find(s=>s.id==='live-bytes'));
applyStage(good,good.stages.find(s=>s.id==='satellite'),{gateResult:{status:'ok',reasonCode:null,coverage:1,quietLayers:[]}});
assert.equal(finalizeReceipt(good,0).outcome,'deployed-and-verified');
assert.equal(good.releaseAccepted,true);
const truncated=structuredClone(good);truncated.stages=truncated.stages.filter(s=>s.id!=='planning');
assert.equal(finalizeReceipt(truncated,0).releaseAccepted,false,'an absent required check cannot yield an accepted release');
assert.deepEqual(truncated.missingStages,['planning']);
const disguised=structuredClone(good);Object.assign(disguised.stages.find(s=>s.id==='contracts'),{required:false,status:'failed',exitCode:5});
assert.equal(finalizeReceipt(disguised,0).releaseAccepted,false,'required canonical IDs cannot be demoted by a mutable flag');assert.deepEqual(disguised.failedStages,['contracts']);
const mismatchedExit=structuredClone(good);mismatchedExit.stages.find(s=>s.id==='contracts').exitCode=5;assert.equal(finalizeReceipt(mismatchedExit,0).releaseAccepted,false,'a passed label cannot erase a nonzero command exit');
const duplicate=structuredClone(good);duplicate.stages.push(stage('live-bytes'));assert.equal(finalizeReceipt(duplicate,0).releaseAccepted,false);
const degraded=structuredClone(good);degraded.stages[degraded.stages.findIndex(s=>s.id==='satellite')]=stage('satellite',1);
applyStage(degraded,degraded.stages.find(s=>s.id==='satellite'),{gateResult:{status:'degraded',reasonCode:'satellite-health-threshold',coverage:0.7,quietLayers:['a','b']}});
assert.equal(finalizeReceipt(degraded,1).outcome,'deployed-data-health-gate-failed');
assert.equal(degraded.releaseAccepted,false,'data degradation must never erase the original failed gate');
const corrupt=structuredClone(good);corrupt.stages[corrupt.stages.findIndex(s=>s.id==='satellite')]=stage('satellite',1);
applyStage(corrupt,corrupt.stages.find(s=>s.id==='satellite'),{gateResult:{status:'failed',reasonCode:'missing-instrument',coverage:null,quietLayers:[]}});
assert.equal(finalizeReceipt(corrupt,1).outcome,'deployed-verification-failed');
const contradictory=stage('satellite');applyStage(createReceipt(),contradictory,{gateResult:{status:'failed',reasonCode:'invalid',coverage:null,quietLayers:[]}});
assert.equal(contradictory.exitCode,1);assert.equal(contradictory.reasonCode,'gate-result-exit-contradiction');
const missingResult=stage('satellite');applyStage(createReceipt(),missingResult);
assert.equal(missingResult.exitCode,1);assert.equal(missingResult.reasonCode,'gate-result-missing-or-invalid');
const interrupted=createReceipt();interrupted.stages=[{id:'contracts',required:true,status:'running'}];
assert.equal(finalizeReceipt(interrupted,130).stages[0].status,'interrupted');
assert.equal(interrupted.outcome,'not-deployed');
assert.throws(()=>assertWriterIdle({env:{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push'}}),/manual workflow/);
assertWriterIdle({env:{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch'}});
assertWriterIdle({env:{},readRuns:()=>JSON.stringify([{event:'push',status:'in_progress'}])});
assert.throws(()=>assertWriterIdle({env:{},readRuns:()=>JSON.stringify([{event:'workflow_dispatch',status:'queued',databaseId:17}])}),/17 is active/);
assert.throws(()=>assertWriterIdle({env:{},readRuns:()=>{throw Error('offline');}}),/Cannot verify/);
assert.throws(()=>assertWriterIdle({env:{},readRuns:()=>JSON.stringify({runs:[]})}),/Cannot verify/);

const dir=mkdtempSync(join(tmpdir(),'dhaka-release-'));
try {
  const file=join(dir,'unit-receipt.json');saveReceipt(file,truncated);
  const unfinished=spawnSync(process.execPath,['scripts/lib/release-receipt.mjs','finish',file,'0'],{encoding:'utf8'});
  assert.equal(unfinished.status,1,'an incomplete receipt must make the canonical finalizer fail');assert.equal(JSON.parse(readFileSync(file,'utf8')).exitCode,1);
  saveReceipt(file,createReceipt());
  const noAuth=spawnSync(process.execPath,['scripts/lib/release-receipt.mjs','refuse',file,'credentials','cloudflare-token-not-configured'],{encoding:'utf8'});
  assert.equal(noAuth.status,1);assert.equal(JSON.parse(readFileSync(file,'utf8')).outcome,'not-deployed');
  saveReceipt(file,createReceipt());
  assert.equal(await runStage(file,'fails','software',true,process.execPath,['-e','process.stdout.write("failure evidence");process.exit(7)']),7);
  const failed=JSON.parse(readFileSync(file,'utf8')).stages[0];
  assert.equal(failed.exitCode,7);assert.equal(readFileSync(failed.log,'utf8'),'failure evidence');
  assert.equal(await runStage(file,'timeout','software',true,process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:40}),124);
  assert.equal(JSON.parse(readFileSync(file,'utf8')).stages[1].reasonCode,'stage-timeout');
  const previousGate=process.env.DHAKA_GATE_RESULT_PATH;
  try {
    process.env.DHAKA_GATE_RESULT_PATH=join(dir,'stale-gate.json');
    writeFileSync(process.env.DHAKA_GATE_RESULT_PATH,JSON.stringify({status:'ok',reasonCode:null,coverage:1,quietLayers:[]}));
    assert.equal(await runStage(file,'satellite','data',true,process.execPath,['-e','process.exit(0)']),1,'an old result cannot clear a crashed/missing verifier');
    assert.equal(JSON.parse(readFileSync(file,'utf8')).stages.at(-1).reasonCode,'gate-result-missing-or-invalid');
  } finally {if(previousGate===undefined)delete process.env.DHAKA_GATE_RESULT_PATH;else process.env.DHAKA_GATE_RESULT_PATH=previousGate;}


  // Exercise the real canonical shell, with fake providers only. Nothing is
  // uploaded and the command log proves ordering and stop/continue behavior.
  const root=join(dir,'repo');mkdirSync(join(root,'scripts/lib'),{recursive:true});mkdirSync(join(root,'bin'));mkdirSync(join(root,'src'));
  cpSync(resolve('scripts/deploy-live.sh'),join(root,'scripts/deploy-live.sh'));
  cpSync(resolve('scripts/lib/release-receipt.mjs'),join(root,'scripts/lib/release-receipt.mjs'));
  writeFileSync(join(root,'scripts/stamp-build-id.mjs'),'import{writeFileSync}from"node:fs";writeFileSync("src/build-id.ts",\'export const BUILD_ID = "fixture-build";\');');
  writeFileSync(join(root,'bin/gh'),'#!/bin/sh\nprintf "[]"\n',{mode:0o755});
  writeFileSync(join(root,'bin/npm'),`#!/bin/sh
printf 'npm %s\\n' "$*" >> "$COMMAND_LOG"
if [ "$FAIL_STAGE" = preflight ] && [ "$*" = test ]; then exit 4; fi
if [ "$*" = 'run verify:satellite' ]; then
  if [ "$FAIL_STAGE" = satellite ]; then printf '{"status":"degraded","reasonCode":"upstream-absent","coverage":0.7,"quietLayers":["a","b"]}' > "$DHAKA_GATE_RESULT_PATH"; exit 1; fi
  printf '{"status":"ok","reasonCode":null,"coverage":1,"quietLayers":[]}' > "$DHAKA_GATE_RESULT_PATH"
fi
`,{mode:0o755});
  writeFileSync(join(root,'bin/npx'),`#!/bin/sh
printf 'npx %s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
 'wrangler deployments list --json') printf '[{"id":"previous","versions":[{"version_id":"old","percentage":100}]}]';;
 'wrangler deploy') printf 'Current Version ID: 11111111-1111-1111-1111-111111111111\\n';;
esac
`,{mode:0o755});
  for(const name of ['verify-live-bytes','verify-gibs-live','verify-snapshots-live','verify-people-live','verify-planning-live']) {
    writeFileSync(join(root,'scripts',name+'.mjs'),`import{appendFileSync}from'node:fs';appendFileSync(process.env.COMMAND_LOG,'${name}\\n');if(process.env.FAIL_STAGE==='bytes'&&'${name}'==='verify-live-bytes')process.exit(3);`);
  }
  function release(fail) {
    const output=join(dir,fail||'success'),commandLog=join(dir,(fail||'success')+'.commands');
    const result=spawnSync('bash',['scripts/deploy-live.sh'],{cwd:root,encoding:'utf8',timeout:60000,
      env:{...process.env,GITHUB_ACTIONS:'false',FAIL_STAGE:fail,COMMAND_LOG:commandLog,DHAKA_RELEASE_DIR:output,PATH:join(root,'bin')+':'+process.env.PATH}});
    assert.equal(result.error,undefined,`${result.error?.message}\n${result.stdout}\n${result.stderr}`);
    return {result,receipt:JSON.parse(readFileSync(join(output,'receipt.json'),'utf8')),commands:existsSync(commandLog)?readFileSync(commandLog,'utf8'):''};
  }
  mkdirSync(join(root,'.deploy-locked'));
  const locked=release('lock');assert.notEqual(locked.result.status,0);assert.equal(locked.receipt.outcome,'not-deployed');
  assert.equal(locked.commands,'');assert.ok(existsSync(join(root,'.deploy-locked')),'a rejected writer cannot remove another writer lock');
  rmSync(join(root,'.deploy-locked'),{recursive:true});
  const refused=release('preflight');assert.notEqual(refused.result.status,0);
  assert.equal(refused.receipt.deployment,'not-attempted');assert.doesNotMatch(refused.commands,/npx wrangler/);
  const partial=release('satellite');assert.notEqual(partial.result.status,0);
  assert.equal(partial.receipt.outcome,'deployed-data-health-gate-failed');
  assert.match(partial.commands,/verify-snapshots-live/);assert.match(partial.commands,/verify-people-live/);assert.match(partial.commands,/verify-planning-live/);
  const badBytes=release('bytes');assert.notEqual(badBytes.result.status,0);
  assert.equal(badBytes.receipt.codeVerification,'failed');assert.equal(badBytes.receipt.outcome,'deployed-verification-failed');
  assert.match(badBytes.commands,/verify-planning-live/,'independent checks must continue after a byte failure');
  const success=release('');assert.equal(success.result.status,0,success.result.stderr);
  assert.equal(success.receipt.releaseAccepted,true);assert.equal(success.receipt.buildId,'fixture-build');
  assert.equal(success.receipt.workerVersion,'11111111-1111-1111-1111-111111111111');
  // The actual live verifier runs offline against maintained fixture data.
  // These cases prove source-health failures cannot hide contract defects.
  const preload=join(dir,'satellite-preload.mjs');
  writeFileSync(preload,`import {makePublicationFixture,refreshPublicationReadings} from ${JSON.stringify(pathToFileURL(resolve('scripts/fixtures/publication-snapshot.mjs')).href)};
const RealDate=Date,NOW=RealDate.parse('2026-11-25T12:00:00Z');
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}};
const body=makePublicationFixture();body.delivery={source:'persistent-snapshot',ageSeconds:0,status:'fresh',collectedAt:new Date().toISOString()};
const mode=process.env.VERIFIER_FIXTURE;
const quiet=(layer,reason='no-observation-in-window')=>{for(const place of body.districts){const m=place.measurements.find(m=>m.layerId===layer);Object.assign(m,{status:'unavailable',value:null,min:null,max:null,mean:null,samples:0,coverage:0,reasonCode:reason});}};
if(['partial','two-quiet','source-fault'].includes(mode))quiet('MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth',mode==='source-fault'?'colormap-unit-mismatch':'no-observation-in-window');
if(mode==='two-quiet')quiet('MODIS_Terra_Land_Surface_Temp_Day_TES');
if(mode==='low-coverage'){let count=0;for(const p of body.districts)for(const m of p.measurements)if(count++<49)Object.assign(m,{status:'unavailable',value:null,min:null,max:null,mean:null,samples:0,coverage:0,reasonCode:'cloud-or-no-observation'});}
if(mode==='missing')for(const p of body.districts)p.measurements.pop();
if(mode==='unit')body.districts[0].measurements[0].unit='invented-unit';
body.measured=body.districts.flatMap(p=>p.measurements).filter(m=>m.status==='ok').length;body.status=body.measured===body.total?'ok':'partial';body.reasonCode=body.status==='ok'?null:'some-signals-unavailable';refreshPublicationReadings(body);
globalThis.fetch=async()=>{if(mode==='transport')throw Error('fixture transport failure');return Response.json(body);};
`);
  for(const [mode,status,exit] of [
    ['healthy','ok',0],['partial','degraded',0],['two-quiet','degraded',1],['low-coverage','degraded',1],
    ['missing','failed',1],['unit','failed',1],['source-fault','failed',1],['transport','failed',1],
  ]) {
    const gatePath=join(dir,mode+'-gate.json');
    const result=spawnSync(process.execPath,['--import','./scripts/lib/ts-resolver.mjs','--import',preload,'scripts/verify-satellite-live.mjs'],{
      encoding:'utf8',timeout:30000,env:{...process.env,VERIFIER_FIXTURE:mode,DHAKA_GATE_RESULT_PATH:gatePath}});
    assert.equal(result.status,exit,`${mode}: ${result.stderr}`);
    const gate=JSON.parse(readFileSync(gatePath,'utf8'));
    assert.equal(gate.status,status,`${mode} incorrectly classified`);
    assert.ok(Array.isArray(gate.quietLayers));assert.ok(Number.isFinite(Date.parse(gate.checkedAt)));
    if(status==='failed'){assert.equal(gate.coverage,null);assert.equal(gate.reasonCode,'satellite-integrity-or-transport-failed');}
    if(mode==='two-quiet'){assert.equal(gate.quietLayers.length,2);assert.equal(gate.reasonCode,'satellite-health-threshold-failed');}
    if(mode==='low-coverage')assert.equal(gate.coverage,0.5);
  }
  console.log('✓ Actual satellite gate: healthy, acceptable partial, two quiet instruments, low coverage, missing/unit/source faults and transport classification.');
  const workflow=readFileSync('.github/workflows/deploy.yml','utf8');
  assert.match(workflow,/concurrency:[\s\S]*group: dhaka-production[\s\S]*cancel-in-progress: false/);
  assert.match(workflow,/if: github.event_name == 'workflow_dispatch' && inputs.release && steps.cf_auth.outputs.has_token == 'true'/);
  assert.match(workflow,/Validation only — no deployment/);
  console.log('✓ Release behavior: mandatory preflight, exclusive writer checks, bounded stages, typed data results, independent checks and honest durable receipts.');
} finally {rmSync(dir,{recursive:true,force:true});}
