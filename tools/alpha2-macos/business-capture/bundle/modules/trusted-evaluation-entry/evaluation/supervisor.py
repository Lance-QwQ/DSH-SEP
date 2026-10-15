"""Linux-only, trusted Docker supervisor. Not a model-facing Docker API.

Systemd enforces an independent deadline once armed before container start.
Recovery finalizes the ledger after supervisor restart; it never replays jobs.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import time
import subprocess
import sys
import uuid
import docker

class Supervisor:
    def __init__(self, directory, image, commands, official=False):
        if not re.fullmatch(r'sha256:[0-9a-f]{64}',image): raise ValueError('IMAGE')
        self.image=image
        self.official=official is True
        self.commands={}
        for key,argv in commands.items():
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',key) or not isinstance(argv,(list,tuple)) or not argv or len(argv)>64 or any(not isinstance(x,str) or '\0' in x for x in argv) or not argv[0].startswith('/') or len(json.dumps(argv))>16384: raise ValueError('COMMAND_CONFIG')
            self.commands[key]=tuple(argv)
        if not self.commands or len(self.commands)>32: raise ValueError('COMMAND_CONFIG')
        self.root=Path(directory)
        if self.root.is_symlink(): raise ValueError('STATE_PATH')
        self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        if self.root.stat().st_uid!=os.getuid() or self.root.stat().st_mode&0o077: raise ValueError('STATE_PERMISSIONS')
        self.jobs=self.root/'jobs';self.jobs.mkdir(mode=0o700,exist_ok=True)
        if self.jobs.is_symlink(): raise ValueError('STATE_PATH')
        self.client=docker.from_env(timeout=10)
        with self._lock():
            ownerfile=self.root/'owner.json'
            if not ownerfile.exists():
                if list(self.jobs.iterdir()): raise ValueError('OWNER_MISSING')
                self._write(ownerfile,{'owner':uuid.uuid4().hex})
            owner=self._read(ownerfile).get('owner')
            if not isinstance(owner,str) or not re.fullmatch('[0-9a-f]{32}',owner): raise ValueError('OWNER_CORRUPT')
            self.owner=owner

    def close(self): self.client.close()

    @contextmanager
    def _lock(self):
        fd=os.open(self.root/'lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)

    def _write(self,path,value):
        temporary=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
        try:
            fd=os.open(temporary,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w') as stream:
                json.dump(value,stream,sort_keys=True);stream.flush();os.fsync(stream.fileno())
            os.replace(temporary,path)
            fd=os.open(path.parent,os.O_DIRECTORY)
            try: os.fsync(fd)
            finally: os.close(fd)
        finally:
            if temporary.exists(): temporary.unlink()

    def _read(self,path,missing='STATE_CORRUPT'):
        try:
            if path.is_symlink() or path.stat().st_size>65536: raise ValueError()
            value=json.loads(path.read_text())
            if not isinstance(value,dict): raise ValueError()
            return value
        except FileNotFoundError as exc: raise ValueError(missing if path.parent.is_dir() and not path.parent.is_symlink() else 'STATE_CORRUPT') from exc
        except (OSError,ValueError) as exc: raise ValueError('STATE_CORRUPT') from exc

    def _path(self,job):
        if not isinstance(job,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',job): raise ValueError('JOB_ID')
        return self.jobs/(job+'.json')

    def _load(self,job,project=None):
        r=self._read(self._path(job),missing='JOB_NOT_FOUND')
        if r.get('jobId')!=job or r.get('owner')!=self.owner or r.get('phase') not in ('prepared','creating','running','retiring','terminal') or not isinstance(r.get('projectId'),str) or not isinstance(r.get('deadline'),(int,float)) or r.get('containerName')!=self._name(job) or not re.fullmatch(r'sha256:[0-9a-f]{64}',r.get('image','')): raise ValueError('STATE_CORRUPT')
        if project is not None and r['projectId']!=project: raise ValueError('SCOPE')
        return r

    def _name(self,job): return 'sep-task-'+hashlib.sha256((self.owner+':'+job).encode()).hexdigest()[:40]
    def _save(self,r): self._write(self._path(r['jobId']),r)

    def _owned(self,r):
        try: container=self.client.containers.get(r['containerName'])
        except docker.errors.NotFound: return None
        labels=container.attrs['Config'].get('Labels') or {}
        if labels.get('dsh.sep.owner')!=self.owner or labels.get('dsh.sep.job')!=r['jobId'] or labels.get('dsh.sep.project')!=r['projectId'] or container.attrs['Image']!=r['image'] or (r.get('containerId') and container.id!=r['containerId']): raise ValueError('OWNERSHIP')
        return container

    def _retire(self,r,outcome,exit_code=None):
        container=self._owned(r)  # Verify before writing retirement intent.
        if r['phase']!='retiring':
            r.update(phase='retiring',outcome=outcome,exitCode=exit_code);self._save(r)
        if container:
            try:container.remove(force=True)
            except docker.errors.NotFound:pass
        if self._owned(r) is not None: raise ValueError('RETIREMENT_UNCONFIRMED')
        if r.get('deadlineUnit'):
            subprocess.run(['systemctl','stop',r['deadlineUnit']+'.timer'],check=False,capture_output=True,timeout=10)
        r.update(phase='terminal',retiredAt=time.time());self._save(r)
        return r

    def _arm(self,r):
        unit='sep-rex-deadline-'+uuid.uuid4().hex
        r['deadlineUnit']=unit;self._save(r)
        remaining=max(.1,r['deadline']-time.time())
        subprocess.run(['systemd-run','--quiet','--collect','--unit='+unit,'--on-active='+str(remaining)+'s',
            '--timer-property=AccuracySec=100ms','--property=Restart=on-failure','--property=RestartSec=1s','--property=StartLimitIntervalSec=0',
            sys.executable,str(Path(__file__).with_name('deadline.py')),r['containerId'],self.owner,r['jobId'],r['projectId'],self.image],
            check=True,capture_output=True,timeout=10)
        subprocess.run(['systemctl','is-active','--quiet',unit+'.timer'],check=True,capture_output=True,timeout=5)

    def submit(self,project,job,command,timeout=30,binding=None):
        path=self._path(job)
        if not isinstance(project,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',project): raise ValueError('PROJECT_ID')
        if command not in self.commands: raise ValueError('COMMAND')
        if type(timeout) is not int or not 1<=timeout<=300: raise ValueError('TIMEOUT')
        vector=[self.image,self.commands[command],timeout]
        if binding is not None:vector.extend([binding,self.official])
        fingerprint=hashlib.sha256(json.dumps(vector,sort_keys=True).encode()).hexdigest()
        with self._lock():
            if path.exists():
                r=self._load(job,project)
                if r.get('fingerprint')!=fingerprint: raise ValueError('CONFLICT')
                return r  # No create/start on duplicate, including unknown outcomes.
            records=[self._load(p.stem) for p in self.jobs.glob('*.json')]
            if any(r['phase']!='terminal' for r in records): raise ValueError('BUSY')
            self.client.images.get(self.image)  # Never pull an unapproved image.
            r={'owner':self.owner,'projectId':project,'jobId':job,'image':self.image,'fingerprint':fingerprint,'containerName':self._name(job),'containerId':None,'phase':'prepared','deadline':time.time()+timeout,'createdAt':time.time()}
            if binding is not None:r['artifactBinding']=binding
            self._save(r)
            r['phase']='creating';self._save(r)
            container=self.client.containers.create(self.image,list(self.commands[command]),name=r['containerName'],
                labels={'dsh.sep.owner':self.owner,'dsh.sep.job':job,'dsh.sep.project':project},
                network_mode='none',mem_limit='2g' if self.official else '256m',nano_cpus=2_000_000_000 if self.official else 1_000_000_000,pids_limit=256 if self.official else 64,
                cap_drop=['ALL'],security_opt=['no-new-privileges'],read_only=not self.official,
                user='0:0' if self.official else '65534:65534',tmpfs={} if self.official else {'/tmp':'rw,noexec,nosuid,size=16m'},
                log_config=docker.types.LogConfig(type='none'),restart_policy={'Name':'no'},
                stdin_open=False,tty=False)
            r['containerId']=container.id;self._save(r)
            self._arm(r)  # Refuse to start if the independent deadline is not armed.
            container.start()
            r['phase']='running';self._save(r)
            return r

    def poll(self,project,job):
        with self._lock():
            r=self._load(job,project)
            if r['phase']=='terminal': return r
            if r['phase']=='retiring': return self._retire(r,r['outcome'],r.get('exitCode'))
            c=self._owned(r)
            if c is None or r['phase']!='running': return self._retire(r,'unknown')
            state=c.attrs['State']
            if state['Status']=='exited': return self._retire(r,'completed',state['ExitCode'])
            if time.time()>=r['deadline']: return self._retire(r,'timed_out')
            return r

    def cancel(self,project,job):
        with self._lock():
            r=self._load(job,project)
            if r['phase']=='terminal': return r
            return self._retire(r,'cancelled')

    def recover(self):
        with self._lock():
            # Validate the complete ledger before touching any container.
            records=[self._load(p.stem) for p in sorted(self.jobs.glob('*.json'))]
            for r in records:
                if r['phase']!='terminal': self._owned(r)
            return [self._retire(r,'unknown') if r['phase']!='terminal' else r for r in records]
