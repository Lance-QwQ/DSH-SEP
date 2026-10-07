/** User-selected release channels, independent of the installed channel. */
import semver from 'semver';
const minimumChannel={weak:0,medium:1,strong:2};

/** Validate a persisted or requested filtering strength.
 * @param {unknown} value Filtering preference.
 * @returns {'weak'|'medium'|'strong'} The validated preference.
 */
export function validateUpdateFilter(value){
 if(typeof value!=='string'||!Object.hasOwn(minimumChannel,value))throw Error('UPDATE_FILTER_INVALID');
 return value;
}

/** Only stable versions and alpha.N, beta.N or rc.N prereleases are eligible.
 * @param {string} version Release version from verified metadata.
 * @param {'weak'|'medium'|'strong'} strength Validated filtering preference.
 * @returns {boolean} Whether the version belongs to an allowed channel.
 */
export function allowsUpdateChannel(version,strength){
 validateUpdateFilter(strength);
 const parsed=typeof version==='string'?semver.parse(version):null;if(!parsed)return false;
 const pre=parsed.prerelease;if(!pre.length)return true;
 if(pre.length!==2||!Number.isSafeInteger(pre[1])||pre[1]<0)return false;
 const rank={alpha:0,beta:1,rc:2}[pre[0]];
 return typeof rank==='number'&&rank>=minimumChannel[strength];
}
