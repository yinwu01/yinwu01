'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('CLI emits both theme images, light fallback and theme-aware README snippet',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'contribution-export-'));
  try {
    const result=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'generate.cjs'),'--input',path.join(__dirname,'calendar.json'),'--animated','--out',out],{encoding:'utf8'}));
    assert.deepEqual(result.variants,['light','dark']);
    const light=fs.readFileSync(path.join(out,'banner-animated-light.svg'),'utf8');
    const dark=fs.readFileSync(path.join(out,'banner-animated-dark.svg'),'utf8');
    assert.equal(fs.readFileSync(path.join(out,'banner-animated.svg'),'utf8'),light);
    assert(light.includes('fill="#ffffff"'));assert(dark.includes('fill="#0d1117"'));
    for(const svg of [light,dark]){
      assert(svg.includes('HIRE ME !Plz'));assert(!svg.includes('LOOKING FOR AN'));
      assert(!svg.includes('INTERNSHIP'));assert(svg.includes('@keyframes'));
    }
    const snippet=fs.readFileSync(path.join(out,'github-embed.md'),'utf8');
    assert(snippet.includes('media="(prefers-color-scheme: dark)" srcset="./banner-animated-dark.svg"'));
    assert(snippet.includes('media="(prefers-color-scheme: light)" srcset="./banner-animated-light.svg"'));
    const original=JSON.parse(fs.readFileSync(path.join(__dirname,'calendar.json'),'utf8'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'calendar.json'),'utf8')),original);
  } finally {fs.rmSync(out,{recursive:true,force:true});}
});
