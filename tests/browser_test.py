"""Production HTML browser regression suite. Optional dependency: Python Playwright.
Prefers BROWSER_TEST_URL when supplied; in locked sandboxes uses set_content and
reports that limitation. Storage double tests are explicitly separated from native.
Run from project root after `npm run build`. Chromium only; not a Safari test.
"""
from __future__ import annotations
import base64, json, os, shutil, statistics, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
HTML = (ROOT / 'dist/index.html').read_text()
HTML_DEBUG = HTML.replace('new URLSearchParams(location.search)', "new URLSearchParams('debug=1&seed=42')")
report = {'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'checks': [], 'pageErrors': [], 'networkRequests': [], 'loadMethod': 'set_content of production bundle; only diagnostic query is injected', 'storageScope': 'blocked native storage on opaque document; explicitly injected Storage-compatible test double for persistence tests', 'realDevices': [], 'safari': 'not tested', 'androidWebView': 'not tested'}

def check(name: str, condition: bool, detail=None):
    report['checks'].append({'name': name, 'passed': bool(condition), 'detail': detail})
    if not condition: raise AssertionError(name + ': ' + str(detail))

def harness(backend: dict | None) -> str:
    if backend is None: return ''
    data=json.dumps(backend,ensure_ascii=False).replace('<','\\u003c')
    return f"""<script>window.__storageData={data};Object.defineProperty(window,'localStorage',{{configurable:true,value:{{getItem:k=>Object.hasOwn(__storageData,k)?__storageData[k]:null,setItem:(k,v)=>__storageData[k]=String(v),removeItem:k=>delete __storageData[k],clear:()=>window.__storageData={{}}}}}});</script>"""

def load(context, backend=None, debug=True):
    page=context.new_page(); page.set_default_timeout(4000)
    page.on('pageerror',lambda err:report['pageErrors'].append(str(err)))
    page.on('request',lambda req:report['networkRequests'].append(req.url))
    text=HTML_DEBUG if debug else HTML
    text=text.replace('<head>', '<head>'+harness(backend),1)
    page.set_content(text,wait_until='load');page.wait_for_timeout(110)
    return page

def state(page):return page.evaluate('({phase:__nightmarket.engine?.phase,wave:__nightmarket.engine?.wave,shots:__nightmarket.engine?.shots,kills:__nightmarket.engine?.kills,paused:__nightmarket.paused})')
def click_aim(page,x=208,y=190,touch=False):
    r=page.locator('#board').bounding_box()
    px=r['x']+x/420*r['width']; py=r['y']+y/580*r['height']
    if touch:page.touchscreen.tap(px,py)
    else:page.mouse.click(px,py)

def inside(page,selector):
    return page.locator(selector).evaluate('(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5}')

started=time.monotonic()
try:
    with sync_playwright() as p:
        path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        options={'headless':True,'args':['--no-sandbox']}
        if path: options['executable_path']=path
        browser=p.chromium.launch(**options);report['browser']=browser.version
        # URL navigation is attempted independently. Failure never becomes a fake pass.
        probe=browser.new_page()
        url=os.environ.get('BROWSER_TEST_URL','http://localhost:4173/dist/index.html?debug=1&seed=42')
        try:
            probe.goto(url,wait_until='load',timeout=3000)
            report['urlNavigation']={'url':url,'passed':probe.title().startswith('喵弹夜市')}
        except Exception as e:report['urlNavigation']={'url':url,'passed':False,'error':str(e).splitlines()[0]}
        probe.close()
        # Original production bundle with no diagnostic modifications.
        ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,device_scale_factor=2)
        original=load(ctx,{},debug=False)
        check('production has no debug object by default',original.evaluate('window.__nightmarket===undefined'))
        original.locator('#start').click();click_aim(original,touch=True);original.wait_for_timeout(2600)
        check('unaltered production first shot reaches upgrade modal',original.locator('[data-upgrade]').count()==3)
        original.screenshot(path=str(EVIDENCE/'production-first-upgrade.png'));original.close();ctx.close()
        # Multiple viewport/DPI layouts; real taps use the Pointer Events path.
        for width,height,dpr in [(320,568,2),(360,640,2),(390,844,3),(412,915,2),(480,960,1),(768,1024,2),(1280,900,1),(844,390,1)]:
            ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=dpr,has_touch=True)
            page=load(ctx,{})
            check(f'home viewport {width}x{height} no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            page.locator('#start').scroll_into_view_if_needed()
            check(f'start CTA reachable {width}x{height}',inside(page,'#start'))
            if width==390:page.screenshot(path=str(EVIDENCE/'home-mobile.png'))
            if width==1280:page.screenshot(path=str(EVIDENCE/'home-desktop.png'))
            page.locator('#start').click();page.wait_for_timeout(80)
            check(f'board inside viewport {width}x{height}',inside(page,'#board'))
            check(f'footer inside viewport {width}x{height}',inside(page,'.game-footer'))
            check(f'DPI capped at 2 on {width}x{height}',page.evaluate('__nightmarket.renderer.dpr<=2'))
            if width in [320,390,1280]:page.screenshot(path=str(EVIDENCE/f'game-{width}.png'))
            click_aim(page,touch=True)
            check(f'touch starts exactly one volley {width}x{height}',state(page)['shots']==1)
            page.evaluate('__nightmarket.step(12)')
            check(f'touch volley reaches reward {width}x{height}',state(page)['phase']=='reward')
            check(f'upgrade modal fits {width}x{height}',inside(page,'#modal'))
            if width==390:page.screenshot(path=str(EVIDENCE/'upgrade-mobile.png'))
            page.locator('[data-upgrade]').first.click()
            check(f'upgrade resumes next wave {width}x{height}',state(page)['wave']==2 and state(page)['phase']=='aim')
            page.close();ctx.close()
        ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,device_scale_factor=2,accept_downloads=True)
        page=load(ctx,{})
        page.locator('#settings').click();check('settings panel accessible',page.locator('#modal').get_attribute('aria-label')=='游戏设置')
        page.locator('[data-setting="sound"]').click();check('sound toggle updates state',not page.evaluate('__nightmarket.profile.settings.sound'))
        page.locator('[data-setting="reducedMotion"]').click();check('reduced motion updates renderer',page.evaluate('__nightmarket.renderer.reducedMotion'))
        page.locator('[data-action="help"]').click();check('help explains rush and boss', '两格' in page.locator('#modal').inner_text() and '大王越线' in page.locator('#modal').inner_text())
        page.locator('[data-action="close"]').click();page.locator('#start').click()
        before=state(page);page.wait_for_timeout(250);check('idle does not fire or advance',state(page)==before)
        # Pointer cancellation and rapid multiple gestures.
        page.locator('#board').dispatch_event('pointerdown',{'pointerId':91,'pointerType':'touch','clientX':160,'clientY':300,'isPrimary':True})
        page.locator('#board').dispatch_event('pointercancel',{'pointerId':91,'pointerType':'touch'})
        page.locator('#board').dispatch_event('pointerup',{'pointerId':91,'pointerType':'touch','clientX':170,'clientY':300})
        check('cancelled pointer cannot fire',state(page)['shots']==0)
        click_aim(page);click_aim(page);click_aim(page)
        check('rapid repeated clicks during flight do not duplicate shots',state(page)['shots']==1)
        page.locator('#pause').click();t=page.evaluate('__nightmarket.engine.elapsed');page.wait_for_timeout(180)
        check('pause freezes physics',page.evaluate('__nightmarket.engine.elapsed')==t and state(page)['paused'])
        page.locator('[data-action="resume"]').click();check('explicit resume restores play',not state(page)['paused'])
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
        check('visibility hidden pauses',state(page)['paused'])
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
        check('visible again waits for confirmation',state(page)['paused'])
        page.locator('[data-action="resume"]').click();page.evaluate("window.dispatchEvent(new Event('blur'))")
        check('window blur pauses',state(page)['paused']);page.locator('[data-action="resume"]').click()
        page.evaluate('__nightmarket.step(12)');page.locator('[data-upgrade]').first.click()
        page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(120);check('resize mid-run keeps phase and board',inside(page,'#board') and state(page)['phase']=='aim')
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
        page.locator('#pause').click();page.locator('[data-action="home"]').click();check('continue button appears after returning home',page.locator('#continue').is_visible())
        stored=page.evaluate('__storageData');page.close()
        page=load(ctx,stored);page.locator('#continue').click();check('new-document checkpoint restored using explicit storage double',state(page)['wave']==2 and state(page)['shots']==1)
        # Complete a real engine run via mouse input and upgrade buttons. Only waiting
        # is fast-forwarded with the diagnostic fixed-step runner; no score/HP cheats.
        for _ in range(40):
            s=state(page)
            if s['phase']=='end':break
            if s['phase']=='reward':
                choice=page.evaluate("(()=>{const g=__nightmarket.engine,p=['split','blast','spark','ice','laser','return','guard','wall','pierce','firefly','drill','hunter'];return [...g.offers].sort((a,b)=>p.indexOf(a)-p.indexOf(b))[0]})()")
                page.locator(f'[data-upgrade="{choice}"]').click();continue
            if s['phase']=='aim':
                aim=page.evaluate("(()=>{const g=__nightmarket.engine;const e=[...g.enemies].sort((a,b)=>(b.y*1.2+(b.type==='boss'?58:b.type==='bomb'?85:0)-b.hp*.3)-(a.y*1.2+(a.type==='boss'?58:a.type==='bomb'?85:0)-a.hp*.3))[0];return [e.x+e.w/2,e.y+e.h/2]})()")
                click_aim(page,*aim);page.evaluate('__nightmarket.step(.45)')
                page.wait_for_timeout(25)
                if state(page)['wave']>=13 and not (EVIDENCE/'late-game-mobile.png').exists():page.screenshot(path=str(EVIDENCE/'late-game-mobile.png'))
                page.evaluate('__nightmarket.step(12)')
        check('full UI-driven engine run reaches settlement',state(page)['phase']=='end',state(page))
        report['fullRun']=page.evaluate('({seed:__nightmarket.engine.seed,victory:__nightmarket.engine.victory,score:__nightmarket.engine.score,wave:__nightmarket.engine.wave,combo:__nightmarket.engine.maxCombo,shots:__nightmarket.engine.shots,physicsSeconds:__nightmarket.engine.elapsed})')
        check('settlement records the run once',page.evaluate('__nightmarket.profile.runs')==1)
        page.screenshot(path=str(EVIDENCE/'result-mobile.png'))
        page.locator('[data-action="share"]').click();page.wait_for_selector('.share-image')
        check('canvas share card exists',page.locator('.share-image').get_attribute('src').startswith('blob:'))
        data=page.locator('.share-image').evaluate("async e=>{const b=await(await fetch(e.src)).blob();return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})}")
        (EVIDENCE/'example-score-card.png').write_bytes(base64.b64decode(data.split(',')[1]))
        page.locator('[data-action="close"]').click();page.locator('[data-action="same-seed"]').click()
        check('same seed restarts with clean state and correct analytics',state(page)['shots']==0 and page.evaluate('__nightmarket.engine.seed')==42 and page.evaluate('__nightmarket.telemetry.events.filter(e=>e.name==="run_start").at(-1).data.seed')==42)
        page.locator('#board').focus();page.keyboard.press('ArrowLeft');page.keyboard.press('Space');check('keyboard can launch',state(page)['shots']==1)
        page.locator('#pause').click();page.locator('[data-action="abandon"]').click();check('abandon leads to loss settlement',state(page)['phase']=='end' and not page.evaluate('__nightmarket.engine.victory'))
        page.locator('[data-action="restart"]').click();check('restart from loss works',state(page)['phase']=='aim')
        for _ in range(12):page.evaluate('__nightmarket.begin("normal")')
        check('12 rapid restarts leave bounded entities',page.evaluate('__nightmarket.engine.enemies.length===7&&__nightmarket.engine.balls.length===0&&__nightmarket.engine.score===0'))
        page.locator('#pause').click();page.locator('[data-action="home"]').click();page.locator('#daily').click();seed=page.evaluate('__nightmarket.engine.seed');page.evaluate('__nightmarket.goHome()');page.locator('#daily').click()
        check('daily seed and cat fixed across restarts',page.evaluate('__nightmarket.engine.seed')==seed and page.evaluate('__nightmarket.engine.cat')=='mint')
        page.evaluate('__nightmarket.goHome()');page.locator('#records').click();check('local-only leaderboard label is honest','没有虚构全球排名' in page.locator('#modal').inner_text());page.locator('[data-action="close"]').click()
        page.locator('#endless').click();check('earned boss achievement unlocks endless',page.evaluate('__nightmarket.engine.mode')=='endless')
        # Artificial MAX LOAD scene tests rendering budgets, explicitly not organic gameplay.
        page.evaluate("(()=>{const g=__nightmarket.engine;g.enemies=[];g.build={wall:3,split:3,pierce:3,spark:3,blast:3,ice:3,laser:3,return:2,guard:3,firefly:3};g.wave=25;for(let r=0;r<5;r++)for(let c=0;c<7;c++)g.addEnemy(c,r,2000,(r+c)%4===0?'armor':'plain');__nightmarket.sync();__nightmarket.fire(80,200)})()")
        page.wait_for_timeout(2200);page.screenshot(path=str(EVIDENCE/'stress-mobile.png'))
        sample=page.evaluate('({frames:__nightmarket.frameTimes,balls:__nightmarket.engine.balls.length,particles:__nightmarket.renderer.particles.length,effects:__nightmarket.renderer.effects.length,dom:document.querySelectorAll("*").length})')
        frames=sample.pop('frames')[-110:];sample['medianFrameMs']=round(statistics.median(frames),2) if frames else None;sample['p95FrameMs']=round(sorted(frames)[int(len(frames)*.95)],2) if frames else None;sample['frameCount']=len(frames)
        report['headlessStress']=sample;report['headlessStress']['scope']='Artificial crowded scene, shared host Chromium, not a phone FPS claim'
        check('stress particles/entities stay capped',sample['balls']<=112 and sample['particles']<=220 and sample['effects']<=64)
        page.close();ctx.close()
        # Opaque origin naturally blocks localStorage here. The warning should not overlap controls.
        ctx=browser.new_context(viewport={'width':320,'height':568})
        blocked=load(ctx,None);check('unavailable storage displays a warning',blocked.locator('#storage-warning').is_visible())
        blocked.locator('#start').click();check('blocked storage still allows gameplay',state(blocked)['phase']=='aim')
        overlap=blocked.evaluate("(()=>{let a=document.querySelector('.game-footer').getBoundingClientRect(),b=document.querySelector('#storage-warning').getBoundingClientRect();return a.bottom>b.top+.5})()")
        check('storage warning does not overlap footer',not overlap)
        blocked.screenshot(path=str(EVIDENCE/'storage-fallback-small.png'));blocked.close()
        corrupt=load(ctx,{'miaotan-nightmarket-v1':'{invalid'});corrupt.locator('#start').click();check('corrupt saved JSON recovers to a playable game',state(corrupt)['phase']=='aim');corrupt.close();ctx.close()
        check('no uncaught page errors',len(report['pageErrors'])==0,report['pageErrors'])
        thirdparty=[u for u in report['networkRequests'] if u.startswith(('https:','http:'))]
        check('game makes no external HTTP requests',len(thirdparty)==0,thirdparty)
        browser.close()
except Exception as exc:
    report['failure']=str(exc);report['traceback']=traceback.format_exc();print(report['traceback'])
finally:
    report['executionSeconds']=round(time.monotonic()-started,2)
    report['passed']=sum(x['passed'] for x in report['checks']);report['failed']=sum(not x['passed'] for x in report['checks'])
    (EVIDENCE/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k in ['passed','failed','failure','fullRun','headlessStress','urlNavigation','executionSeconds']},ensure_ascii=False,indent=2))
    if 'failure' in report:raise SystemExit(1)
