'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const shell=fs.readFileSync(path.join(root,'scripts/aerosuite-backup-encrypted.sh'),'utf8');
const yaml=fs.readFileSync(path.join(root,'.github/workflows/aerosuite-backup-manual.yml'),'utf8');
test('Respaldo es estrictamente manual, sin schedule ni ejecución automática',()=>{
 assert.match(yaml,/workflow_dispatch:/);
 assert.doesNotMatch(yaml,/\bschedule:|\bpush:|\bpull_request:/);
 assert.match(yaml,/inputs\.confirmation == 'COPIA-CIFRADA-MANUAL'/);
 assert.match(yaml,/permissions:\s+contents: read/);
});
test('Credenciales solo por secrets y sin valores visibles en el repositorio',()=>{
 for(const key of ['AEROSUITE_BACKUP_DB_URL','AEROSUITE_BACKUP_S3_ACCESS_KEY',
  'AEROSUITE_BACKUP_S3_SECRET_KEY','AEROSUITE_BACKUP_AGE_RECIPIENT']){
  assert.match(yaml,new RegExp('secrets\\.'+key));
 }
 assert.doesNotMatch(yaml,/password=|postgresql:\/\/postgres:[^$]/i);
 assert.match(shell,/set -euo pipefail/);
 assert.match(shell,/set \+x/);
 assert.match(shell,/umask 077/);
});
test('No se sube archivo sin cifrar, ni se imprime contenido ni se realizan restauraciones',()=>{
 assert.match(shell,/age -r "\$AEROSUITE_BACKUP_AGE_RECIPIENT"/);
 assert.match(shell,/aws --endpoint-url "\$AEROSUITE_BACKUP_S3_ENDPOINT" s3 cp/);
 assert.match(shell,/\$cipher" "s3:\/\/\$AEROSUITE_BACKUP_BUCKET/);
 assert.doesNotMatch(shell,/aws[^\n]*s3 cp[^\n]*\$archive/);
 assert.match(shell,/pg_restore --list/);
 assert.doesNotMatch(shell,/pg_restore --dbname|\bDROP DATABASE\b|\bTRUNCATE\b/i);
 assert.match(shell,/trap cleanup EXIT INT TERM/);
 assert.match(shell,/head-object/);
});
