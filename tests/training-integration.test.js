'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verify}=require('../scripts/check-training-integration.cjs');
test('full static HELP toolkit and publisher artwork remain available',verify);
test('consolidated toolkit has no retired external-clone dependencies',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const root=path.resolve(__dirname,'..');
 assert.equal(fs.existsSync(path.join(root,'scripts/vendor-help-toolkit.sh')),false);
 assert.equal(fs.existsSync(path.join(root,'.github/workflows/vendor-help-toolkit.yml')),false);
 assert.match(fs.readFileSync(path.join(root,'training/SOURCE.md'),'utf8'),
  /maintained, fully local source/);
});
