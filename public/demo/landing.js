// Лендинг Klassio: sticky-шапка, плавный скролл, GSAP-сцена «как проходит урок».
// Вырезано из Claude Design прототипа; см. scripts/claude-design-prompt-platform-screens.md.
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


/* ─────────── «Как проходит урок»: GSAP-сцена урока ─────────── */
(function(){
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
})();

