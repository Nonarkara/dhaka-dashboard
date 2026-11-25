import { readFileSync, writeFileSync, mkdirSync, createWriteStream, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const canonicalUrl = 'https://dhaka.nonarkara.org';
export const REQUIRED_RELEASE_STAGES = ['writer-check','types','local-files','contracts','migrations','stamp','deploy','static-entry','api','live-bytes','gibs','satellite','snapshots','population','planning'];
const safeRead = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const git = (...args) => { try { return execFileSync('git', args, {encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim(); } catch { return null; } };
export function saveReceipt(path, receipt) {
  mkdirSync(dirname(path), {recursive:true});
  writeFileSync(path + '.tmp', JSON.stringify(receipt, null, 2) + '\n');
  renameSync(path + '.tmp', path);
}
export function createReceipt(now = new Date().toISOString()) {
  return {schemaVersion:1, startedAt:now, finishedAt:null, sourceCommit:git('rev-parse','HEAD'),
    canonicalUrl, writer:process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local-canonical',
    buildId:null, workerVersion:null, previousDeployment:null, deployment:'not-attempted',
    codeVerification:'not-run', dataStatus:'unverified', releaseAccepted:false, outcome:'in-progress', requiredStages:[...REQUIRED_RELEASE_STAGES], stages:[],
    rollback:{eligibility:'unverified', reasonCode:'previous-deployment-not-checked', automatic:false,
      limitations:['Worker rollback does not restore D1 or R2 contents.', 'Previous code, bindings and asset URLs require compatibility review.']}};
}
export function applyStage(receipt, stage, {output='', gateResult=null} = {}) {
  if (stage.id === 'previous-deployment') {
    if (stage.status === 'passed') {
      try {
        const deployments = JSON.parse(output);
        const current = Array.isArray(deployments) ? deployments.at(-1) : null;
        if (current && Array.isArray(current.versions) && current.versions.length) {
          receipt.previousDeployment = {id:current.id || null, createdOn:current.created_on || null,
            versions:current.versions.map(v => ({versionId:v.version_id, percentage:v.percentage}))};
          receipt.rollback.reasonCode = 'compatibility-review-required';
          receipt.rollback.eligibility = 'candidate-recorded';
        } else receipt.rollback.reasonCode = 'deployment-response-unrecognized';
      } catch { receipt.rollback.reasonCode = 'deployment-response-invalid'; }
    } else receipt.rollback.reasonCode = 'previous-deployment-unavailable';
  }
  if (stage.id === 'stamp') receipt.buildId = safeRead('src/build-id.ts').match(/BUILD_ID\s*=\s*"([^"]+)"/)?.[1] || null;
  if (stage.id === 'deploy') {
    receipt.deployment = stage.status === 'passed' ? 'deployed' : 'failed-or-unknown';
    receipt.workerVersion = output.match(/Current Version ID:\s*([a-f\d-]{36})/i)?.[1] || null;
  }
  if (stage.id === 'live-bytes') receipt.codeVerification = stage.status === 'passed' ? 'passed' : 'failed';
  if (stage.id === 'satellite') {
    const valid = gateResult && ['ok','degraded','failed'].includes(gateResult.status) &&
      (gateResult.reasonCode === null || typeof gateResult.reasonCode === 'string') &&
      (gateResult.coverage === null || Number.isFinite(gateResult.coverage) && gateResult.coverage >= 0 && gateResult.coverage <= 1) && Array.isArray(gateResult.quietLayers);
    if (!valid || (gateResult.status === 'failed' && stage.exitCode === 0) || (gateResult.status === 'ok' && stage.exitCode !== 0)) {
      stage.status = 'failed'; stage.exitCode ||= 1;
      stage.reasonCode = valid ? 'gate-result-exit-contradiction' : 'gate-result-missing-or-invalid';
      receipt.dataStatus = 'unverified';
    } else {
      receipt.dataStatus = gateResult.status;
      receipt.satellite = {status:gateResult.status, reasonCode:gateResult.reasonCode ?? null,
        coverage:gateResult.coverage ?? null, quietLayers:gateResult.quietLayers ?? []};
    }
  }
  return stage.exitCode;
}
export function finalizeReceipt(receipt, exitCode, now = new Date().toISOString()) {
  receipt.finishedAt = now;
  const running = receipt.stages.filter(s => s.status === 'running');
  for (const stage of running) { stage.status = 'interrupted'; stage.reasonCode = 'release-interrupted'; }
  const failures = receipt.stages.filter(s => (s.required || REQUIRED_RELEASE_STAGES.includes(s.id)) && (s.status !== 'passed' || s.exitCode !== 0));
  receipt.failedStages = failures.map(stage => stage.id);
  const ids = receipt.stages.map(stage => stage.id);
  receipt.missingStages = REQUIRED_RELEASE_STAGES.filter(id => !ids.includes(id));
  receipt.duplicateStages = ids.filter((id,index) => ids.indexOf(id) !== index);
  receipt.releaseAccepted = exitCode === 0 && !running.length && !failures.length && !receipt.missingStages.length && !receipt.duplicateStages.length &&
    receipt.deployment === 'deployed' && receipt.codeVerification === 'passed' && ['ok','degraded'].includes(receipt.dataStatus);
  if (receipt.deployment === 'deployed') {
    receipt.outcome = receipt.releaseAccepted
      ? receipt.dataStatus === 'ok' ? 'deployed-and-verified' : 'deployed-with-degraded-data'
      : receipt.codeVerification === 'passed' && receipt.dataStatus === 'degraded' && !receipt.missingStages.length && !receipt.duplicateStages.length && failures.length && failures.every(s => s.id === 'satellite')
        ? 'deployed-data-health-gate-failed' : 'deployed-verification-failed';
  } else receipt.outcome = receipt.deployment === 'not-attempted' ? 'not-deployed' : 'deployment-failed-or-unknown';
  receipt.exitCode = exitCode === 0 && !receipt.releaseAccepted ? 1 : exitCode;
  return receipt;
}

/** Fixed argument arrays only; never shell-evaluate a command or interpolate credentials. */
export async function runStage(receiptPath, id, kind, required, command, args, {timeoutMs=180000} = {}) {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const logPath = join(dirname(receiptPath), `${id}.log`);
  const stage = {id, kind, required, status:'running', startedAt:new Date().toISOString(), finishedAt:null, exitCode:null, log:logPath};
  receipt.stages.push(stage); saveReceipt(receiptPath, receipt);
  console.log(`==> ${id}`);
  // A crashing verifier must not inherit a prior run's typed result.
  if (id === 'satellite' && process.env.DHAKA_GATE_RESULT_PATH) writeFileSync(process.env.DHAKA_GATE_RESULT_PATH, JSON.stringify({status:'pending'}));
  const log = createWriteStream(logPath);
  let output = '', stdout = '', timer, killTimer, timedOut = false, interrupted = false;
  const child = spawn(command, args, {stdio:['ignore','pipe','pipe'], detached:process.platform !== 'win32'});
  const kill = signal => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); } catch {} };
  const stop = () => { kill('SIGTERM'); killTimer ||= setTimeout(() => kill('SIGKILL'), 2000); };
  const onSignal = () => { interrupted = true; stop(); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const write = (data, destination) => { output = (output + data).slice(-1048576); log.write(data); destination.write(data); };
  child.stdout.on('data', data => { stdout = (stdout + data).slice(-1048576); write(data, process.stdout); }); child.stderr.on('data', data => write(data, process.stderr));
  const code = await new Promise(resolveCode => {
    child.once('error', error => { write(Buffer.from(String(error) + '\n'), process.stderr); resolveCode(1); });
    child.once('close', code => resolveCode(timedOut ? 124 : interrupted ? 130 : code ?? 1));
    timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  });
  clearTimeout(timer); clearTimeout(killTimer); process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  await new Promise((resolveLog, rejectLog) => { log.once('error', rejectLog); log.end(resolveLog); });
  stage.exitCode = code; stage.status = code === 0 ? 'passed' : 'failed'; stage.finishedAt = new Date().toISOString();
  if (timedOut || interrupted) stage.reasonCode = timedOut ? 'stage-timeout' : 'release-interrupted';
  let gateResult = null;
  if (id === 'satellite') { try { gateResult = JSON.parse(safeRead(process.env.DHAKA_GATE_RESULT_PATH)); } catch {} }
  applyStage(receipt, stage, {output:id === 'previous-deployment' ? stdout : output, gateResult}); saveReceipt(receiptPath, receipt);
  return stage.exitCode;
}

export function assertWriterIdle({env=process.env, readRuns=() => execFileSync('gh', ['run','list','--workflow','deploy.yml','--event','workflow_dispatch','--limit','100','--json','event,status,databaseId'], {encoding:'utf8', timeout:15000, stdio:['ignore','pipe','pipe']})} = {}) {
  if (env.GITHUB_ACTIONS === 'true') {
    if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw Error('Production release is allowed only from an explicit manual workflow, not push validation.');
    return;
  }
  let runs;
  try { runs = JSON.parse(readRuns()); if (!Array.isArray(runs)) throw Error('invalid run response'); }
  catch { throw Error('Cannot verify the manual CI release writer is idle. Inspect GitHub Actions/authentication before deploying.'); }
  const active = runs.find(r => r.event === 'workflow_dispatch' && ['queued','in_progress','requested','waiting','pending'].includes(r.status));
  if (active) throw Error(`Manual CI workflow ${active.databaseId} is active; wait before running a local production release.`);
}

async function cli() {
  const [operation, path, ...args] = process.argv.slice(2);
  if (operation === 'writer-check') { assertWriterIdle(); return; }
  if (operation === 'init') { saveReceipt(resolve(path), createReceipt()); return; }
  if (operation === 'stage') {
    const [id, kind, required, command, ...commandArgs] = args;
    const timeoutMs = id === 'deploy' || id === 'live-bytes' ? 600000 : 180000;
    process.exitCode = await runStage(path, id, kind, required === 'required', command, commandArgs, {timeoutMs}); return;
  }
  if (operation === 'refuse') {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    receipt.stages.push({id:args[0],kind:'coordination',required:true,status:'failed',exitCode:1,reasonCode:args[1],startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()});
    saveReceipt(path, finalizeReceipt(receipt, 1)); process.exitCode = 1; return;
  }
  if (operation === 'finish') {
    const receipt = finalizeReceipt(JSON.parse(readFileSync(path, 'utf8')), Number(args[0]));
    saveReceipt(path, receipt); console.log(`Release outcome: ${receipt.outcome}; receipt: ${path}`); process.exitCode = receipt.exitCode; return;
  }
  if (operation === 'summary') {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    console.log(`### Dhaka release: ${receipt.outcome}\n\nBuild: ${receipt.buildId || 'not stamped'}\n\nRelease accepted: ${receipt.releaseAccepted}; code bytes: ${receipt.codeVerification}; data: ${receipt.dataStatus}.\n\nFailed required stages: ${receipt.stages.filter(s => (s.required || REQUIRED_RELEASE_STAGES.includes(s.id)) && (s.status !== 'passed' || s.exitCode !== 0)).map(s => s.id).join(', ') || 'none'}.\n\nMissing stages: ${receipt.missingStages?.join(', ') || 'none'}.\n\nThe receipt does not claim that Worker rollback restores D1/R2 data.`); return;
  }
  throw Error('Unknown release receipt operation');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli().catch(error => { console.error(error.message); process.exitCode = 1; });
