export function verifyTap(text,expected){
 const stats={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const matches=[...text.matchAll(new RegExp('^# '+key+' ([0-9]+)\\r?$','gm'))];if(matches.length!==1)throw Object.assign(Error('SEP_NATIVE_TEST_COUNTS'),{code:'SEP_NATIVE_TEST_COUNTS'});stats[key]=Number(matches[0][1]);}
 if(stats.tests!==expected||stats.pass!==expected||stats.fail||stats.cancelled||stats.skipped||stats.todo)throw Object.assign(Error('SEP_NATIVE_TEST_COUNTS'),{code:'SEP_NATIVE_TEST_COUNTS'});return stats;
}
