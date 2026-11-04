'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {FONT, LEVELS, textMask, renderSVG, dimColor, letterColor, validateData} = require('./renderer.js');

function fixture() {
  const start = new Date('2025-09-28T00:00:00Z');
  return {username:'TEST',source:'demo',totalContributions:0,weeks:Array.from({length:53},(_,col)=>({contributionDays:Array.from({length:7},(_,row)=>({
    date:new Date(+start+(col*7+row)*86400000).toISOString().slice(0,10),weekday:row,contributionCount:0,contributionLevel:'NONE'
  }))}))};
}
test('every glyph is rectangular and exactly 5 rows high',()=>{
  for(const rows of Object.values(FONT)){assert.equal(rows.length,5);assert(rows.every(row=>row.length===rows[0].length&&/^[01]+$/.test(row)));}
});
test('GIVE ME JOB fits within 53 weeks with one column margin',()=>{
  const mask=textMask('GIVE ME JOB',53);assert.equal(mask.width,51);
  assert(mask.pixels.length>70);assert(mask.pixels.every(p=>p.column>=1&&p.column<=51&&p.row>=1&&p.row<=5));
});
test('unsupported and overflowing text fail explicitly',()=>{
  assert.throws(()=>textMask('你好',53),/暂不支持/);assert.throws(()=>textMask('M'.repeat(20),53),/请缩短/);
  assert.equal(textMask('',53).pixels.length,0);assert.equal(textMask(' give   me job ',53).text,'give me job');
});
test('fullwidth punctuation and compact spaces fit the complete new phrase',()=>{
  const mask=textMask('HIRE ME ！Plz',53);
  assert.equal(mask.text,'HIRE ME !Plz');assert.equal(mask.width,49);assert(mask.compactSpaces);
  assert.deepEqual(mask,textMask('HIRE ME !Plz',53));
  assert.equal(mask.pixels.length,[...'HIRE ME !Plz'].reduce((n,c)=>n+FONT[c].join('').split('1').length-1,0));
  assert(mask.pixels.every(p=>p.column>=1&&p.column<=51&&p.row>=1&&p.row<=5));
  assert.equal(textMask('HIRE ME !Plz',52).width,49);
  assert.equal(textMask('GIVE ME JOB',53).compactSpaces,false);
});
test('light theme has five darker contribution shades with readable contrast',()=>{
  const colors=LEVELS.map((_,i)=>letterColor(i,undefined,'light'));
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
  assert.equal(new Set(colors).size,5);
  for(let i=1;i<colors.length;i++)assert(luminance(colors[i])<luminance(colors[i-1]));
  assert(1.05/(luminance(colors[0])+0.05)>3);
  assert.equal(dimColor('#216e39',0,'light'),'#ffffff');
  assert.equal(dimColor('#216e39',1,'light'),'#216e39');
  assert.throws(()=>renderSVG(fixture(),{theme:'unexpected'}));
  assert.throws(()=>letterColor(0,undefined,'unexpected'));
});
test('Plz keeps mixed case, a left-shifted exclamation and tight l-z spacing',()=>{
  const mask=textMask('HIRE ME !Plz',53), upper=textMask('HIRE ME !PLZ',53);
  assert.equal(mask.text,'HIRE ME !Plz');assert.equal(mask.width,49);
  const key=p=>`${p.column},${p.row}`, cells=new Set(mask.pixels.map(key));
  // Two columns right, then one column less at the HIRE / ME word gap.
  for(const row of [1,2,3,5])assert(cells.has(`35,${row}`));
  assert(!mask.pixels.some(p=>p.column===36));
  assert.deepEqual(mask.pixels.filter(p=>p.column<43),upper.pixels.filter(p=>p.column<43));
  assert(cells.has('38,1'));assert(cells.has('41,2'));
  assert(cells.has('43,1'));assert(cells.has('44,5')); // Short lowercase l foot.
  assert(!mask.pixels.some(p=>p.column===45)); // Exactly one blank column after the foot.
  assert(!mask.pixels.some(p=>p.column>=46&&p.row<2)); // Lowercase z is four rows high.
  for(const column of [46,47,48,49]){
    assert(cells.has(`${column},2`));assert(cells.has(`${column},5`));
  }
  assert.deepEqual(mask.pixels.filter(p=>p.column>=46&&[3,4].includes(p.row)),[
    {column:48,row:3},{column:47,row:4}
  ]);
  assert(!mask.pixels.some(p=>p.column>=50)); // The right edge remains inside the grid.
  assert.equal(cells.size,mask.pixels.length); // No glyph overlap after kerning.
  for(const char of 'abcdefghijklmnopqrstuvwxyz'){
    assert.equal(FONT[char][0].length,FONT[char.toUpperCase()][0].length);
    assert.notDeepEqual(FONT[char],FONT[char.toUpperCase()]);
  }
});
test('profile line moves right two columns and HIRE / ME has exactly two empty columns',()=>{
  const mask=textMask('HIRE ME !Plz',53),cells=new Set(mask.pixels.map(p=>`${p.column},${p.row}`));
  assert.equal(Math.min(...mask.pixels.map(p=>p.column)),3); // Previously column 1.
  assert.equal(Math.max(...mask.pixels.filter(p=>p.column<23).map(p=>p.column)),20);
  assert.equal(Math.min(...mask.pixels.filter(p=>p.column>20).map(p=>p.column)),23);
  assert(!mask.pixels.some(p=>p.column===21||p.column===22));
  // All HIRE pixels move by +2; changing the following space does not recenter it.
  let x=3;const expected=[];
  for(const c of 'HIRE'){
    FONT[c].forEach((row,y)=>[...row].forEach((bit,dx)=>{if(bit==='1')expected.push({column:x+dx,row:y+1});}));
    x+=FONT[c][0].length+1;
  }
  assert.deepEqual(mask.pixels.filter(p=>p.column<=20),expected);
  assert(cells.has('23,1'));assert(cells.has('32,5'));
  assert(cells.has('35,1'));assert(cells.has('38,1')); // ! and P move with the suffix.
});
test('letter and snake accents are muted slate blue while the contribution palette stays green',()=>{
  const {THEMES,PALETTE}=require('./renderer.js');
  assert.deepEqual(PALETTE,['#161b22','#0e4429','#006d32','#26a641','#39d353']);
  for(const theme of ['light','dark']){
    const colors=LEVELS.map((_,i)=>letterColor(i,undefined,theme));
    for(const color of [...colors,...THEMES[theme].snake]){
      const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
      assert(r<g&&g<b);assert(b-r<=50);
    }
  }
});
test('rendering never mutates source dates or counts',()=>{
  const data=fixture(),before=JSON.stringify(data);renderSVG(data);assert.equal(JSON.stringify(data),before);
});
test('zero-contribution days can contain letters without gaining contributions',()=>{
  const svg=renderSVG(fixture());assert(svg.includes('data-count="0"'));assert(svg.includes('id="letter-overlay"'));assert(svg.includes(`fill="${letterColor(0)}"`));
  assert.equal((svg.match(/data-date=/g)||[]).length,371);
});
test('turning off letters preserves the contribution layer exactly',()=>{
  const on=renderSVG(fixture()),off=renderSVG(fixture(),{overlay:false});
  const base=svg=>svg.match(/<g id="contributions">([\s\S]*?)<\/g>/)[1];
  assert.equal(base(on),base(off));assert.match(off,/<g id="letter-overlay"[^>]*><\/g>/);
});
test('partial weeks use weekday rather than array index; no padding dates are invented',()=>{
  const data=fixture();data.weeks[0].contributionDays=data.weeks[0].contributionDays.slice(3);
  const svg=renderSVG(data);assert.match(svg,/<rect x="54" y="131"[^>]*data-date="2025-10-01"/);
  assert.equal((svg.match(/data-date=/g)||[]).length,368);
});
test('invalid data and invalid styling fail',()=>{
  const data=fixture();data.weeks[0].contributionDays[0].weekday=1;assert.throws(()=>validateData(data));
  assert.throws(()=>renderSVG(fixture(),{brightness:NaN}));assert.throws(()=>renderSVG(fixture(),{highlight:'" onload="'}));
});
test('metadata is escaped and SVG contains no script or external resources',()=>{
  const data=fixture();data.username='<script>&"';const svg=renderSVG(data);
  assert(svg.includes('&lt;script&gt;&amp;&quot;'));assert(!/<script|onload=|href=/.test(svg));
});
test('intent emphasis escapes text and preserves un-emphasized headings',()=>{
  const svg=renderSVG(fixture(),{intent:'LOOKING FOR <intern>&',intentEmphasis:'<intern>'});
  assert.match(svg,/>LOOKING FOR <tspan font-weight="700">&lt;intern&gt;<\/tspan>&amp;<\/text>/);
  assert(!svg.includes('<intern>'));
  assert(!renderSVG(fixture(),{intent:'LOOKING FOR AN'}).includes('<tspan'));
  assert.throws(()=>renderSVG(fixture(),{intentEmphasis:7}));
});
test('brightness endpoints preserve original colors or hide them completely',()=>{
  assert.equal(dimColor('#39d353',0),'#0d1117');assert.equal(dimColor('#39d353',1),'#39d353');
});
test('all API contribution levels preserve their original metadata',()=>{
  const data=fixture();LEVELS.forEach((level,i)=>{data.weeks[0].contributionDays[i].contributionLevel=level;});
  const svg=renderSVG(data);for(let i=0;i<5;i++)assert(svg.includes(`data-level="${i}"`));
});
test('letter palette has five increasing shades and a visible zero-contribution floor',()=>{
  const colors=LEVELS.map((_,i)=>letterColor(i));
  assert.equal(new Set(colors).size,5);
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
  for(let i=1;i<colors.length;i++)assert(luminance(colors[i])>luminance(colors[i-1]));
  assert((luminance(colors[0])+0.05)/(luminance('#0d1117')+0.05)>3);
  assert.throws(()=>letterColor(-1));assert.throws(()=>letterColor(5));
});
test('static letters use the real date and level at each pixel, not random shading',()=>{
  const data=fixture(),mask=textMask('HELLO',53);
  mask.pixels.slice(0,5).forEach((p,i)=>{const day=data.weeks[p.column].contributionDays.find(day=>day.weekday===p.row);day.contributionLevel=LEVELS[i];day.contributionCount=i*3;});
  const svg=renderSVG(data,{text:'HELLO'});
  const letters=svg.match(/<g id="letter-overlay"[^>]*>([\s\S]*?)<\/g>/)[1];
  for(const rect of letters.matchAll(/<rect\b[^>]*>/g)){
    const date=rect[0].match(/data-letter-date="([^"]+)"/)[1],level=Number(rect[0].match(/data-letter-level="(\d)"/)[1]);
    const day=data.weeks.flatMap(w=>w.contributionDays).find(day=>day.date===date);
    assert.equal(LEVELS[level],day.contributionLevel);assert(rect[0].includes(`fill="${letterColor(level)}"`));
    assert(rect[0].includes(`data-letter-count="${day.contributionCount}"`));
  }
  assert.equal(renderSVG(data,{text:'HELLO'}),svg);
});
test('public calendar parser checks totals and maps public dates without timezone shifts',()=>{
  const {parsePublicCalendar}=require('./generate.cjs');
  const data=fixture();
  const cells=data.weeks.flatMap(w=>w.contributionDays).map((day,i)=>`<td data-date="${day.date}" id="day-${i}" data-level="0"></td><tool-tip for="day-${i}">No contributions on a day.</tool-tip>`).join('');
  const html='<h2 id="js-contribution-activity-description">0 contributions in the last year</h2>'+cells;
  const parsed=parsePublicCalendar(html,'TEST');assert.equal(parsed.weeks.length,53);assert.equal(parsed.totalContributions,0);
  assert.equal(parsed.weeks[0].contributionDays[0].date,'2025-09-28');
  assert.throws(()=>parsePublicCalendar(html.replace('>0 contributions','>3 contributions'),'TEST'),/不一致/);
  assert.throws(()=>parsePublicCalendar('<html>unexpected page</html>','TEST'),/日期数量异常/);
});
