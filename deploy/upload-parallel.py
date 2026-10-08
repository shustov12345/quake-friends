"""Upload the built tar in parallel, resumable SFTP chunks."""
import hashlib
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / 'runtime/deploy.tar'
KEY = ROOT / 'runtime/deploy_ed25519'
HOST = '201.34.158.52'
PARTS = '/root/quake-friends-parts'
CHUNK = 32 * 1024 * 1024
total = LOCAL.stat().st_size
count = math.ceil(total / CHUNK)
host_keys = Path.home() / '.ssh/known_hosts'

def connect():
    client = paramiko.SSHClient()
    client.load_host_keys(str(host_keys))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(HOST, username='root',
                   pkey=paramiko.Ed25519Key.from_private_key_file(str(KEY)),
                   look_for_keys=False, allow_agent=False, timeout=25,
                   auth_timeout=25)
    return client

client = connect()
stdin, stdout, stderr = client.exec_command(f'mkdir -p {PARTS}')
if stdout.channel.recv_exit_status():
    raise SystemExit(stderr.read().decode())
client.close()

def upload(index):
    offset = index * CHUNK
    expected = min(CHUNK, total - offset)
    remote = f'{PARTS}/part-{index:03d}'
    client = connect()
    try:
        sftp = paramiko.SFTPClient.from_transport(
            client.get_transport(), window_size=32*1024*1024,
            max_packet_size=64*1024)
        try:
            current = sftp.stat(remote).st_size
        except FileNotFoundError:
            current = 0
        if current > expected:
            raise RuntimeError(f'Invalid remote part {index}')
        if current == expected:
            return index, expected
        with LOCAL.open('rb') as source, sftp.file(remote, 'r+b' if current else 'wb') as target:
            source.seek(offset + current)
            target.seek(current)
            target.set_pipelined(True)
            remaining = expected - current
            while remaining:
                block = source.read(min(64*1024, remaining))
                if not block:
                    raise RuntimeError('Local archive truncated')
                target.write(block)
                remaining -= len(block)
        if sftp.stat(remote).st_size != expected:
            raise RuntimeError(f'Part {index} size mismatch')
        sftp.close()
        return index, expected
    finally:
        client.close()

started = time.monotonic()
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(upload, i) for i in range(count)]
    for future in as_completed(futures):
        index, size = future.result()
        print(f'Uploaded part {index+1}/{count} ({size/1048576:.1f} MiB); '
              f'{time.monotonic()-started:.0f}s elapsed', flush=True)

digest = hashlib.file_digest(LOCAL.open('rb'), 'sha256').hexdigest()
names = ' '.join(f'{PARTS}/part-{i:03d}' for i in range(count))
client = connect()
try:
    cmd = f'cat {names} > /root/quake-friends-deploy.tar.tmp && sha256sum /root/quake-friends-deploy.tar.tmp'
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    remote_output = stdout.read().decode().strip()
    if stdout.channel.recv_exit_status() or remote_output.split()[0] != digest:
        raise RuntimeError('Remote archive SHA-256 mismatch: '+remote_output+' '+stderr.read().decode())
    stdin, stdout, stderr = client.exec_command(
        f'mv /root/quake-friends-deploy.tar.tmp /root/quake-friends-deploy.tar && rm -f {names} && rmdir {PARTS}')
    if stdout.channel.recv_exit_status():
        raise RuntimeError(stderr.read().decode())
    print('Verified SHA-256 and assembled remote archive', flush=True)
finally:
    client.close()
