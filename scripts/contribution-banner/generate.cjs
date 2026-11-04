#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {parseArgs} = require('node:util');
const {renderSVG, validateData, LEVELS} = require('./renderer.js');
const {renderAnimatedSVG} = require('./animation.js');

// Default to the anonymous calendar so the backdrop matches the public profile,
// including GitHub's public-page day boundaries. No credential is sent here.
function parsePublicCalendar(html, username) {
  const tips = new Map([...html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g)]
    .map(([, attrs, label]) => [attrs.match(/\bfor="([^"]+)"/)?.[1], label.trim()]));
  const days = [...html.matchAll(/<td\b([^>]*data-date="[^"]+"[^>]*)>/g)].map(([, attrs]) => {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const date = attrs.match(/data-date="([^"]+)"/)?.[1];
    const level = Number(attrs.match(/data-level="([^"]+)"/)?.[1]);
    const label = tips.get(id) || '';
    const count = label.startsWith('No contributions') ? 0 : Number(label.match(/^([\d,]+) contributions?\b/)?.[1]?.replaceAll(',', ''));
    if (!date || !Number.isInteger(count) || !LEVELS[level]) throw new Error('公开贡献页字段发生变化；读取已停止。');
    return {date,weekday:new Date(date+'T00:00:00Z').getUTCDay(),contributionCount:count,contributionLevel:LEVELS[level]};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if (days.length < 350 || days.length > 371) throw new Error('公开贡献页的日期数量异常；读取已停止。');
  const heading = html.match(/<h2[^>]*id="js-contribution-activity-description"[^>]*>([\s\S]*?)<\/h2>/)?.[1];
  const total = Number(heading?.match(/([\d,]+)\s+contributions?/)?.[1]?.replaceAll(',',''));
  const dailyTotal = days.reduce((n,day)=>n+day.contributionCount,0);
  if (!Number.isInteger(total) || total !== dailyTotal) throw new Error('公开页总数与每日计数不一致；读取已停止。');
  const firstSunday = +new Date(days[0].date+'T00:00:00Z') - days[0].weekday*86400000;
  const weeks = [];
  for (const day of days) {
    const col = Math.floor((+new Date(day.date+'T00:00:00Z') - firstSunday)/604800000);
    while (weeks.length <= col) weeks.push({contributionDays:[]});
    weeks[col].contributionDays.push(day);
  }
  return validateData({username,source:'github-public-calendar',fetchedAt:new Date().toISOString(),totalContributions:total,weeks});
}

async function fetchPublicCalendar(username) {
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username)) throw new Error('GitHub 用户名格式错误。');
  const response = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
    headers:{'Accept-Language':'en-US'}, signal:AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`公开贡献页返回 HTTP ${response.status}`);
  return parsePublicCalendar(await response.text(), username);
}

// Read-only query: no repository names, commit messages, or code are retrieved.
const QUERY = `query($login: String!) {
  user(login: $login) {
    login
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date weekday contributionCount contributionLevel } }
      }
    }
  }
}`;

async function fetchCalendar(username) {
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username)) throw new Error('GitHub 用户名格式错误。');
  const payload = JSON.stringify({query: QUERY, variables: {login: username}});
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  let response;
  if (token) {
    const result = await fetch('https://api.github.com/graphql', {
      method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:payload, signal:AbortSignal.timeout(30000)
    });
    if (!result.ok) throw new Error(`GitHub API 返回 HTTP ${result.status}`);
    response = await result.json();
  } else {
    // gh handles its own keychain credentials; never extract or save the token.
    try {
      response = JSON.parse(execFileSync('gh', ['api', 'graphql', '--hostname', 'github.com', '--input', '-'], {
        input:payload, encoding:'utf8', timeout:40000, stdio:['pipe','pipe','pipe']
      }));
    } catch { throw new Error('读取 GitHub 数据失败。请检查网络和 gh auth status，或通过环境变量设置 GH_TOKEN。'); }
  }
  if (response.errors?.length) throw new Error(response.errors.map(e => e.message).join('; '));
  const user = response.data?.user;
  if (!user) throw new Error('GitHub 未返回该用户。');
  return validateData({username:user.login, source:'github-graphql', fetchedAt:new Date().toISOString(),
    ...user.contributionsCollection.contributionCalendar});
}

async function main() {
  const {values} = parseArgs({options: {
    user:{type:'string'}, input:{type:'string'}, text:{type:'string',default:'GIVE ME JOB'},
    brightness:{type:'string',default:'0.22'}, out:{type:'string',default:__dirname}, source:{type:'string',default:'public'},
    animated:{type:'boolean',default:false},words:{type:'string',default:'HIRE ME !Plz'},theme:{type:'string',default:'both'}
  }});
  if (Boolean(values.user) === Boolean(values.input)) throw new Error('请指定 --user 用户名 或 --input 已保存的 calendar.json，二选一。');
  if (!['public','graphql'].includes(values.source)) throw new Error('--source 取值应为 public 或 graphql。');
  if (!['light','dark','both'].includes(values.theme)) throw new Error('--theme 取值应为 light、dark 或 both。');
  const data = values.input ? validateData(JSON.parse(fs.readFileSync(values.input,'utf8'))) :
    await (values.source === 'public' ? fetchPublicCalendar : fetchCalendar)(values.user);
  const themes=values.theme==='both'?['light','dark']:[values.theme];
  const rendered=themes.map(theme=>({theme,...(values.animated ? renderAnimatedSVG(data,{words:values.words.split('/'),brightness:Number(values.brightness),theme}) :
    {svg:renderSVG(data,{text:values.text,brightness:Number(values.brightness),theme})})}));
  const filename=values.animated?'banner-animated.svg':'banner.svg';
  const out = path.resolve(values.out);
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'calendar.json'),JSON.stringify(data,null,2) + '\n');
  fs.writeFileSync(path.join(out,'calendar.js'),'window.CONTRIBUTION_DATA = ' + JSON.stringify(data).replace(/</g,'\\u003c') + ';\n');
  for(const result of rendered)fs.writeFileSync(path.join(out,filename.replace('.svg',`-${result.theme}.svg`)),result.svg+'\n');
  // Keep the existing URL usable, with the light export as the default fallback.
  fs.writeFileSync(path.join(out,filename),rendered[0].svg+'\n');
  if(values.animated&&values.theme==='both')fs.writeFileSync(path.join(out,'github-embed.md'),`<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./banner-animated-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./banner-animated-light.svg">
  <img alt="Animated contribution typography and snake" src="./banner-animated-light.svg">
</picture>\n`);
  console.log(JSON.stringify({output:path.join(out,filename),variants:rendered.map(r=>r.theme),duration:rendered[0].timeline?.duration,username:data.username,total:data.totalContributions,
    days:data.weeks.reduce((n,w)=>n+w.contributionDays.length,0),weeks:data.weeks.length,source:data.source},null,2));
}
if (require.main === module) main().catch(error => {console.error(error.message);process.exitCode=1;});
module.exports = {fetchCalendar, fetchPublicCalendar, parsePublicCalendar, QUERY};
