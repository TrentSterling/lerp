'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.resolve('.local/live-witness');fs.mkdirSync(OUT,{recursive:true});
const ORIGIN='https://tront.xyz', RELEASE='964a7848b2db3b21c62e548237fd60f6e306bc2b';
const files=['index.html','demo.js','smoothing.js','lerp-editor.js','lerp.css','SmoothingExtensions.cs'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={release:RELEASE,status:'running',requests:[],screens:[],errors:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let browser,page;try{
 const end=Date.now()+240000;
 for(;;){
  const response=await fetch(ORIGIN+'/lerp/?release='+RELEASE,{cache:'no-store'});const bytes=Buffer.from(await response.arrayBuffer());
  if(response.ok&&hash(bytes)===hash(fs.readFileSync(path.join(ROOT,'index.html'))))break;
  if(Date.now()>end)throw new Error('Deployed index did not match the approved release within the propagation window. HTTP '+response.status+'; bytes '+bytes.length);
  await sleep(10000);
 }
 for(const file of files){
  const response=await fetch(ORIGIN+'/lerp/'+(file==='index.html'?'':file)+'?release='+RELEASE,{cache:'no-store'});const bytes=Buffer.from(await response.arrayBuffer()),expected=hash(fs.readFileSync(path.join(ROOT,file)));
  assert.equal(response.status,200);assert.equal(hash(bytes),expected,file+' served hash');report.requests.push({url:response.url,status:response.status,bytes:bytes.length,sha256:expected});
 }
 for(const route of ['/assets/js/tront-system.js','/assets/css/tront-navbar.css','/assets/css/tront-theme-editor.css','/assets/img/tront.png']){
  const response=await fetch(ORIGIN+route);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert.ok(bytes.length>500);assert.ok(!bytes.toString('utf8',0,300).includes('Site Unavailable'));report.requests.push({url:response.url,status:response.status,bytes:bytes.length});
 }
 browser=await chromium.launch({executablePath:process.env.THEME_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});report.browser=browser.version();
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>{window.__paints=[];function paint(){if(document.body)window.__paints.push({palette:document.documentElement.getAttribute('data-lerp-palette'),bg:getComputedStyle(document.body).backgroundColor,opacity:getComputedStyle(document.body).opacity});if(window.__paints.length<15)requestAnimationFrame(paint);}requestAnimationFrame(paint);});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(ORIGIN+'/lerp/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('canvas').count(),6);assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'original');
  const paints=await page.evaluate(()=>window.__paints);assert.ok(paints.length);paints.forEach(p=>{assert.equal(p.palette,'original');assert.equal(p.bg,'rgb(13, 15, 20)');assert.equal(p.opacity,'1');});
  const sample=()=>page.locator('canvas').evaluateAll(es=>es.map(e=>e.dataset.position));
  const moving=await sample();await page.waitForTimeout(180);assert.notDeepEqual(await sample(),moving);
  await page.locator('#pause-demo').click();const frozen=await sample();await page.waitForTimeout(180);assert.deepEqual(await sample(),frozen);
  await page.locator('#half-life').press('End');assert.equal(await page.locator('#half-life-value').innerText(),'1.00 s');
  await page.locator('#comparison').selectOption('scaled');assert.match(await page.locator('#comparison-note').innerText(),/clamped/);
  await page.locator('#restart-demo').click();(await sample()).forEach(x=>assert.equal(Number(x),20));
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=width);
  await page.screenshot({path:path.join(OUT,`live-original-${width}.png`)});
  await page.locator('#tront-theme-btn').click();assert.equal(await page.locator('.te-peg').count(),4);assert.equal(await page.locator('#te-preset').inputValue(),'lerp-original');
  await page.locator('#te-preset').selectOption('light');await page.locator('[data-action=close]').click();
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'custom');
  const savedPaint=await page.evaluate(()=>window.__paints);assert.ok(savedPaint.length);savedPaint.forEach(p=>{assert.equal(p.palette,'custom');assert.equal(p.bg,'rgb(249, 250, 252)');assert.equal(p.opacity,'1');});
  await page.screenshot({path:path.join(OUT,`live-light-${width}.png`)});
  await page.locator('#tront-theme-btn').click();await page.locator('[data-action=reset]').click();assert.equal(await page.locator('html').getAttribute('data-lerp-palette'),'original');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#tront-theme-editor').evaluate(e=>e.open),false);
  report.screens.push({width,servedPage:true,motion:true,pauseRestart:true,keyboardHalfLife:true,comparison:true,themePersistence:true,defaultAndSavedFirstPaint:true,reset:true,dimensions});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});}
finally{fs.writeFileSync(path.join(OUT,'live-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(browser)await browser.close();}})();
