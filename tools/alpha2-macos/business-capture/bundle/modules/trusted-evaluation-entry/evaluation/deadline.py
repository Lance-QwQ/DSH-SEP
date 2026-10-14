"""Root-owned deadline action. No ledger writes; never infer an execution result."""
import sys
import docker

def retire(container_id,owner,job,project,image):
    client=docker.from_env(timeout=5)
    try:
        try: c=client.containers.get(container_id)
        except docker.errors.NotFound: return 0
        labels=c.attrs['Config'].get('Labels') or {}
        if c.id!=container_id or c.attrs['Image']!=image or any(labels.get(k)!=v for k,v in [('dsh.sep.owner',owner),('dsh.sep.job',job),('dsh.sep.project',project)]):
            print('DEADLINE_OWNERSHIP_REFUSED');return 0
        try:c.remove(force=True)
        except docker.errors.NotFound:pass
        print('DEADLINE_RETIRED');return 0
    finally:client.close()

if __name__=='__main__':raise SystemExit(retire(*sys.argv[1:]))
