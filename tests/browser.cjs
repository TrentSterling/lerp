'use strict';
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const BASE = path.resolve(process.env.LERP_BASELINE_ROOT || '.local/baseline');
const SHARED = path.resolve(process.env.LERP_SHARED_ROOT || '.local/shared');
const OUT = path.resolve(process.env.LERP_SCREENSHOTS || '.local/review');
fs.mkdirSync(OUT, {recursive:true});
const M = require('../smoothing.js');
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.cs':'text/plain'};
const report = {status:'running',composition:[],checks:[],errors:[],missing:[]};
const server = http.createServer((req,res)=>{
    const url = new URL(req.url,'http://localhost');
    let base, relative;
    if(url.pathname.startsWith('/baseline/')) {base=BASE;relative=url.pathname.slice(10);}
    else if(url.pathname.startsWith('/assets/')) {base=SHARED;relative=url.pathname.slice(1);}
    else if(url.pathname.startsWith('/lerp/')) {base=ROOT;relative=url.pathname.slice(6);}
    else {res.writeHead(404).end();return;}
    let file=path.resolve(base,decodeURIComponent(relative));
    if(file!==base && !file.startsWith(base+path.sep)) {res.writeHead(403).end();return;}
    if(fs.existsSync(file) && fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){report.missing.push(url.pathname);res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
});
function near(a,b,t=1e-6){assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);}
async function composition(page){return page.evaluate(()=>{
    const body=getComputedStyle(document.body), before=getComputedStyle(document.body,'::before'),after=getComputedStyle(document.body,'::after');
    const pick=s=>Object.fromEntries(['width','height','position','top','left','borderRadius','filter','opacity','transform','backgroundColor','backgroundImage'].map(k=>[k,s[k]]));
    const grid=getComputedStyle(document.querySelector('.grid-overlay')),h1=getComputedStyle(document.querySelector('h1'));
    return {body:body.backgroundColor,before:pick(before),after:pick(after),grid:{backgroundImage:grid.backgroundImage,backgroundSize:grid.backgroundSize,position:grid.position},type:{fontFamily:h1.fontFamily,fontSize:h1.fontSize,fontWeight:h1.fontWeight}};
});}
async function setControl(page,selector,value){await page.locator(selector).evaluate((e,value)=>{e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},String(value));}
async function overflow(page){return page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,over:[...document.querySelectorAll('main *,#magic-navbar-container *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)&&!e.closest('pre');}).map(e=>e.tagName+'.'+e.className).slice(0,12)}));}
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const host=`http://127.0.0.1:${server.address().port}`;
    let browser,page;
    try{
        browser=await chromium.launch({headless:true,executablePath:process.env.THEME_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
        report.browser=browser.version();
        for(const width of [1440,390,320]){
            const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
            await context.route('https://www.googletagmanager.com/**',r=>r.fulfill({status:204,body:''}));
            page=await context.newPage();
            page.on('pageerror',e=>report.errors.push(e.message));
            await page.goto(host+'/baseline/',{waitUntil:'networkidle'});
            await page.evaluate(()=>document.fonts.ready);
            const original=await composition(page);
            await page.screenshot({path:path.join(OUT,`before-${width}.png`),fullPage:true});
            await page.goto(host+'/lerp/',{waitUntil:'networkidle'});
            await page.evaluate(()=>document.fonts.ready);
            assert.equal(await page.locator('canvas').count(),6);
            assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'original');
            const current=await composition(page);assert.deepEqual(current,original);
            const flow=await overflow(page);assert.ok(flow.scroll<=width,JSON.stringify(flow));assert.deepEqual(flow.over,[]);
            assert.equal(await page.locator('#pause-demo').innerText(),'Play');
            assert.equal(await page.locator('#magic-navbar-container').getByRole('link').count(),4);
            const download=await context.request.get(host+'/lerp/SmoothingExtensions.cs');assert.equal(download.status(),200);
            assert.equal(await download.text(),fs.readFileSync(path.join(BASE,'SmoothingExtensions.cs'),'utf8'));
            await page.screenshot({path:path.join(OUT,`after-original-${width}.png`),fullPage:true});
            report.composition.push({width,exactOriginalComposition:true,original,current,overflow:flow});
            await page.getByRole('button',{name:'Choose a theme'}).click();
            assert.equal(await page.locator('#tront-theme-editor').evaluate(e=>e.open),true);
            assert.equal(await page.locator('.te-peg').count(),4);
            for(const palette of ['cyan','purple','ember','moss','light','dark']){
                await page.locator('#te-preset').selectOption(palette);
                const state=await page.locator('html').getAttribute('data-lerp-palette');assert.equal(state,palette==='dark'?'original':'custom');
                assert.ok((await overflow(page)).scroll<=width);
                if(palette!=='dark'){
                    const contrast=await page.evaluate(()=>{
                        const parse=v=>(v.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
                        const ratio=(a,b)=>window.TrontThemeEditor.contrast(a,b);
                        const checks=[];
                        for(const sel of ['.explanation-box p','.explanation-box strong','.explanation-box a','.card-section h2','.demo-subtext.bad','.demo-subtext.good','.sim-readout','pre code .keyword','pre code .type','pre code .comment']){
                            const e=document.querySelector(sel),s=getComputedStyle(e),card=e.closest('.card-section,.explanation-box');
                            const panel=parse(getComputedStyle(document.documentElement).getPropertyValue('--te-panel'));
                            const hex=getComputedStyle(document.documentElement).getPropertyValue('--te-panel').trim();
                            const rgb=window.Tront.hexToRgb(hex);
                            checks.push({sel,ratio:ratio(parse(s.color),rgb)});
                        }
                        return checks;
                    });
                    for(const c of contrast)assert.ok(c.ratio>=4.5,JSON.stringify({palette,width,...c}));
                }
                if(palette==='light')await page.screenshot({path:path.join(OUT,`theme-light-${width}.png`),fullPage:false});
            }
            await page.locator('[data-action="magic"]').click();
            assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'custom');
            await page.locator('#te-position-0').focus(); await page.keyboard.press('ArrowRight');
            await setControl(page,'#te-position-0',20);
            await setControl(page,'#te-color-3','#ffd400');
            await setControl(page,'#te-angle',210);
            await setControl(page,'#te-intensity',100);
            await setControl(page,'#te-frost',75);
            await page.locator('[data-action="close"]').click();
            assert.equal(await page.locator('#tront-theme-btn').getAttribute('aria-expanded'),'false');
            assert.equal(await page.evaluate(()=>document.activeElement.id),'tront-theme-btn');
            await page.reload({waitUntil:'networkidle'});
            assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'custom');
            await page.locator('#tront-theme-btn').click();
            assert.equal(await page.locator('#te-color-3').inputValue(),'#ffd400');
            assert.equal(await page.locator('#te-position-0').inputValue(),'20');
            await page.locator('[data-action="reset"]').click();
            assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'original');
            await page.locator('[data-action="undo"]').click();
            assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'custom');
            await page.locator('[data-action="reset"]').click();
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#tront-theme-editor').evaluate(e=>e.open),false);
            await page.locator('#tront-theme-btn').click();
            await page.locator('[data-action="close"]').press('Shift+Tab');
            assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'reset');
            await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'close');
            await page.locator('[data-action="close"]').click();
            await page.locator('#tront-theme-btn').click();
            await page.mouse.click(2,2);
            assert.equal(await page.locator('#tront-theme-editor').evaluate(e=>e.open),false);
            await page.locator('.precision-notes').scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(OUT,`article-${width}.png`)});
            report.checks.push({width,presets:6,modalFocus:true,persistence:true,fourPegs:true,resetUndo:true});
            await context.close();
        }
        // Exercise the actual renderer with precise, irregular rAF timestamps.
        const context=await browser.newContext({viewport:{width:1440,height:1000}});
        await context.addInitScript(()=>{
            let queue=[];
            window.requestAnimationFrame=callback=>(queue.push(callback),queue.length);
            window.__frame=timestamp=>{const next=queue;queue=[];next.forEach(callback=>callback(timestamp));};
        });
        page=await context.newPage();
        await page.goto(host+'/lerp/',{waitUntil:'networkidle'});
        async function frame(t){await page.evaluate(t=>window.__frame(t),t);}
        async function positions(){return page.locator('canvas').evaluateAll(cs=>cs.map(c=>({x:Number(c.dataset.position),t:Number(c.dataset.sampleTime),pixel:[...c.getContext('2d').getImageData(Math.min(298,Math.floor(Number(c.dataset.position)+15)),40,1,1).data]})));}
        for(const method of ['fixed','scaled'])for(const h of [0.05,0.3,1]){
            await page.locator('#comparison').selectOption(method);
            await setControl(page,'#half-life',h);
            await frame(1000);
            for(const t of [1011,1077,1100,1300,1500])await frame(t);
            const actual=await positions();
            actual.forEach((v,i)=>{const expected=M.sampleAt(0.5,[10,30,60][i%3],h,i<3?method:'exponential');near(v.x,expected.x,1e-6);assert.equal(v.pixel[3],255);});
            report.checks.push({actualSixCanvases:true,method,halfLife:h,elapsed:0.5,actual});
        }
        await page.locator('#pause-demo').click(); const frozen=await positions();await frame(2000);await frame(4000);assert.deepEqual(await positions(),frozen);
        await page.locator('#restart-demo').click();(await positions()).forEach(v=>assert.equal(v.x,20));
        await page.locator('#pause-demo').click();await frame(5000);await frame(5250);near((await positions())[0].t,0.2);
        report.checks.push({pause:true,restartWhilePaused:true,resumeWithoutTimeJump:true});
        await page.screenshot({path:path.join(OUT,'demo-active.png')});await context.close();
        // Storage denial must still allow a usable editor and original Reset.
        const blocked=await browser.newContext();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError');}}));
        page=await blocked.newPage();await page.goto(host+'/lerp/',{waitUntil:'networkidle'});
        await page.locator('#tront-theme-btn').click();await page.locator('#te-preset').selectOption('light');
        assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'custom');
        await page.locator('[data-action="reset"]').click();assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'original');
        assert.match(await page.locator('.te-status').innerText(),/storage is unavailable/);await blocked.close();
        assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);report.status='passed';
    }catch(error){report.status='failed';report.error=error.stack;if(page&&!page.isClosed())await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});process.exitCode=1;}
    finally{fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
})();
