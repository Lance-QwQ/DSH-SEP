"""Bounded, per-call stdio MCP transport, executed inside the same sandbox.
Only the two correlated JSON-RPC responses are returned. This carrier has no
network, provider cache, host paths or credential access. Its parent enforces
the overall deadline and kills the whole private PID namespace on cancellation.
"""
import json, subprocess, sys
server, request = json.loads(sys.argv[1]), json.loads(sys.argv[2])
p = subprocess.Popen(server, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
def call(value, expected):
    p.stdin.write(json.dumps(value) + '\n')
    p.stdin.flush()
    line = p.stdout.readline(32769)
    if len(line) > 32768:
        raise ValueError('MCP_RESPONSE_LIMIT')
    reply = json.loads(line)
    if reply.get('jsonrpc') != '2.0' or reply.get('id') != expected or 'error' in reply:
        raise ValueError('MCP_RESPONSE_INVALID')
    return reply
failure = None
try:
    init = call({'jsonrpc':'2.0','id':0,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'dsh-sep-linux','version':'experimental.1'}}}, 0)
    if init.get('result', {}).get('protocolVersion') != '2024-11-05':
        raise ValueError('MCP_VERSION_UNSUPPORTED')
    p.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'}) + '\n')
    p.stdin.flush()
    result = call({'jsonrpc':'2.0','id':1,'method':'tools/call','params':request}, 1)
    p.stdin.close()
    p.wait(timeout=.5)
    if p.returncode:
        raise ValueError('MCP_EXIT')
except subprocess.TimeoutExpired:
    failure = 'MCP_EXIT_DEADLINE'
except (ValueError, BrokenPipeError) as error:
    failure = str(error) if str(error) in ('MCP_RESPONSE_LIMIT','MCP_RESPONSE_INVALID','MCP_VERSION_UNSUPPORTED','MCP_EXIT') else 'MCP_PROTOCOL_FAILED'
finally:
    if p.poll() is None:
        p.kill()
        try:
            p.wait(timeout=.5)
        except subprocess.TimeoutExpired:
            failure = 'MCP_CLEANUP_UNCONFIRMED'
if failure:
    print(json.dumps({'status':'blocked','code':failure}), file=sys.stderr)
    sys.exit(1)
print(json.dumps(init))
print(json.dumps(result))
