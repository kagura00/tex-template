#!/usr/bin/env bash
set -euo pipefail
# ディレクトリ FD と O_NOFOLLOW により検査後の symlink 差替えも防ぐ。
exec /usr/bin/python3 -I - "$@" <<'PY'
import os
import sys

if len(sys.argv) != 2:
    raise SystemExit('error: exactly one workspace path is required')
workspace = os.path.normpath(sys.argv[1])
if workspace != '/workspace' and not workspace.startswith('/workspaces/'):
    raise SystemExit('error: unsupported workspace path')
uid, gid = int(os.environ['SUDO_UID']), int(os.environ['SUDO_GID'])
flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
fd = os.open('/', flags)
try:
    for part in workspace.strip('/').split('/'):
        next_fd = os.open(part, flags, dir_fd=fd)
        os.close(fd)
        fd = next_fd
    for name in ('aux', 'out'):
        try:
            os.mkdir(name, 0o775, dir_fd=fd)
        except FileExistsError:
            pass
        output_fd = os.open(name, flags, dir_fd=fd)
        try:
            os.fchown(output_fd, uid, gid)
            os.fchmod(output_fd, 0o775)
        finally:
            os.close(output_fd)
finally:
    os.close(fd)
PY
