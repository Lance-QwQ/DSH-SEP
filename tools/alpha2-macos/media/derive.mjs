import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=x=>createHash('sha256').update(x).digest('hex'),base=new URL('../apfs-tree/',import.meta.url);
const preflight=`/* Check metadata quotas before emitting any body. This is not an authority
 * snapshot: the regular capture and final verification still recheck every row. */
static void preflight(int dir,unsigned depth,dev_t device,size_t *entries,uint64_t *bytes) {
 checked(depth<=DEPTH_LIMIT,"SEP_PROJECT_LIMIT");struct stat before,after;getstat(dir,&before);
 checked(S_ISDIR(before.st_mode)&&before.st_uid==geteuid()&&before.st_dev==device&&(before.st_mode&077)==0,"SEP_PROJECT_UNSAFE_TREE");
 size_t count;char **children=names(dir,&count);
 for(size_t i=0;i<count;i++) {
  checked(++*entries<=ENTRY_LIMIT,"SEP_PROJECT_LIMIT");struct stat st,opened;
  checked(fstatat(dir,children[i],&st,AT_SYMLINK_NOFOLLOW)==0,"SEP_PROJECT_TREE_CHANGED");
  checked(st.st_uid==geteuid()&&st.st_ino&&st.st_dev==device&&(st.st_mode&077)==0&&(S_ISREG(st.st_mode)||S_ISDIR(st.st_mode)),"SEP_PROJECT_UNSAFE_TREE");
  if(S_ISDIR(st.st_mode)) {
   int fd=openat(dir,children[i],O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);checked(fd>=0,"SEP_PROJECT_TREE_CHANGED");getstat(fd,&opened);checked(version(&st,&opened),"SEP_PROJECT_TREE_CHANGED");
   preflight(fd,depth+1,device,entries,bytes);close(fd);
   checked(fstatat(dir,children[i],&opened,AT_SYMLINK_NOFOLLOW)==0&&version(&st,&opened),"SEP_PROJECT_TREE_CHANGED");
  } else {
   checked(st.st_nlink==1,"SEP_PROJECT_UNSAFE_TREE");checked(st.st_size>=0&&st.st_size<=FILE_LIMIT&&*bytes+(uint64_t)st.st_size<=BYTE_LIMIT,"SEP_PROJECT_LIMIT");*bytes+=(uint64_t)st.st_size;
  }
 }
 for(size_t i=0;i<count;i++)free(children[i]);
 free(children);getstat(dir,&after);checked(version(&before,&after),"SEP_PROJECT_TREE_CHANGED");
}
`;
const definitions=[
 {source:'native-tree.c',target:'native-attachments.c',sha256:'9429bdb42aaa60dbfa432040bd52f64acb57c1bd721dddf50e0630a4b8c6564e',changes:[
  ['#define ENTRY_LIMIT 1024','#define ENTRY_LIMIT 2000'],['#define FILE_LIMIT 4194304','#define FILE_LIMIT 20971520'],['#define BYTE_LIMIT 33554432','#define BYTE_LIMIT 268435456'],
  ['S_ISDIR(before.st_mode)&&before.st_uid==geteuid()&&before.st_dev==device','S_ISDIR(before.st_mode)&&before.st_uid==geteuid()&&before.st_dev==device&&(before.st_mode&077)==0'],
  ['st.st_uid==geteuid()&&st.st_ino&&st.st_dev==device&&(S_ISREG(st.st_mode)||S_ISDIR(st.st_mode))','st.st_uid==geteuid()&&st.st_ino&&st.st_dev==device&&(st.st_mode&077)==0&&(S_ISREG(st.st_mode)||S_ISDIR(st.st_mode))'],
  ['(void)write(2,m,sizeof(m)-1);','ssize_t ignored=write(2,m,sizeof(m)-1);(void)ignored;'],
  ['static void put_row(Snapshot *snapshot',preflight+'static void put_row(Snapshot *snapshot'],
  ['size_t index=0;walk(source,dest,"",0,&source_snapshot,0,&index,source_device);','size_t measured_entries=0;uint64_t measured_bytes=0;preflight(source,0,source_device,&measured_entries,&measured_bytes);root_still_bound(source,argv[2]);\n size_t index=0;walk(source,dest,"",0,&source_snapshot,0,&index,source_device);'],
 ]},
 {source:'project-tree.mjs',target:'attachment-tree.mjs',sha256:'bc56d55d93cd9bcb67beb544153a49f012aa453ba4fc35d2e9caa1fed5f0d6cd',changes:[
  ['entries:1024,bytes:33554432,file:4194304,depth:16','entries:2000,bytes:268435456,file:20971520,depth:16'],
  ['export function createProjectTree(','export function createAttachmentTree('],
  ['let bytes=0,prepared=false;','let bytes=0,prepared=false,rootIdentity;'],
  ["prepared=true;versions.push(['',row.rootVersion]);","prepared=true;rootIdentity=row.rootVersion.split(':').slice(0,2).join(':');versions.push(['',row.rootVersion]);"],
  ["entries.push({path,kind:'directory'});","entries.push({path,kind:'directory',version:row.version});"],
  ["entries.push({path,kind:'file',size:row.size,sha256:hash(Buffer.from(row.dataHex,'hex')),executable:row.executable});","entries.push({path,kind:'file',version:row.version,size:row.size,sha256:hash(Buffer.from(row.dataHex,'hex')),executable:row.executable});"],
  ['public:{sha256:hash(JSON.stringify(entries)),version:hash(JSON.stringify(versions)),entries,bytes}','public:{rootIdentity,sha256:hash(JSON.stringify(entries)),version:hash(JSON.stringify(versions)),entries,bytes}'],
  ["!['path','expectedSha256','text','delete'].includes(k)","!['path','expectedSha256','expectedVersion','expectedRootIdentity','text','delete'].includes(k)"],
  ['const {path,expectedSha256,text}=options,remove=options.delete===true;','const {path,expectedSha256,expectedVersion,expectedRootIdentity,text}=options,remove=options.delete===true;'],
  ["const version=entry?before.observed.get(path):'absent',child=await session(","if(before.public.rootIdentity!==expectedRootIdentity||(entry?.version??'absent')!==expectedVersion)fail('SEP_PROJECT_STALE_FILE');\n  const version=entry?before.observed.get(path):'absent',child=await session("],
 ]},
];
const records=[];
for(const item of definitions){const bytes=await readFile(new URL(item.source,base));assert.equal(hash(bytes),item.sha256);let source=bytes.toString('utf8');for(const [from,to]of item.changes){assert.equal(source.split(from).length,2,from);source=source.replace(from,to);}const count=source.split('SEP_PROJECT_').length-1;source=source.replaceAll('SEP_PROJECT_','SEP_ATTACHMENT_');await writeFile(new URL(item.target,import.meta.url),source);records.push({...item,replaceAll:{from:'SEP_PROJECT_',to:'SEP_ATTACHMENT_',count},resultSha256:hash(source)});}
await writeFile(new URL('origin.json',import.meta.url),JSON.stringify({schema:1,scope:'independent attachment limits and private-domain inventory; original project implementation unchanged',derivations:records},null,2)+'\n');
