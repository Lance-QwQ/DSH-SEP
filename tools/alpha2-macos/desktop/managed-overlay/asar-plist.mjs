import {createHash} from 'node:crypto';
export const headerHash=header=>createHash('sha256').update(header).digest('hex');
export function updateAsarPlist(plist,oldHeader,newHeader){
 if(plist.CFBundleIdentifier!=='ai.dshsep.alpha2.preview')throw Error('SEP_MAC_BUNDLE_ID');
 const result=structuredClone(plist),map=result.ElectronAsarIntegrity??{};
 if(!map||typeof map!=='object'||Array.isArray(map))throw Error('SEP_MAC_ASAR_PLIST');
 const prior=map['Resources/app.asar'];if(prior!==undefined&&(prior.algorithm!=='SHA256'||prior.hash!==headerHash(oldHeader)))throw Error('SEP_MAC_ASAR_PLIST_ORIGIN');
 map['Resources/app.asar']={algorithm:'SHA256',hash:headerHash(newHeader)};result.ElectronAsarIntegrity=map;return result;
}
