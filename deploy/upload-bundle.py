"""Resume the deployment archive upload over an authenticated SFTP channel."""
import time
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / 'runtime/deploy.tar'
REMOTE = '/root/quake-friends-deploy.tar'
HOST = '201.34.158.52'
key = paramiko.Ed25519Key.from_private_key_file(str(ROOT / 'runtime/deploy_ed25519'))
client = paramiko.SSHClient()
client.load_host_keys(str(Path.home() / '.ssh/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect(HOST, username='root', pkey=key, look_for_keys=False,
               allow_agent=False, timeout=20, auth_timeout=20)
transport = client.get_transport()
sftp = paramiko.SFTPClient.from_transport(transport, window_size=32*1024*1024,
                                         max_packet_size=64*1024)
total = LOCAL.stat().st_size
try:
    start = sftp.stat(REMOTE).st_size
except FileNotFoundError:
    start = 0
if start > total:
    raise SystemExit('Remote file is larger than local bundle')
print(f'Resuming at {start/1048576:.1f} / {total/1048576:.1f} MiB', flush=True)
t0 = time.monotonic()
with LOCAL.open('rb') as source, sftp.file(REMOTE, 'r+b' if start else 'wb') as target:
    source.seek(start)
    target.seek(start)
    target.set_pipelined(True)
    sent = start
    next_report = start + 8*1024*1024
    while block := source.read(64*1024):
        target.write(block)
        sent += len(block)
        if sent >= next_report:
            elapsed = max(time.monotonic()-t0,0.1)
            print(f'{sent/1048576:.1f} / {total/1048576:.1f} MiB '
                  f'({(sent-start)/1048576/elapsed:.2f} MiB/s)', flush=True)
            next_report += 8*1024*1024
if sftp.stat(REMOTE).st_size != total:
    raise SystemExit('Upload size mismatch')
print('Upload complete', flush=True)
sftp.close()
client.close()
