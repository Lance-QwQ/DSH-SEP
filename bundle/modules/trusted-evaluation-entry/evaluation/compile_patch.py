import ast,difflib
def compile_patch(answer,files):
 if not isinstance(answer,dict) or set(answer)!= {'edits'} or not isinstance(answer['edits'],list) or not 1<=len(answer['edits'])<=16:raise ValueError('EDIT_SCHEMA')
 changed=dict(files)
 for edit in answer['edits']:
  if not isinstance(edit,dict) or set(edit)!= {'path','old','new'} or any(not isinstance(v,str) for v in edit.values()):raise ValueError('EDIT_SCHEMA')
  path,old,new=edit['path'],edit['old'],edit['new']
  if path not in files or not old or old==new or changed[path].count(old)!=1 or len(old)+len(new)>65536:raise ValueError('EDIT_SCOPE_OR_MATCH')
  changed[path]=changed[path].replace(old,new,1)
 chunks=[]
 for path in files:
  if changed[path]==files[path]:continue
  if not changed[path].endswith('\n') or not files[path].endswith('\n'):raise ValueError('FINAL_NEWLINE')
  if path.endswith('.py'):ast.parse(changed[path])
  chunks.append('diff --git a/'+path+' b/'+path+'\n'+''.join(difflib.unified_diff(files[path].splitlines(keepends=True),changed[path].splitlines(keepends=True),fromfile='a/'+path,tofile='b/'+path)))
 patch=''.join(chunks)
 if not patch or len(patch.encode())>262144:raise ValueError('PATCH_LIMIT')
 return patch
