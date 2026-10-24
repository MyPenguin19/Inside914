"""Replay every application migration in a NEW local-only DB; never reset existing data.
Uses the installed native Supabase Auth/Storage schema (no rows) as the supported baseline.
The new database is retained for inspection; explicit cleanup is a separate action.
"""
import os
import re
import subprocess
import time
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
runtime = repo.parent / 'supabase-runtime'
psql = next((runtime / 'cache').glob('**/bin/psql')).resolve()
pg_dump = psql.parent / 'pg_dump'
name = 'phase615d_replay_' + str(int(time.time()))
assert re.fullmatch(r'phase615d_replay_[0-9]+', name)
env = {**os.environ, 'PGHOST': '127.0.0.1', 'PGPORT': '54322', 'PGUSER': 'postgres',
       'PGPASSWORD': 'postgres', 'PGDATABASE': 'postgres'}
def run(args, sql=None):
    return subprocess.run(args, input=sql, text=True, env=env, check=True, capture_output=True).stdout

bootstrap = run([str(pg_dump), '--schema-only', '--no-owner', '--no-acl', '--schema=auth', '--schema=storage'])
run([str(psql), '-X', '-v', 'ON_ERROR_STOP=1', '-c', f'create database {name} template template0;'])
print('Created isolated replay database:', name, flush=True)
env['PGDATABASE'] = name
try:
    run([str(psql), '-X', '-v', 'ON_ERROR_STOP=1'], '''
create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema public,extensions to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to postgres,anon,authenticated,service_role;
alter default privileges in schema public grant all on functions to postgres,anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to postgres,anon,authenticated,service_role;
''' + bootstrap)
    for migration in sorted((repo / 'supabase/migrations').glob('*.sql')):
        run([str(psql), '-X', '-v', 'ON_ERROR_STOP=1', '-1', '-f', str(migration)])
        print('PASS', migration.name, flush=True)
    print(run([str(psql), '-X', '-At', '-c', "select 'application_tables='||count(*) from pg_tables where schemaname='public'; select 'customer_rows='||count(*) from bookings; select 'rls_missing='||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;"]), flush=True)
except subprocess.CalledProcessError as error:
    # SQL/schema only: this process never loads application secrets or customer rows.
    print(error.stderr, flush=True)
    raise SystemExit(error.returncode)
