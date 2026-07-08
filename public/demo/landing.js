// Лендинг Klassio (v3, тёмная тема) — АВТОГЕНЕРАТ (scripts extract-demo-v3.mjs).
// Роутинг/анимации/«видео»-превью урока/GSAP-сцена «как проходит урок».
// Блоки регистрации/кабинета/табов/тостов исключены — их элементов на / нет.
const SCREENS = ['landing','signup','cabinet','record'];
function playRise(scr){
  if(!scr || !('animate' in Element.prototype)) return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const anims = [];
  scr.querySelectorAll('.rise').forEach(el => {
    const d = (parseFloat(el.style.getPropertyValue('--d')) || 0) * 1000;
    anims.push(el.animate(
      [{opacity:0, transform:'translateY(16px)'}, {opacity:1, transform:'none'}],
      {duration:550, delay:d, easing:'cubic-bezier(.4,0,.2,1)', fill:'backwards'}
    ));
  });
  /* страховка: если таймлайн завис — принудительно доводим до конца */
  setTimeout(() => anims.forEach(a => { try{ if(a.playState !== 'finished') a.finish(); }catch(e){} }), 1600);
}
function route(){
  let h = (location.hash || '#landing').slice(1);
  if(!SCREENS.includes(h)) h = 'landing';
  let changed = null;
  document.querySelectorAll('.screen').forEach(s => {
    const on = s.dataset.screen === h;
    if(on && !s.classList.contains('active')) changed = s;
    s.classList.toggle('active', on);
  });
  playRise(changed);
  document.body.classList.toggle('on-landing', h === 'landing' || h === 'signup');
  window.scrollTo(0, 0);
  if(window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh());
}
window.addEventListener('hashchange', route);


/* ─────────── плавный скролл к секциям лендинга ─────────── */
document.querySelectorAll('[data-scroll]').forEach(b =>
  b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.scroll);
    if(!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 92;
    window.scrollTo({ top, behavior: 'smooth' });
  })
);

/* ─────────── sticky-шапка: тень при скролле ─────────── */
const ldHeader = document.getElementById('ld-header');
window.addEventListener('scroll', () => {
  if(ldHeader) ldHeader.classList.toggle('scrolled', window.scrollY > 8);
}, { passive:true });

/* ─────────── hero: «видео» урока — автопроигрываемая демонстрация ─────────── */
function initLvVideo(){
  const win = document.getElementById('lv-win');
  if(!win) return;
  if(!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches){
    win.classList.add('static');
    return;
  }
  const cap  = document.getElementById('lv-cap');
  const segs = [...document.querySelectorAll('#lv-progress .lv-seg')];
  const timer = document.getElementById('lv-timer');
  const setCap = t => { if(cap) cap.textContent = t; };

  gsap.set('.lv-task', { xPercent:-50, yPercent:-50, y:26, scale:.96 });
  gsap.set('.lv-board', { y:24, scale:.97 });
  gsap.set('.lv-chat', { y:18 });

  const tl = gsap.timeline({ repeat:-1, repeatDelay:1.1, defaults:{ ease:'power2.out' } });

  /* Сцена 1 · Голос */
  tl.addLabel('voice')
    .call(() => setCap('говорит…'))
    .set('.lv-voice', { autoAlpha:1 })
    .from('.lv-orb', { scale:.6, autoAlpha:0, duration:.8, ease:'back.out(1.6)' })
    .from('.lv-wave', { autoAlpha:0, duration:.4 }, '-=.3')
    .from('.lv-g1', { y:16, autoAlpha:0, duration:.55 }, '-=.1')
    .from('.lv-g2', { y:16, autoAlpha:0, duration:.55 }, '+=1.2')
    .call(() => setCap('слушает…'))
    .to({}, { duration:1.4 })

  /* Сцена 2 · Доска */
    .addLabel('board')
    .call(() => setCap('открывает доску…'))
    .to('.lv-voice', { autoAlpha:0, y:-16, duration:.5, ease:'power2.in' })
    .set('.lv-voice', { y:0 })
    .to('.lv-chat', { autoAlpha:1, y:0, duration:.55 })
    .to('.lv-board', { autoAlpha:1, y:0, scale:1, duration:.7 }, '-=.25')
    .from('.lv-sun', { scale:0, transformOrigin:'center', duration:.7, ease:'back.out(1.5)' }, '-=.2')
    .from('.lv-orbit', { scale:.6, autoAlpha:0, transformOrigin:'center', stagger:.14, duration:.6 }, '-=.4')
    .from('.lv-planet', { scale:0, autoAlpha:0, transformOrigin:'center', stagger:.13, duration:.5, ease:'back.out(2)' }, '-=.3')
    .from('.lv-b3', { y:14, autoAlpha:0, duration:.5 }, '-=.2')
    .call(() => setCap('объясняет…'))
    .to({}, { duration:1.6 })

  /* Сцена 3 · Тренажёр */
    .addLabel('task')
    .call(() => setCap('задаёт вопрос…'))
    .to(['.lv-board','.lv-chat'], { autoAlpha:0, y:-16, duration:.5, ease:'power2.in' })
    .to('.lv-task', { autoAlpha:1, y:0, scale:1, duration:.65 })
    .to('.lv-ov-wrong', { opacity:1, duration:.3 }, '+=1.1')
    .call(() => setCap('подсказывает…'))
    .from('.lv-hint', { y:12, autoAlpha:0, duration:.45 }, '+=.4')
    .to('.lv-ov-correct', { opacity:1, duration:.35 }, '+=1.2')
    .call(() => setCap('хвалит!'))
    .to({}, { duration:1 })

  /* Сцена 4 · Награда и запись */
    .addLabel('reward')
    .to('.lv-task', { autoAlpha:0, y:-14, duration:.5, ease:'power2.in' })
    .to('.lv-reward', { autoAlpha:1, duration:.35 })
    .from('.lv-rstar', { scale:0, rotate:-40, duration:.7, ease:'back.out(1.8)' }, '-=.1')
    .from('.lv-rh', { y:14, autoAlpha:0, duration:.4 }, '-=.25')
    .from('.lv-rp', { y:12, autoAlpha:0, duration:.4 }, '-=.2')
    .from('.lv-rc', { y:10, autoAlpha:0, stagger:.12, duration:.35 }, '-=.15')
    .call(() => setCap('урок завершён'))
    .to({}, { duration:1.9 })
    .to('.lv-reward', { autoAlpha:0, duration:.5, ease:'power2.in' })
    .addLabel('end');

  /* прогресс-сегменты + таймер записи */
  const bounds = () => {
    const L = tl.labels;
    return [L.voice, L.board, L.task, L.reward, L.end];
  };
  tl.eventCallback('onUpdate', () => {
    const t = tl.time(), b = bounds();
    segs.forEach((seg, i) => {
      const a = b[i], z = b[i+1];
      const p = Math.min(1, Math.max(0, (t - a) / (z - a)));
      seg.querySelector('.bar i').style.transform = 'scaleX(' + p + ')';
      seg.classList.toggle('on', t >= a && t < z);
    });
    if(timer){
      const s = Math.floor(tl.totalTime());
      timer.textContent = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
    }
  });

  /* плей/пауза */
  const pp = document.getElementById('lv-pp');
  const icPause = document.getElementById('lv-pp-pause');
  const icPlay  = document.getElementById('lv-pp-play');
  if(pp) pp.addEventListener('click', () => {
    const paused = !tl.paused();
    tl.paused(paused);
    win.classList.toggle('paused', paused);
    icPause.hidden = paused;
    icPlay.hidden = !paused;
    pp.setAttribute('aria-label', paused ? 'Воспроизвести' : 'Пауза');
  });
}

/* ─────────── «Как проходит урок»: GSAP-сцена урока ─────────── */
function initHowScene(){
  const how = document.getElementById('ld-how-demo');
  if(!how) return;
  const steps = [...how.querySelectorAll('.ld-hstep')];
  const fill  = how.querySelector('.ld-track i');
  const setStep = p => {
    const idx = p < .3 ? 0 : p < .56 ? 1 : p < .84 ? 2 : 3;
    steps.forEach((s,i) => s.classList.toggle('on', i === idx));
    if(fill) fill.style.transform = 'scaleY(' + p + ')';
  };
  const makeStatic = () => {
    how.classList.add('static');
    steps.forEach(s => s.classList.add('on'));
    if(fill) fill.style.transform = 'scaleY(1)';
  };
  if(!(window.gsap && window.ScrollTrigger) || matchMedia('(prefers-reduced-motion: reduce)').matches){
    makeStatic();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add('(max-width:1020px)', () => { makeStatic(); });
  mm.add('(min-width:1021px)', () => {
    how.classList.remove('static');
    gsap.set('.ls-chat', { xPercent:-50 });
    gsap.set(['.ls-board','.ls-task'], { y:26, scale:.965 });
    const tl = gsap.timeline({
      defaults:{ ease:'power2.out' },
      scrollTrigger:{
        trigger:'#ld-how-demo', start:'top 100px', end:'+=2400',
        pin:true, scrub:.55, anticipatePin:1,
        onUpdate:self => setStep(self.progress)
      }
    });
    tl.from('.ls-b1', { y:20, autoAlpha:0, duration:.5 })
      .from('.ls-b2', { y:20, autoAlpha:0, duration:.5 }, '+=.35')
      .from('.ls-b3', { y:20, autoAlpha:0, duration:.5 }, '+=.45')
      .addLabel('board', '+=.55')
      .to('.ls-chat', { left:'4%', xPercent:0, scale:.8, transformOrigin:'left top', duration:.9, ease:'power2.inOut' }, 'board')
      .to('.ls-board', { autoAlpha:1, y:0, scale:1, duration:.8 }, 'board+=.25')
      .from('.ls-b4', { y:20, autoAlpha:0, duration:.5 }, 'board+=.9')
      .addLabel('task', '+=.8')
      .to('.ls-board', { autoAlpha:0, y:-18, duration:.55 }, 'task')
      .to('.ls-task', { autoAlpha:1, y:0, scale:1, duration:.7 }, 'task+=.3')
      .to('.ls-ov.wrong', { opacity:1, duration:.3 }, '+=.5')
      .from('.ls-hint', { y:12, autoAlpha:0, duration:.45 }, '+=.3')
      .to('.ls-ov.correct', { opacity:1, duration:.35 }, '+=.5')
      .addLabel('reward', '+=.8')
      .to(['.ls-task','.ls-chat'], { autoAlpha:0, y:-14, duration:.5 }, 'reward')
      .to('.ls-reward', { autoAlpha:1, duration:.4 }, 'reward+=.35')
      .from('.ls-rstar', { scale:0, rotate:-40, ease:'back.out(1.8)', duration:.7 }, 'reward+=.35')
      .from('.ls-reward h4', { y:14, autoAlpha:0, duration:.4 }, 'reward+=.7')
      .from('.ls-reward p', { y:12, autoAlpha:0, duration:.4 }, 'reward+=.85')
      .from('.ls-reward .chip', { y:10, autoAlpha:0, stagger:.12, duration:.35 }, 'reward+=1')
      .to({}, { duration:.6 });
    setStep(0);
  });
}

/* GSAP грузится с defer — инициализируем сцены после его выполнения */
function initFx(){ initLvVideo(); initHowScene(); }
if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', initFx); }
else{ initFx(); }


route();