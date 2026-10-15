"""Record real archive member lengths without extracting or running a package."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(r'D:\AIData\ProjectWork\DSH\alpha2-windows-packages-20261015-r1')
archives = json.loads((root/'ARCHIVES.json').read_text())['archives']
failed_member = 'payload/node_modules/@deepseek-ai/dsh-experimental-inspector/lib/devtools/models/issues_manager/descriptions/CoepCoopSandboxedIframeCannotNavigateToCoopPage.md'
rows = []
for archive in archives:
    with zipfile.ZipFile(archive['path']) as z:
        names = [x.filename for x in z.infolist() if not x.is_dir()]
        longest = max(names, key=len)
        destination = root/'fresh-install-verification-r1/unpacked'/archive['kind']
        rows.append({'kind': archive['kind'], 'archiveSha256': archive['sha256'],
                     'regularFiles': len(names), 'longestMember': longest,
                     'longestMemberCharacters': len(longest),
                     'longestOriginalDestinationCharacters': len(str(destination.joinpath(*longest.split('/')))),
                     'pathsAbove259Characters': sum(len(str(destination.joinpath(*name.split('/')))) > 259 for name in names)})
failed_path = root/'fresh-install-verification-r1/unpacked/full'/failed_member
logs = {}
for relative in ['fresh-install-verification-r1/RESULT.json', 'fresh-install-verification-r1/extract-full.stderr.log', 'verification-longpath-red/raw.log', 'verification-longpath-green/raw.log']:
    body = (root/relative).read_bytes()
    logs[relative] = {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
result = {'schema': 1, 'status': 'pass', 'scope': 'Validation-tool long-path diagnosis and direct ZIP regression; not package installation acceptance.',
          'originalFailure': {'phase': 'extract-full', 'member': failed_member, 'absolutePath': str(failed_path), 'characters': len(str(failed_path)), 'installationStarted': False},
          'archives': rows, 'regression': {'definitions': 31, 'pass': 30, 'fail': 0, 'blocked': 1, 'blockedReason': 'Unchanged junction fixture command received Windows WinError 225; not bypassed or substituted.'},
          'boundaries': ['Extended path syntax is applied to validated filesystem I/O; member validation and parent reparse/realpath checks remain required.', 'Normal Windows Explorer or another ZIP client is not certified by this extractor result.', 'Actual Node installer long paths still require real archive installation validation.'], 'logs': logs}
output = root/'verification-longpath-green/AUDIT.json'
with output.open('x', encoding='utf8', newline='\n') as stream:
    json.dump(result, stream, indent=2, ensure_ascii=False)
    stream.write('\n')
print(json.dumps({'status': 'pass', 'path': str(output), 'failedCharacters': len(str(failed_path)), 'archives': rows}))
