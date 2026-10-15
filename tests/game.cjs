// Development-only browser checks. No test dependencies are needed by the game.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
require('node:fs').mkdirSync(path.resolve(__dirname,'../work'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 let server;
 try {
 const context=await browser.newContext({viewport:{width:1280,height:1000}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 if(process.env.GAME_TEST_HTTP==='1'){
  const html=require('node:fs').readFileSync(path.resolve(__dirname,'../index.html'));
  server=require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/`;
 }
 await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.clock.install();
 const prizes=[10,25,50,100,200,500,1000,0];let total=0;
 for(let i=0;i<11;i++){
  const index=i%8;
  await page.evaluate(index=>{let count=0;crypto.getRandomValues=arr=>{arr[0]=count++%2===0?index:2147483648;return arr;};},index);
  await page.locator('#spin').click();
  assert.equal(await page.locator('#spin').isDisabled(),true);
  assert.equal(await page.locator('#reset').isDisabled(),true);
  await page.evaluate(()=>{document.getElementById('spin').click();document.getElementById('spin').click();});
  await page.clock.runFor(5700);
  total+=prizes[index];
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('kolesoudachi.v1')));
  assert.equal(data.total,total);assert.equal(data.spins,i+1);assert.equal(data.history[0].prize,prizes[index]);assert.equal(data.history.length,Math.min(10,i+1));
  const angle=await page.locator('#wheel').evaluate(el=>Number(el.style.transform.match(/rotate\((.*?)deg\)/)[1]));
  const sector=Math.floor((((-angle+22.5)%360+360)%360)/45);assert.equal(sector,index);
  const labels=await page.locator('#sectors > g').nth(sector).textContent();assert.ok(labels.includes(prizes[index]?String(prizes[index]).replace('1000','1 000'):'Попробуй'));
  assert.equal(await page.locator('#result-dialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#spin').isEnabled(),true);
  await page.locator('#result-close').click();
 }
 assert.equal(await page.locator('#best').textContent(),'1 000 ✦');
 await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');
 await page.reload();assert.equal(await page.locator('#total').textContent(),total.toLocaleString('ru-RU'));assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#history li').count(),10);
 await page.screenshot({path:path.resolve(__dirname,'../work/desktop.png'),fullPage:true});
 await page.locator('#reset').click();await page.locator('#reset-cancel').click();assert.equal(await page.locator('#spins').textContent(),'11');
 await page.locator('#reset').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#spins').textContent(),'11');
 await page.locator('#reset').click();await page.locator('#reset-confirm').click();assert.equal(await page.locator('#total').textContent(),'0');assert.equal(await page.locator('#spins').textContent(),'0');assert.equal(await page.locator('#best').textContent(),'0 ✦');assert.equal(await page.locator('#history li').count(),0);await page.reload();assert.equal(await page.locator('#spins').textContent(),'0');
 await page.locator('#rules').click();assert.equal(await page.locator('#rules-dialog').evaluate(el=>el.open),true);await page.keyboard.press('Escape');
 for(const width of [320,375,390,640,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);const box=await page.locator('#wheel').boundingBox();assert.ok(box.width>200);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve(__dirname,'../work/mobile.png'),fullPage:true});
 // Exercise the normal-duration RAF animation with the real browser clock.
 const real=await context.newPage();await real.goto(url);await real.locator('#spin').click();await real.locator('#result-dialog').waitFor({state:'visible',timeout:10000});assert.equal(await real.locator('#spins').textContent(),'1');await real.close();
 const blocked=await browser.newContext({reducedMotion:'reduce'});await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});const b=await blocked.newPage();b.on('pageerror',e=>errors.push(e.message));await b.goto(url);assert.equal(await b.locator('#save-warning').isVisible(),true);await b.locator('#spin').click();await b.locator('#result-dialog').waitFor({state:'visible'});assert.equal(await b.locator('#spins').textContent(),'1');await blocked.close();
 // Malformed persisted data is safely discarded.
 await page.evaluate(()=>localStorage.setItem('kolesoudachi.v1','{broken'));await page.reload();assert.equal(await page.locator('#spins').textContent(),'0');await page.locator('#spin').click();await page.clock.runFor(5700);assert.equal(await page.locator('#spins').textContent(),'1');
 assert.deepEqual(errors,[]);console.log('PASS: all 8 sectors; actual final pointer angle; points; 10-item history; persistence; double-click lock; confirmed/cancelled reset; sound preference; rules; 6 viewport widths; normal animation; reduced motion; blocked/corrupt storage; no page errors.');
 }finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
