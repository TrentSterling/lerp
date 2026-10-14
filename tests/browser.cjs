'use strict';
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const BASE = path.resolve(process.env.LERP_BASELINE_ROOT || '.local/baseline');
const SHARED = path.resolve(process.env.LERP_SHARED_ROOT || '.local/shared');
const MEDIA = path.resolve(process.env.LERP_DISCOVERY_MEDIA || '.local/discovery-media');
const OUT = path.resolve(process.env.LERP_SCREENSHOTS || '.local/review');
fs.mkdirSync(OUT, {recursive:true});
const M = require('../smoothing.js');
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.cs':'text/plain'};
const report = {status:'running',composition:[],checks:[],errors:[],missing:[]};
const server = http.createServer((req,res)=>{
    const url = new URL(req.url,'http://localhost');
    let base, relative;
    if(url.pathname.startsWith('/games/media/')) {
        relative=decodeURIComponent(url.pathname.slice('/games/media/'.length));
        if(/\.mp4$/i.test(relative)){res.writeHead(404,{'Content-Type':'video/mp4'}).end();return;}
        base=MEDIA;
    }
    else if(url.pathname.startsWith('/baseline/')) {base=BASE;relative=url.pathname.slice(10);}
    else if(url.pathname.startsWith('/assets/')) {base=SHARED;relative=url.pathname.slice(1);}
    else if(url.pathname.startsWith('/lerp/')) {base=ROOT;relative=url.pathname.slice(6);}
    else {res.writeHead(404).end();return;}
    let file=path.resolve(base,decodeURIComponent(relative));
    if(file!==base && !file.startsWith(base+path.sep)) {res.writeHead(403).end();return;}
    if(fs.existsSync(file) && fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file) && url.pathname.startsWith('/games/media/') && /\.webp$/i.test(file)){
        const label=path.basename(file).replace(/-202[0-9]/,'').replace(/[-.]/g,' ').toUpperCase();
        res.writeHead(200,{'Content-Type':'image/svg+xml'});
        res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#192437"/><stop offset="1" stop-color="#0d0f14"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="510" cy="75" r="112" fill="#2ee6d7" fill-opacity=".16"/><path d="M0 280L180 190l125 72 135-106 200 124v80H0z" fill="#a855f7" fill-opacity=".25"/><text x="32" y="316" fill="#f5f7fa" font-family="system-ui,sans-serif" font-size="30" font-weight="700">'+label+'</text></svg>');
        return;
    }
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
async function waitForDiscoveryPosters(page){await page.waitForFunction(()=>{const cards=[...document.querySelectorAll('.tront-discovery__poster')];return cards.length===3&&cards.every(img=>img.complete&&img.naturalWidth>0);},null,{timeout:10000});}
function addMediaRequestLog(page){const requests=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/games/media/'))requests.push(url.pathname+url.search);});return requests;}
function mp4Requests(requests){return requests.filter(url=>/\.mp4(?:\?|$)/i.test(url));}
async function runDiscoveryChecks(browser,host,report){
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const releasePending=[];let page,videoRequests=0;
    try{
        await context.addInitScript(()=>{const key='__discovery-random-rolls';const roll=Number(sessionStorage.getItem(key)||0);sessionStorage.setItem(key,String(roll+1));Math.random=()=>roll===0?0.01:0.99;});
        await context.route('**/games/media/craftmine-2025.mp4*',async route=>{videoRequests+=1;if(videoRequests===1){await route.fulfill({status:404,contentType:'video/mp4',body:''}).catch(()=>{});return;}await new Promise(resolve=>releasePending.push(resolve));await route.fulfill({status:404,contentType:'video/mp4',body:''}).catch(()=>{});});
        page=await context.newPage();const requests=addMediaRequestLog(page);
        page.on('pageerror',error=>report.errors.push(error.message));
        await page.goto(host+'/lerp/',{waitUntil:'networkidle'});await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();await waitForDiscoveryPosters(page);
        const initial=await page.locator('.tront-discovery__card').evaluateAll(items=>items.map(card=>card.dataset.trontDiscoveryGame));
        assert.deepEqual(initial,['craftmine','smear','inkride']);
        assert.equal(await page.locator('[data-tront-discovery]').count(),1);
        assert.equal(await page.getByRole('heading',{name:'About Tront',level:2}).count(),1);
        assert.equal(await page.getByRole('heading',{name:'More from Tront',level:3}).count(),1);
        assert.equal(await page.getByRole('heading',{name:'Games',level:3}).count(),1);
        assert.equal(await page.locator('.tront-about, .tront-discovery__preview, .tront-discovery__open, .tront-discovery__archive-note, .tront-discovery__kind, .tront-discovery__eyebrow').count(),0);
        assert.equal(await page.locator('[data-tront-discovery-status]').innerText(),'');
        assert.equal(await page.locator('[data-tront-discovery-video]').count(),0,'no video before preview intent');
        assert.equal(await page.locator('.tront-discovery__card').evaluateAll(items=>items.every(card=>card.querySelectorAll('a').length===2)),true,'each game keeps independent poster and title links');
        assert.equal(await page.locator('[data-tront-discovery-game="craftmine"] .tront-discovery__title a').getAttribute('href'),'/craftmine/');
        assert.equal(await page.locator('[data-tront-discovery-game="smear"] .tront-discovery__title a').getAttribute('href'),'/smear/');
        const smear=page.locator('[data-tront-discovery-game="smear"]');
        assert.match(await smear.locator('.tront-discovery__description').innerText(),/Grab dummies, break things and drag the mess around\./);
        await smear.hover();assert.equal(mp4Requests(requests).length,0,'poster-only SMEAR never requests MP4');
        const posterPaths=[...new Set(requests.filter(url=>/\.webp(?:\?|$)/i.test(url)).map(url=>url.split('?')[0]))].sort();
        assert.deepEqual(posterPaths,['/games/media/craftmine-2025.webp','/games/media/inkride-2026.webp','/games/media/smear-2026.webp']);
        assert.equal(mp4Requests(requests).length,0,'initial view and poster hover do not request video');
        await page.screenshot({path:path.join(OUT,'about-discovery-pilot.png')});

        await page.reload({waitUntil:'networkidle'});await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();await waitForDiscoveryPosters(page);
        const afterReload=await page.locator('.tront-discovery__card').evaluateAll(items=>items.map(card=>card.dataset.trontDiscoveryGame));
        assert.deepEqual(afterReload,initial,'random pick remains stable for the browser session');
        assert.equal(mp4Requests(requests).length,0,'reload does not request preview clips');
        const firstPreview=page.waitForRequest(request=>request.url().includes('/games/media/craftmine-2025.mp4'));
        await page.locator('[data-tront-discovery-game="craftmine"]').hover();await firstPreview;
        await page.waitForFunction(()=>document.querySelector('[data-tront-discovery-video]')?.getAttribute('src')?.includes('craftmine-2025.mp4'));
        assert.equal(await page.locator('[data-tront-discovery-video]').count(),1,'single shared video is created on demand');
        assert.equal(await page.locator('[data-tront-discovery-video]').evaluate(video=>video.closest('[data-tront-discovery-game]').dataset.trontDiscoveryGame),'craftmine');
        await page.waitForFunction(()=>document.querySelector('[data-tront-discovery-status]').textContent.includes('preview unavailable'));
        assert.equal(await page.locator('[data-tront-discovery-video]').getAttribute('src'),null,'blocked playback releases the MP4 source');
        assert.equal(await page.locator('[data-tront-discovery-status]').getAttribute('role'),'status');

        await page.mouse.move(0,0);
        const offscreen=page.waitForRequest(request=>request.url().includes('/games/media/craftmine-2025.mp4'));
        await page.locator('[data-tront-discovery-game="craftmine"]').hover();await offscreen;await page.evaluate(()=>window.scrollTo(0,0));
        await page.waitForFunction(()=>!document.querySelector('[data-tront-discovery-video]')?.getAttribute('src'));
        await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();
        const hidden=page.waitForRequest(request=>request.url().includes('/games/media/craftmine-2025.mp4'));
        await page.locator('[data-tront-discovery-game="craftmine"]').hover();await hidden;
        const hiddenSupported=await page.evaluate(()=>{try{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));return document.hidden;}catch(_){return false;}});
        assert.equal(hiddenSupported,true);await page.waitForFunction(()=>!document.querySelector('[data-tront-discovery-video]')?.getAttribute('src'));
        assert.equal(mp4Requests(requests).every(url=>!url.includes('tiny-treads-2026')&&!url.includes('tinyrise-2026')),true,'unselected random clips never download');
        report.checks.push({aboutDiscovery:true,eagerMp4Requests:0,sessionStablePick:initial[2],selectedPosters:posterPaths,sharedVideoElement:true,blockedPlaybackFallback:true,sourceReleasedOffscreen:true,sourceReleasedWhenHidden:true,smearPosterOnly:true});
    }finally{releasePending.splice(0).forEach(resolve=>resolve());await context.close();}

    const keyboard=await browser.newContext({viewport:{width:1280,height:900}});
    try{
        await keyboard.route('**/games/media/craftmine-2025.mp4*',route=>route.fulfill({status:404,contentType:'video/mp4',body:''}));
        const page=await keyboard.newPage();const requests=addMediaRequestLog(page);
        await page.goto(host+'/lerp/',{waitUntil:'networkidle'});await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();await waitForDiscoveryPosters(page);
        await page.locator('[data-tront-discovery-game="craftmine"] .tront-discovery__image-link').focus();await page.keyboard.press('Tab');
        await page.waitForFunction(()=>document.querySelector('[data-tront-discovery-status]').textContent.includes('preview unavailable'));
        const state=await page.locator('[data-tront-discovery-game="craftmine"]').evaluate(card=>({visible:document.activeElement.matches(':focus-visible'),outline:getComputedStyle(card).outlineWidth,style:getComputedStyle(card).outlineStyle}));
        assert.equal(state.visible,true);assert.equal(state.outline,'3px');assert.equal(state.style,'solid');
        assert.ok(mp4Requests(requests).some(url=>url.includes('craftmine-2025.mp4')),'keyboard focus activates preview');
        report.checks.push({aboutDiscoveryKeyboardFocus:true,visibleFocus:true});
    }finally{await keyboard.close();}

    const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    try{
        const page=await reduced.newPage();const requests=addMediaRequestLog(page);
        await page.goto(host+'/lerp/',{waitUntil:'networkidle'});await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();await waitForDiscoveryPosters(page);
        await page.locator('[data-tront-discovery-game="craftmine"]').hover();assert.equal(mp4Requests(requests).length,0,'reduced motion keeps posters only');
        assert.ok((await overflow(page)).scroll<=390);report.checks.push({aboutDiscoveryReducedMotion:true,mobileWidth:390,posterOnly:true,noHorizontalOverflow:true});
    }finally{await reduced.close();}

    const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    try{
        await touch.route('**/craftmine/',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>CraftMine</title></head><body></body></html>'}));
        const page=await touch.newPage();const requests=addMediaRequestLog(page);
        await page.goto(host+'/lerp/',{waitUntil:'networkidle'});await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();await waitForDiscoveryPosters(page);
        assert.equal(mp4Requests(requests).length,0,'touch load and scroll remain poster-only');
        await page.locator('[data-tront-discovery-game="craftmine"] .tront-discovery__image-link').tap();await page.waitForURL(host+'/craftmine/');
        assert.equal(mp4Requests(requests).length,0,'normal touch link navigates without a preview request');
        assert.ok((await overflow(page)).scroll<=390);report.checks.push({aboutDiscoveryTouchLink:true,touchLinkIndependent:true,noHorizontalOverflow:true});
    }finally{await touch.close();}

    const saveData=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    try{
        await saveData.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true,addEventListener(){}}}));
        const page=await saveData.newPage();const requests=addMediaRequestLog(page);
        await page.goto(host+'/lerp/',{waitUntil:'networkidle'});await page.locator('[data-tront-discovery]').scrollIntoViewIfNeeded();await waitForDiscoveryPosters(page);
        await page.locator('[data-tront-discovery-game="craftmine"]').hover();assert.equal(mp4Requests(requests).length,0,'Save-Data keeps posters only');
        assert.ok((await overflow(page)).scroll<=390);report.checks.push({aboutDiscoverySaveData:true,posterOnly:true,noHorizontalOverflow:true});
    }finally{await saveData.close();}

    const lazy=await browser.newContext({viewport:{width:1280,height:900}});const releaseLazy=[];
    try{
        await lazy.route('**/games/media/craftmine-2025.mp4*',async route=>{await new Promise(resolve=>releaseLazy.push(resolve));await route.fulfill({status:404,contentType:'video/mp4',body:''}).catch(()=>{});});
        await lazy.route('**/about-lazy/',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/lerp/tront-about-discovery.css"><title>Lazy About Fixture</title></head><body><button id="game-input">Game input</button><details id="about"><summary>About</summary><section class="tront-discovery" data-tront-discovery><div data-tront-discovery-cards></div><p data-tront-discovery-status role="status" aria-live="polite"></p></section></details><script>window.__gameInputs=[];document.addEventListener("keydown",()=>window.__gameInputs.push("keydown"),true);document.addEventListener("pointerdown",()=>window.__gameInputs.push("pointerdown"),true);</script><script src="/lerp/tront-about-discovery.js"></script></body></html>'}));
        const page=await lazy.newPage();const requests=addMediaRequestLog(page);page.on('pageerror',error=>report.errors.push(error.message));
        await page.goto(host+'/about-lazy/',{waitUntil:'networkidle'});assert.equal(await page.locator('.tront-discovery__card').count(),0);assert.equal(requests.length,0);
        await page.locator('#game-input').focus();await page.keyboard.press('g');await page.locator('#game-input').click();
        assert.deepEqual(await page.evaluate(()=>window.__gameInputs),['keydown','pointerdown']);
        await page.locator('#about summary').click();await page.waitForFunction(()=>document.querySelector('#about').open);
        await page.waitForFunction(()=>document.querySelectorAll('.tront-discovery__card').length===3);await waitForDiscoveryPosters(page);
        const preview=page.waitForRequest(request=>request.url().includes('/games/media/craftmine-2025.mp4'));
        await page.locator('[data-tront-discovery-game="craftmine"]').hover();await preview;
        await page.waitForFunction(()=>document.querySelector('[data-tront-discovery-video]')?.getAttribute('src')?.includes('craftmine-2025.mp4'));
        await page.locator('#about').evaluate(details=>{details.open=false;details.dispatchEvent(new Event('toggle'));});
        await page.waitForFunction(()=>!document.querySelector('[data-tront-discovery-video]')?.getAttribute('src'));
        report.checks.push({aboutDiscoveryDeferredUntilDisclosureOpen:true,zeroMediaRequestsWhileClosed:true,sourceReleasedWhenDisclosureClosed:true});
    }finally{releaseLazy.splice(0).forEach(resolve=>resolve());await lazy.close();}
}
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const host=`http://127.0.0.1:${server.address().port}`;
    let browser,page;
    try{
        browser=await chromium.launch({headless:true,executablePath:process.env.THEME_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
        report.browser=browser.version();
        for(const width of [1440,390,320]){
            const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
            await context.addInitScript(()=>{
                localStorage.setItem('tront-theme','tront-purple');
                localStorage.setItem('tront-theme-editor-v1','shared-theme-sentinel');
                localStorage.setItem('tront-theme-gallery-v1','games-theme-sentinel');
                window.__paint=[];
                function paint(){if(document.body&&location.pathname==='/lerp/')window.__paint.push({bg:getComputedStyle(document.body).backgroundColor,opacity:getComputedStyle(document.body).opacity,palette:document.documentElement.getAttribute('data-lerp-palette')});if(window.__paint.length<20)requestAnimationFrame(paint);}
                requestAnimationFrame(paint);
            });
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
            const paint=await page.evaluate(()=>window.__paint);assert.ok(paint.length);paint.forEach(p=>{assert.equal(p.bg,'rgb(13, 15, 20)');assert.equal(p.opacity,'1');});
            const canvasBoxes=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height})));
            canvasBoxes.forEach(b=>{assert.ok(b.w<=300&&b.w>0);near(b.w/b.h,3.75,0.1);});
            const current=await composition(page);assert.deepEqual(current,original);
            const flow=await overflow(page);assert.ok(flow.scroll<=width,JSON.stringify(flow));assert.deepEqual(flow.over,[]);
            if(width===1440){
                const discoveryPegs=await page.evaluate(()=>[
                    getComputedStyle(document.querySelector('.tront-discovery')).borderTopColor,
                    getComputedStyle(document.querySelector('.tront-discovery__title a')).color,
                    getComputedStyle(document.querySelector('[data-tront-discovery-game="smear"]')).borderTopColor,
                    getComputedStyle(document.querySelector('[data-tront-discovery-game="craftmine"]')).borderTopColor
                ]);
                assert.deepEqual(discoveryPegs,['rgb(168, 85, 247)','rgb(46, 230, 215)','rgb(242, 63, 67)','rgb(35, 165, 90)']);
                report.checks.push({aboutDiscoveryFourPegTheme:true,discoveryPegs});
            }
            assert.equal(await page.locator('#pause-demo').innerText(),'Play');
            assert.equal(await page.locator('#magic-navbar-container').getByRole('link').count(),4);
            const download=await context.request.get(host+'/lerp/SmoothingExtensions.cs');assert.equal(download.status(),200);
            assert.equal(await download.text(),fs.readFileSync(path.join(BASE,'SmoothingExtensions.cs'),'utf8'));
            await page.screenshot({path:path.join(OUT,`after-original-${width}.png`),fullPage:true});
            await page.screenshot({path:path.join(OUT,`viewport-original-${width}.png`)});
            report.composition.push({paint,canvasBoxes,width,exactOriginalComposition:true,original,current,overflow:flow});
            await page.getByRole('button',{name:'Choose a theme'}).click();
            assert.equal(await page.locator('#tront-theme-editor').evaluate(e=>e.open),true);
            assert.equal(await page.locator('.te-peg').count(),4);
            assert.equal(await page.locator('#te-preset').inputValue(),'lerp-original');
            assert.deepEqual(await page.locator('input[type=color]').evaluateAll(es=>es.map(e=>e.value)),['#a855f7','#2ee6d7','#f23f43','#23a55a']);
            assert.match(await page.locator('.te-hint').innerText(),/purple glow, teal target/);
            for(const palette of ['cyan','purple','ember','moss','light','dark']){
                await page.locator('#te-preset').selectOption(palette);
                const state=await page.locator('html').getAttribute('data-lerp-palette');assert.equal(state,'custom');
                assert.ok((await overflow(page)).scroll<=width);
                if(palette){
                    const contrast=await page.evaluate(()=>{
                        const parse=v=>(v.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
                        const ratio=(a,b)=>window.TrontThemeEditor.contrast(a,b);
                        const checks=[];
                        for(const sel of ['.explanation-box p','.explanation-box strong','.explanation-box a','.card-section h2','.demo-subtext.bad','.demo-subtext.good','.sim-readout','pre code .keyword','pre code .type','pre code .comment','.tront-discovery__bio','.tront-discovery__links-list a','.tront-discovery__hub','.tront-discovery__games-title','.tront-discovery__description']){
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
                if(palette==='light'){await page.screenshot({path:path.join(OUT,`theme-light-${width}.png`),fullPage:false});await page.locator('[data-action=close]').click();await page.screenshot({path:path.join(OUT,`viewport-light-${width}.png`)});await page.locator('#tront-theme-btn').click();}
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
            const retained=await page.evaluate(()=>[localStorage.getItem('tront-theme'),localStorage.getItem('tront-theme-editor-v1'),localStorage.getItem('tront-theme-gallery-v1'),localStorage.getItem('tront-theme-lerp-v1')]);
            assert.deepEqual(retained,['tront-purple','shared-theme-sentinel','games-theme-sentinel',null]);
            assert.equal(await page.locator('[data-tront-discovery]').count(),1);
            assert.equal(await page.locator('[data-tront-discovery]').evaluate(e=>getComputedStyle(e).position),'static');
            assert.equal(await page.getByRole('heading',{name:'About Tront',level:2}).count(),1);
            await page.locator('.precision-notes').scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(OUT,`article-${width}.png`)});
            report.checks.push({width,presets:6,modalFocus:true,persistence:true,fourPegs:true,resetUndo:true,sharedStorageUntouched:true,firstPaint:true,footerAbout:true});
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
        await runDiscoveryChecks(browser,host,report);
        assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);report.status='passed';
    }catch(error){report.status='failed';report.error=error.stack;if(page&&!page.isClosed())await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});process.exitCode=1;}
    finally{fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
})();
