import {createHash} from 'node:crypto';
import {createWorkflow, transition, verifyReceipts} from '../src/nexus/hive_workflow.mjs';
const at = new Date().toISOString();
const content = '# Nexus\nAi agents and Social media Automation \n';
const id = 'hive-readme-fixture-v1';
let state = createWorkflow({version:'1', id, question:'What does the pinned Nexus README say?',created_at:at,
  action:'research_only',budget:{max_events:8,max_attempts:3,max_seconds:60,max_cost_usd:0}});
const inputs = [
  ['fixture-hunter','evidence',{sources:[{id:'readme',url:'https://github.com/valdesalex369/Nexus/blob/4ef9c0d92418386b2d98dafb36ff9d0a7bb70ba4/README.md',
    accessed_at:at,content,sha256:createHash('sha256').update(content).digest('hex')}],
    claim:'The pinned README describes AI agents and social media automation.',kind:'reported_fact',source_ids:['readme']}],
  ['fixture-sparta','review',{verdict:'pass',notes:'SYNTHETIC fixture review: text supports this narrow description.'}],
  ['fixture-nova','outside_eye',{verdict:'pass',notes:'SYNTHETIC outside-eye: README does not prove a running integration.'}],
];
for (const [principal,type,payload] of inputs) state = transition(state,{version:'1',id:type,job_id:id,type,payload},{principal,now:at});
console.log(JSON.stringify({mode:'OFFLINE_FIXTURE',agents_contacted:[],independent_review:false,
  source_note:'Pinned README text supplied by the connected assistant; no fetch occurs in this script.',
  receipts_verified:verifyReceipts(state.receipts),state},null,2));
