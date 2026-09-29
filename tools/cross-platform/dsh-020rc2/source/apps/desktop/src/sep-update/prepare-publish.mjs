import {executePreparedPlan} from './prepare-offline.mjs';
const [mode,operator]=process.argv.slice(2);
executePreparedPlan(mode,operator).then(r=>console.log(JSON.stringify({status:r.status??'prepared',planHash:r.planHash??r.hash}))).catch(e=>{console.error(String(e.code??e.message).slice(0,160));process.exitCode=1;});
