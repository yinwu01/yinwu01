'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('./renderer.js');
const A=require('./animation.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'calendar.json'),'utf8'));
const key=p=>`${p.column},${p.row}`;
const valid=new Set(data.weeks.flatMap((w,c)=>w.contributionDays.map(d=>`${c},${d.weekday}`)));

for(const word of ['HELLO','WORLD','INTERNSHIP','HIRE ME','HIRE ME ！Plz','GIVE ME JOB','AI','OPENAI','2026','SNAKE','A','B','M','W','8','!']) {
  test(`${word}: snake is adjacent, never self-collides, eats every pixel exactly once`,()=>{
    const scene=A.planScene(data,word);
    assert.equal(Object.keys(scene.eatenStep).length,scene.mask.pixels.length);
    for(let i=0;i<scene.frames.length;i++) {
      const frame=scene.frames[i];
      assert.equal(new Set(frame.map(key)).size,frame.length);
      assert(frame.every(p=>valid.has(key(p))||(i>scene.allEatenStep&&p.row>=7)));
      for(let s=1;s<frame.length;s++)assert.equal(Math.abs(frame[s].column-frame[s-1].column)+Math.abs(frame[s].row-frame[s-1].row),1);
      if(i>0){
        const prev=scene.frames[i-1];
        assert.equal(Math.abs(frame[0].column-prev[0].column)+Math.abs(frame[0].row-prev[0].row),1);
        assert.deepEqual(frame.slice(1),prev.slice(0,-1));
      }
    }
    for(const pixel of scene.mask.pixels)assert.equal(key(scene.frames[scene.eatenStep[key(pixel)]][0]),key(pixel));
    const last=scene.frames[scene.allEatenStep][0];
    scene.frames.slice(scene.allEatenStep+1).forEach((frame,i)=>{
      assert.equal(frame[0].column,last.column);
      assert.equal(frame[0].row,last.row+i+1);
    });
    assert(scene.frames.at(-1).every(p=>p.row>=7));
  });
}
test('scenes reveal completely before eating, and never overlap',()=>{
  const timeline=A.buildTimeline(data);
  assert.equal(timeline.scenes.length,2);
  assert.equal(timeline.scenes[0].word,'HELLO');assert.equal(timeline.scenes[1].word,'WORLD');
  assert(timeline.scenes[0].end<=timeline.scenes[1].start);
  for(const scene of timeline.scenes){assert(scene.revealEnd<scene.eatStart);assert(scene.allEatenAt<scene.end);}
  assert.equal(A.phaseAt(timeline,1),A.phaseAt(timeline,timeline.duration+1));
});
test('animated output leaves the real contribution layer byte-for-byte unchanged',()=>{
  const before=JSON.stringify(data), base=R.renderSVG(data,{text:'',overlay:false}), {svg}=A.renderAnimatedSVG(data);
  const layer=s=>s.match(/<g id="contributions">([\s\S]*?)<\/g>/)[1];
  assert.equal(layer(base),layer(svg));assert.equal(JSON.stringify(data),before);
});
test('animated letters and static fallback share real contribution-based colors',()=>{
  const {svg}=A.renderAnimatedSVG(data),days=new Map(data.weeks.flatMap(w=>w.contributionDays).map(day=>[day.date,day]));
  const colors=new Set();let count=0;
  for(const [rect] of svg.matchAll(/<rect\b[^>]*data-letter-date="[^"]+"[^>]*>/g)){
    const date=rect.match(/data-letter-date="([^"]+)"/)[1],level=Number(rect.match(/data-letter-level="(\d)"/)[1]);
    const color=rect.match(/fill="([^"]+)"/)[1];
    assert.equal(R.LEVELS[level],days.get(date).contributionLevel);
    assert.equal(color,R.letterColor(level));colors.add(color);count++;
  }
  assert(count>100);assert.equal(colors.size,5);
});
test('internship fits one scene and stays fully readable for three seconds',()=>{
  const {svg,timeline}=A.renderAnimatedSVG(data,{words:['INTERNSHIP']});
  assert.equal(timeline.scenes.length,1);
  const scene=timeline.scenes[0];assert.equal(scene.mask.width,50);
  assert(Math.abs(scene.eatStart-scene.revealEnd-3)<1e-9);
  assert(!svg.includes('LOOKING FOR AN'));
  assert(svg.includes(`${data.totalContributions.toLocaleString('en-US')} contributions in the last year`));
  const base=s=>s.match(/<g id="contributions">([\s\S]*?)<\/g>/)[1];
  assert.equal(base(svg),base(R.renderSVG(data,{text:'',overlay:false})));
  assert(!svg.includes('HELLO'));
});
test('HIRE ME holds for three seconds without the removed internship heading',()=>{
  const {svg,timeline}=A.renderAnimatedSVG(data,{words:['HIRE ME']});
  assert.equal(timeline.scenes.length,1);
  const scene=timeline.scenes[0];assert(scene.mask.width<=51);
  assert(Math.abs(scene.eatStart-scene.revealEnd-3)<1e-9);
  assert(!svg.includes('LOOKING FOR AN'));
  assert(!svg.includes('INTERNSHIP'));
  const base=s=>s.match(/<g id="contributions">([\s\S]*?)<\/g>/)[1];
  assert.equal(base(svg),base(R.renderSVG(data,{text:'',overlay:false})));
  assert(svg.includes('prefers-reduced-motion:reduce'));
  assert.equal(A.buildTimeline(data,{words:[' HIRE   ME ']}).duration,timeline.duration);
});
test('new phrase preserves all characters, three-second hold and identical routes in both themes',()=>{
  const light=A.renderAnimatedSVG(data,{words:['HIRE ME ！Plz'],theme:'light'});
  const dark=A.renderAnimatedSVG(data,{words:['HIRE ME !Plz'],theme:'dark'});
  assert.deepEqual(light.timeline,dark.timeline);
  const scene=light.timeline.scenes[0];
  assert.equal(scene.word,'HIRE ME !Plz');assert.equal(scene.mask.width,49);
  assert.equal(scene.mask.compactSpaces,true);
  assert(Math.abs(scene.eatStart-scene.revealEnd-3)<1e-9);
  for(const [theme,{svg}] of [['light',light],['dark',dark]]){
    const base=s=>s.match(/<g id="contributions">([\s\S]*?)<\/g>/)[1];
    assert.equal(base(svg),base(R.renderSVG(data,{text:'',overlay:false,theme})));
    assert(!svg.includes('INTERNSHIP'));assert(!svg.includes('LOOKING FOR'));
    assert(svg.includes(`fill="${R.getTheme(theme).background}"`));
    const letterColors=new Set();
    for(const [rect] of svg.matchAll(/<rect\b[^>]*data-letter-date="[^"]+"[^>]*>/g)){
      const level=Number(rect.match(/data-letter-level="(\d)"/)[1]);
      const color=rect.match(/fill="([^"]+)"/)[1];
      assert.equal(color,R.letterColor(level,undefined,theme));letterColors.add(color);
    }
    // A layout change can move off the only date in a particular contribution
    // quartile. Match the actual occupied dates rather than inventing a shade.
    const occupiedLevels=new Set(scene.mask.pixels.map(p=>data.weeks[p.column].contributionDays.find(d=>d.weekday===p.row).contributionLevel));
    assert.equal(letterColors.size,occupiedLevels.size);
    assert(svg.includes(`fill="${R.getTheme(theme).snake[0]}"`));
    assert(svg.includes('prefers-reduced-motion:reduce'));
    assert(!/<script|onload=|href=|https?:\/\/(?!www.w3.org)/.test(svg));
    assert(Buffer.byteLength(svg)<1024*1024);
  }
});
test('standalone SVG is script-free, bounded in size and has reduced-motion fallback',()=>{
  const {svg}=A.renderAnimatedSVG(data);
  assert(!/<script|onload=|href=|https?:\/\/(?!www.w3.org)/.test(svg));
  assert(svg.includes('@keyframes'));assert(svg.includes('prefers-reduced-motion:reduce'));assert(svg.includes('data-duration='));
  assert(svg.includes('<clipPath'));assert(svg.includes('height="109"'));
  assert(Buffer.byteLength(svg)<1024*1024);
});
test('animation validates empty, excessive and overflowing scene inputs',()=>{
  assert.throws(()=>A.buildTimeline(data,{words:[]}));assert.throws(()=>A.buildTimeline(data,{words:['']}));
  assert.throws(()=>A.buildTimeline(data,{words:['HELLO WORLD']}),/请缩短文字/);
  assert.throws(()=>A.buildTimeline(data,{words:Array(7).fill('A')}));
  assert.throws(()=>A.buildTimeline(data,{stepSeconds:0}));
  assert.throws(()=>A.buildTimeline(data,{speed:0}));
  assert.throws(()=>A.buildTimeline(data,{speed:NaN}));
});
test('1.5x speed scales every phase while preserving routes and food timing',()=>{
  const normal=A.buildTimeline(data,{speed:1}),fast=A.buildTimeline(data);
  assert(fast.duration<14.64);
  assert(Math.abs(normal.duration/fast.duration-1.5)<1e-8);
  assert.equal(fast.stepSeconds,0.04/1.5);
  assert(fast.exitStepSeconds<fast.stepSeconds);
  for(let i=0;i<normal.scenes.length;i++){
    assert.deepEqual(normal.scenes[i].frames,fast.scenes[i].frames);
    assert.deepEqual(normal.scenes[i].eatenStep,fast.scenes[i].eatenStep);
    for(const field of ['start','revealStart','revealEnd','eatStart','allEatenAt','exitAt','end'])
      assert(Math.abs(normal.scenes[i][field]/1.5-fast.scenes[i][field])<1e-8);
  }
});
test('reading hold grows to 3 seconds while snake alone gets 50 percent faster',()=>{
  const words=['HIRE ME !Plz'];
  const previous=A.buildTimeline(data,{words,stepSeconds:0.06,holdSeconds:2});
  const current=A.buildTimeline(data,{words});
  const before=previous.scenes[0],after=current.scenes[0];
  assert.equal(after.revealStart,before.revealStart);
  assert.equal(after.revealEnd,before.revealEnd);
  assert(Math.abs(after.eatStart-after.revealEnd-3)<1e-9);
  assert(Math.abs(previous.stepSeconds/current.stepSeconds-1.5)<1e-9);
  assert(Math.abs(previous.exitStepSeconds/current.exitStepSeconds-1.5)<1e-9);
  assert(Math.abs((before.allEatenAt-before.eatStart)/(after.allEatenAt-after.eatStart)-1.5)<1e-9);
  assert.deepEqual(after.frames,before.frames);
  assert.deepEqual(after.eatenStep,before.eatenStep);
  assert.deepEqual(after.mask,before.mask);
  assert.equal(A.phaseAt(current,after.eatStart-0.01),'HIRE ME !Plz · 停留阅读');
  assert.equal(A.phaseAt(current,after.eatStart+0.01),'HIRE ME !Plz · 蛇在吃字');
});
