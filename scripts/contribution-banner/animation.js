/* Precompute a snake game, then compile the timeline to standalone SVG/CSS. */
(function (root) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./renderer.js') : root.ContributionBanner;
  const key = p => `${p.column},${p.row}`;
  const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

  function canDropStraight(body) {
    const probe=body.map(p=>({...p}));
    while(probe.some(p=>p.row<7)) {
      const next={column:probe[0].column,row:probe[0].row+1};
      if(probe.slice(0,-1).some(p=>key(p)===key(next))) return false;
      probe.unshift(next);probe.pop();
    }
    return true;
  }

  // Approach the final food from a posture that can turn straight down safely.
  // This avoids a last-second U-turn through the neck for glyphs such as ! or 8.
  function finishPath(body,target,valid) {
    const states=[{body,parent:-1}],seen=new Set([body.map(key).join(';')]);
    for(let i=0;i<states.length&&i<100000;i++) {
      const current=states[i].body,head=current[0];
      const direction={column:head.column-current[1].column,row:head.row-current[1].row};
      const directions=[...new Map([direction,{column:1,row:0},{column:0,row:-1},{column:0,row:1},{column:-1,row:0}].map(p=>[key(p),p])).values()];
      for(const d of directions) {
        const p={column:head.column+d.column,row:head.row+d.row};
        if(!valid.has(key(p))||current.slice(0,-1).some(q=>key(q)===key(p)))continue;
        const next=[p,...current.slice(0,-1)],id=next.map(key).join(';');
        if(key(p)===target) {
          if(!canDropStraight(next))continue;
          const route=[p];
          for(let j=i;states[j].parent!==-1;j=states[j].parent)route.push(states[j].body[0]);
          return route.reverse();
        }
        if(seen.has(id))continue;
        seen.add(id);states.push({body:next,parent:i});
      }
    }
    throw new Error('最后一格暂未找到向下离场路线，请调整文字。');
  }

  function nextStep(body, targets, valid) {
    const head = body[0], tail = body[body.length - 1];
    // The tail leaves its cell on the next tick, so that cell is traversable.
    const blocked = new Set(body.slice(0, -1).map(key));
    const direction = {column:head.column-body[1].column,row:head.row-body[1].row};
    const candidates = [direction, {column:1,row:0}, {column:0,row:-1}, {column:0,row:1}, {column:-1,row:0}];
    const directions = [...new Map(candidates.map(p=>[key(p),p])).values()];
    const queue = [{point:head,first:null}], visited = new Set([key(head)]);
    for (let i=0;i<queue.length;i++) {
      const {point,first}=queue[i];
      for (const d of directions) {
        const p={column:point.column+d.column,row:point.row+d.row}, id=key(p);
        if (!valid.has(id)||blocked.has(id)||visited.has(id)) continue;
        const step=first||p;
        if (targets.has(id)) return step;
        visited.add(id);queue.push({point:p,first:step});
      }
    }
    // A moving tail can open a route to food isolated by the current body.
    if (!targets.has(key(tail))) return nextStep(body,new Set([key(tail)]),valid);
    throw new Error('蛇的路线暂时受阻，请调整文字。');
  }

  function planScene(data, word) {
    R.validateData(data);
    const mask=R.textMask(word,data.weeks.length);
    if (!mask.pixels.length) throw new Error('每一幕至少需要一个可见字符。');
    const valid=new Set(data.weeks.flatMap((w,c)=>w.contributionDays.map(d=>`${c},${d.weekday}`)));
    if (mask.pixels.some(p=>!valid.has(key(p)))) throw new Error('文字落在日期网格以外，请缩短文字。');
    const body=Array.from({length:6},(_,i)=>({column:6-i,row:6}));
    if (body.some(p=>!valid.has(key(p)))) throw new Error('贡献图左侧需要至少 7 个完整星期。');
    const food=new Set(mask.pixels.map(key)), eatenStep={}, frames=[body.map(p=>({...p}))];
    const move=target=>{
      body.unshift(target);body.pop();
      frames.push(body.map(p=>({...p})));
      if(food.delete(key(target))) eatenStep[key(target)]=frames.length-1;
    };
    while(food.size) {
      if(frames.length>4000) throw new Error('路线规划超过长度上限，请缩短文字。');
      if(food.size===1){for(const step of finishPath(body,[...food][0],valid))move(step);break;}
      move(nextStep(body,food,valid));
    }
    const allEatenStep=frames.length-1;
    // Immediately dive down in the last food's column until even the tail is out.
    while(body.some(p=>p.row<7))move({column:body[0].column,row:body[0].row+1});
    return {word:mask.text,mask,frames,eatenStep,allEatenStep};
  }

  function buildTimeline(data, options={}) {
    const {words=['HELLO','WORLD'],stepSeconds=0.04,speed=1.5}=options;
    if(!Array.isArray(words)||words.length<1||words.length>6) throw new Error('请设置 1–6 幕文字，以 / 分隔。');
    if(!Number.isFinite(stepSeconds)||stepSeconds<0.025||stepSeconds>0.3) throw new Error('移动间隔应为 0.025–0.3 秒。');
    if(!Number.isFinite(speed)||speed<0.25||speed>4) throw new Error('速度应为 0.25–4 倍。');
    const recruiting=words.length===1&&typeof words[0]==='string'&&['INTERNSHIP','HIRE ME','HIRE ME !PLZ'].includes(R.normalizeText(words[0]).toUpperCase());
    const holdSeconds=options.holdSeconds??(recruiting?3:null);
    if(holdSeconds!==null&&(!Number.isFinite(holdSeconds)||holdSeconds<0||holdSeconds>10))throw new Error('阅读停留应为 0–10 秒。');
    const exitStepSeconds=stepSeconds*0.6;
    let cursor=0;
    const scenes=words.map(word=>{
      if(typeof word!=='string') throw new Error('文字应为字符串。');
      const scene=planScene(data,word);
      scene.start=cursor;
      scene.revealStart=cursor+0.25;
      scene.revealEnd=cursor+1.45;
      // Explicit reading holds are wall-clock seconds, independent of snake speed.
      scene.eatStart=scene.revealEnd+(holdSeconds===null?1.1:holdSeconds*speed);
      scene.allEatenAt=scene.eatStart+scene.allEatenStep*stepSeconds;
      scene.exitAt=scene.allEatenAt+(scene.frames.length-1-scene.allEatenStep)*exitStepSeconds;
      scene.end=scene.exitAt+0.75;
      cursor=scene.end;
      return scene;
    });
    // Scale every phase together, keeping food removal synchronized with the head.
    for(const scene of scenes)for(const field of ['start','revealStart','revealEnd','eatStart','allEatenAt','exitAt','end'])scene[field]/=speed;
    return {scenes,duration:cursor/speed,stepSeconds:stepSeconds/speed,exitStepSeconds:exitStepSeconds/speed,speed};
  }

  function phaseAt(timeline, seconds) {
    const t=((seconds%timeline.duration)+timeline.duration)%timeline.duration;
    const scene=timeline.scenes.find(s=>t<s.end)||timeline.scenes[0];
    const phase=t<scene.revealEnd?'逐渐浮现':t<scene.eatStart?'停留阅读':t<scene.allEatenAt?'蛇在吃字':t<scene.exitAt?'向下冲出':'下一幕';
    return `${scene.word} · ${phase}`;
  }

  function renderAnimatedSVG(data,options={}) {
    const {brightness=0.22,theme='dark',intent='',intentEmphasis=''}=options;
    const colors=R.getTheme(theme), highlight=options.highlight??colors.highlight;
    const timeline=buildTimeline(data,options), {duration,stepSeconds,exitStepSeconds,speed}=timeline;
    const frameTime=(scene,i)=>i<=scene.allEatenStep?scene.eatStart+i*stepSeconds:scene.allEatenAt+(i-scene.allEatenStep)*exitStepSeconds;
    let hash=2166136261;
    for(const char of JSON.stringify([timeline.scenes.map(s=>s.word),duration,data.weeks.length,theme])) hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
    const ns=`sa${hash.toString(16)}`;
    const percent=t=>(Math.min(duration,Math.max(0,t))/duration*100).toFixed(6)+'%';
    const css=[],elements=[];
    const position=p=>`translate(${54+p.column*16}px,${83+p.row*16}px)`;
    function animate(name,property,points) {
      const id=`${ns}-${name}`;
      css.push(`@keyframes ${id}{${points.map(([t,v])=>`${percent(t)}{${property}:${v}}`).join('')}}`);
      css.push(`.${id}{animation:${id} ${duration.toFixed(4)}s linear infinite;}`);
      return id;
    }
    timeline.scenes.forEach((scene,s)=>{
      const minCol=Math.min(...scene.mask.pixels.map(p=>p.column));
      scene.mask.pixels.forEach((pixel,i)=>{
        const reveal=scene.revealStart+((pixel.column-minCol)/Math.max(1,scene.mask.width-1)*0.8+(pixel.row-1)*0.035)/speed;
        const eaten=scene.eatStart+scene.eatenStep[key(pixel)]*stepSeconds;
        const cls=animate(`food-${s}-${i}`,'opacity',[[0,0],[reveal,0],[reveal+0.18/speed,1],[eaten-0.001/speed,1],[eaten,0],[duration,0]]);
        const day=data.weeks[pixel.column].contributionDays.find(day=>day.weekday===pixel.row);
        const level=R.LEVELS.indexOf(day.contributionLevel);
        elements.push(`<rect class="${cls} food" data-scene="${s}" data-cell="${key(pixel)}" data-eaten-at="${eaten.toFixed(4)}" data-letter-date="${day.date}" data-letter-count="${day.contributionCount}" data-letter-level="${level}" x="${54+pixel.column*16}" y="${83+pixel.row*16}" width="13" height="13" rx="2" fill="${R.letterColor(level,highlight,theme)}" opacity="0"/>`);
      });
      const visibility=animate(`snake-visible-${s}`,'opacity',[[0,0],[scene.eatStart-0.18/speed,0],[scene.eatStart,1],[scene.exitAt,1],[scene.exitAt+0.001,0],[duration,0]]);
      const parts=[];
      // Tail first, head last. Each segment follows a previously occupied cell.
      for(let segment=5;segment>=0;segment--) {
        const track=[[0,position(scene.frames[0][segment])],...scene.frames.map((frame,i)=>[frameTime(scene,i),position(frame[segment])]),[duration,position(scene.frames.at(-1)[segment])]];
        const cls=animate(`body-${s}-${segment}`,'transform',track);
        parts.push(`<rect class="${cls} snake-segment" data-scene="${s}" data-segment="${segment}" x="0" y="0" width="13" height="13" rx="${segment===0?4:3}" fill="${colors.snake[segment]}"/>`);
      }
      // Eyes stay at the leading edge, including when the head turns.
      for(let eye=0;eye<2;eye++) {
        const at=frame=>{
          const [head,neck]=frame, dx=head.column-neck.column, dy=head.row-neck.row;
          const [x,y]=dx>0?[9,eye?9:2]:dx<0?[2,eye?9:2]:dy>0?[eye?9:2,9]:[eye?9:2,2];
          return `translate(${54+head.column*16+x}px,${83+head.row*16+y}px)`;
        };
        const cls=animate(`eye-${s}-${eye}`,'transform',[[0,at(scene.frames[0])],...scene.frames.map((frame,i)=>[frameTime(scene,i),at(frame)]),[duration,at(scene.frames.at(-1))]]);
        parts.push(`<rect class="${cls}" width="2" height="2" rx="0.5" fill="${colors.eyes}"/>`);
      }
      elements.push(`<g clip-path="url(#${ns}-grid-clip)"><g class="${visibility} snake" data-scene="${s}" opacity="0">${parts.join('')}</g></g>`);
    });
    let svg=R.renderSVG(data,{text:'',overlay:false,brightness,highlight,theme,intent,intentEmphasis});
    const fallback=R.renderSVG(data,{text:timeline.scenes[0].word,brightness,highlight,theme,intent,intentEmphasis}).match(/<g id="letter-overlay"[^>]*>([\s\S]*?)<\/g>/)[1];
    const style=`<style>${css.join('\n')}
.${ns}-still{display:none}
@media(prefers-reduced-motion:reduce){.${ns}-motion{display:none}.${ns}-motion *{animation:none!important}.${ns}-still{display:inline}}
</style>`;
    const clip=`<defs><clipPath id="${ns}-grid-clip" clipPathUnits="userSpaceOnUse"><rect x="54" y="83" width="${data.weeks.length*16-3}" height="109"/></clipPath></defs>`;
    const layers=`${style}${clip}<g id="letter-overlay" class="${ns}-motion" aria-hidden="true" pointer-events="none">${elements.join('\n')}</g><g class="${ns}-still" aria-hidden="true">${fallback}</g>`;
    svg=svg.replace(/<g id="letter-overlay"[^>]*><\/g>/,layers)
      .replace(/<title id="title">.*?<\/title>/,`<title id="title">${escapeXML(data.username)} — ${intent?escapeXML(intent)+' ':''}${timeline.scenes.map(s=>escapeXML(s.word)).join(' → ')} snake animation</title>`)
      .replace(/<desc id="description">.*?<\/desc>/,`<desc id="description">Words fade in with five ${theme}-theme shades matching the underlying dates' real contribution levels, then a snake eats only the decorative letter pixels. Zero-contribution letters retain a readable floor. The real contribution backdrop stays unchanged. ${timeline.duration.toFixed(1)} second loop. Reduced motion shows the first word. Data source: ${escapeXML(data.source)}.</desc>`)
      .replace('Dimmed contributions · bright text overlay','Real contributions stay · words come and go')
      .replace('<svg xmlns=',`<svg data-duration="${duration.toFixed(4)}" xmlns=`);
    return {svg,timeline};
  }

  const api={planScene,buildTimeline,phaseAt,renderAnimatedSVG};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.ContributionAnimation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
