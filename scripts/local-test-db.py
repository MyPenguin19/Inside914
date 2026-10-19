"""Run SQL only against the isolated local test database (never remote settings)."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
configured = os.environ.get('LOCAL_PSQL_PATH')
psql = configured or shutil.which('psql')
if not psql:
    runtime = Path(os.environ.get('SUPABASE_HOME', repo.parent / 'supabase-runtime'))
    candidates = list((runtime / 'cache').glob('**/bin/psql'))
    if candidates:
        psql = str(candidates[0].resolve())
if not psql:
    raise SystemExit('Install psql or set LOCAL_PSQL_PATH for the isolated local stack.')

# Connection values are fixed intentionally, even if the shell contains production envs.
env = {**os.environ, 'PGHOST': '127.0.0.1', 'PGPORT': '54322',
       'PGUSER': 'postgres', 'PGPASSWORD': 'postgres', 'PGDATABASE': 'postgres'}
raise SystemExit(subprocess.run([psql, '-X', '-v', 'ON_ERROR_STOP=1', *sys.argv[1:]], env=env).returncode)
