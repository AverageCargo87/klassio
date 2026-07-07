// АВТОГЕНЕРАТ: не редактировать руками — источник = Claude Design прототип
// (Downloads/Klassio Demo (standalone).html), скрипт extract-demo.mjs (scratchpad).
// Лендинг отдаётся как готовый HTML (пиксель-в-пиксель с одобренным дизайном);
// скрипты исполняются, т.к. страница приходит полноценным SSR-HTML (не innerHTML).
// Ссылки уже переписаны: #signup→/register, #cabinet→/login.
export const LANDING_HTML = `<link rel="stylesheet" href="/demo/site.css">
<section class="screen active" data-screen="landing" data-screen-label="01 · Лендинг">
  <header class="ld-header" id="ld-header">
    <div class="ld-header-in">
      <a class="brand" href="/"><span class="mark"></span>классио</a>
      <nav class="top-actions">
        <div class="top-nav">
          <button type="button" data-scroll="ld-how">Как проходит урок</button>
          <button type="button" data-scroll="ld-subjects">Предметы</button>
          <button type="button" data-scroll="ld-parents">Родителям</button>
        </div>
        <a class="btn btn-quiet" href="/login">Войти</a>
        <a class="btn btn-accent" href="/register">Попробовать бесплатно</a>
      </nav>
    </div>
  </header>
  <div class="wrap-wide">

    <!-- Hero -->
    <div class="ld-hero">
      <div>
        <span class="ld-eyebrow rise" style="--d:.05s">AI-репетитор Аня · 1–7 класс</span>
        <h1 class="rise" style="--d:.1s">Живой урок с AI-репетитором. <em>Голосом.</em></h1>
        <p class="ld-sub rise" style="--d:.16s">Аня объяснит тему на интерактивной доске, спросит, поможет с ошибкой и похвалит — как настоящий учитель, один на один. Ребёнок просто разговаривает с ней вслух.</p>
        <div class="ld-cta rise" style="--d:.22s">
          <a class="btn btn-accent" href="/register">Начать учиться
            <svg class="ar" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>
          </a>
          <button class="btn btn-quiet" type="button" data-scroll="ld-how">Как проходит урок</button>
        </div>
        <p class="ld-cta-note rise" style="--d:.26s">Уроки по 15–20 минут · первый — бесплатно</p>
      </div>

      <!-- мини-мокап урока: доска + голосовой диалог -->
      <div class="ld-mockwrap rise" style="--d:.2s">
        <span class="ld-spark" style="left:-26px;top:44px;--d:.4s"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
        <span class="ld-spark" style="right:-18px;top:-16px;--d:1.2s"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
        <span class="ld-spark" style="right:52px;bottom:-24px;--d:2s;color:var(--av-2)"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>

        <div class="ld-mock">
          <div class="ld-mock-top">
            <span class="chip chip-mute">Урок 1 · Мир глазами астронома</span>
            <span class="who"><span class="orb" style="width:26px;height:26px"></span>Аня&nbsp;<span>· репетитор</span></span>
          </div>

          <div class="ld-board">
            <span class="lbl">Доска · Солнечная система</span>
            <svg viewBox="0 0 470 240" role="img" aria-label="Схема Солнечной системы на доске">
              <defs>
                <radialGradient id="ldsun" cx="38%" cy="34%" r="80%">
                  <stop offset="0%" stop-color="#F6C690"></stop><stop offset="100%" stop-color="#CC7A50"></stop>
                </radialGradient>
                <radialGradient id="ldp1" cx="35%" cy="30%" r="80%">
                  <stop offset="0%" stop-color="#CBDFF3"></stop><stop offset="100%" stop-color="#A6C6E9"></stop>
                </radialGradient>
                <radialGradient id="ldp2" cx="35%" cy="30%" r="80%">
                  <stop offset="0%" stop-color="#E2DDF6"></stop><stop offset="100%" stop-color="#C7C0EE"></stop>
                </radialGradient>
                <radialGradient id="ldp3" cx="35%" cy="30%" r="80%">
                  <stop offset="0%" stop-color="#EBC3A4"></stop><stop offset="100%" stop-color="#DBA07A"></stop>
                </radialGradient>
              </defs>
              <circle cx="42" cy="122" r="86" fill="rgba(204,122,80,.16)"></circle>
              <circle cx="42" cy="122" r="60" fill="url(#ldsun)"></circle>
              <circle cx="42" cy="122" r="118" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.5"></circle>
              <circle cx="42" cy="122" r="178" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.5"></circle>
              <circle cx="42" cy="122" r="242" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1.5"></circle>
              <circle cx="138" cy="52" r="10" fill="url(#ldp3)"></circle>
              <circle cx="205" cy="182" r="14" fill="url(#ldp1)"></circle>
              <ellipse cx="205" cy="182" rx="26" ry="7.5" fill="none" stroke="#DBA07A" stroke-width="2" transform="rotate(-18 205 182)"></ellipse>
              <circle cx="286" cy="48" r="7.5" fill="url(#ldp2)"></circle>
              <path d="M352 172c.7 4.8 3.4 7.5 8.2 8.2-4.8.7-7.5 3.4-8.2 8.2-.7-4.8-3.4-7.5-8.2-8.2 4.8-.7 7.5-3.4 8.2-8.2z" fill="#DBA07A" opacity=".85"></path>
              <path d="M408 42c.6 4 2.9 6.3 6.9 6.9-4 .6-6.3 2.9-6.9 6.9-.6-4-2.9-6.3-6.9-6.9 4-.6 6.3-2.9 6.9-6.9z" fill="#C7C0EE" opacity=".9"></path>
            </svg>
          </div>

          <div class="ld-mock-chat">
            <div class="ld-mb tutor">
              <span class="who">Аня</span>
              <span class="body">Почему днём мы видим Солнце, но не видим другие звёзды?</span>
            </div>
            <div class="ld-mb child">
              <span class="who">Ученик · голосом</span>
              <span class="body">Потому что Солнце светит ярче всех!</span>
            </div>
          </div>

          <div class="ld-mock-mic">
            <span class="ld-mic"><span class="halo"></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"></path><line x1="12" y1="18" x2="12" y2="21.5"></line></svg>
            </span>
            <span class="cap"><i></i>Аня слушает…</span>
          </div>
        </div>
      </div>
    </div>

    <!-- факты -->
    <div class="ld-facts rise" style="--d:.1s">
      <div class="ld-fact"><b>15–20 минут</b><span>длится урок — ровно столько, сколько держится детское внимание</span></div>
      <div class="ld-fact"><b>Один на один</b><span>Аня слушает, отвечает и хвалит голосом — без класса и очереди</span></div>
      <div class="ld-fact"><b>Каждый урок</b><span>записывается: родители видят диалог, ошибки и итоги</span></div>
    </div>

    <!-- Как проходит урок -->
    <div class="ld-sec" id="ld-how">
      <div class="ld-sec-head">
        <div>
          <span class="kicker">Как проходит урок</span>
          <h2>Как с настоящим учителем — только всегда рядом</h2>
        </div>
        <span class="ld-sec-num">01</span>
      </div>

      <div class="ld-how" id="ld-how-demo">
        <div class="ld-how-left">
          <div class="ld-track"><i></i></div>
          <div class="ld-hstep on">
            <span class="n">01 · Голос</span>
            <h3>Аня ведёт диалог вслух</h3>
            <p>Здоровается, объясняет и слушает. Ребёнок отвечает голосом — без кнопок и клавиатуры.</p>
          </div>
          <div class="ld-hstep">
            <span class="n">02 · Доска</span>
            <h3>Тема оживает на доске</h3>
            <p>Солнце, орбиты и звёзды появляются, пока Аня рассказывает. Чат отъезжает в сторону — внимание на доске.</p>
          </div>
          <div class="ld-hstep">
            <span class="n">03 · Тренажёр</span>
            <h3>Закрепляем сразу</h3>
            <p>Ошибся — не страшно: Аня мягко подскажет и даст вторую попытку. Верный ответ — похвала.</p>
          </div>
          <div class="ld-hstep">
            <span class="n">04 · Запись</span>
            <h3>Итоги — родителям</h3>
            <p>Ребёнку — награда. Вам — запись урока с ошибками и комментарием Ани в кабинете.</p>
          </div>
        </div>

        <div class="ld-how-right">
          <div class="ld-stage">
            <div class="ls-top">
              <span class="chip chip-mute">Урок 1 · Мир глазами астронома</span>
              <span class="who"><span class="orb" style="width:26px;height:26px"></span>Аня <span class="st"><i></i>говорит…</span></span>
            </div>
            <div class="ls-scene">
              <div class="ls-chat">
                <div class="ld-mb tutor ls-b1"><span class="who">Аня</span><span class="body">Привет! Я Аня. Сегодня посмотрим на мир глазами астронома.</span></div>
                <div class="ld-mb tutor ls-b2"><span class="who">Аня</span><span class="body">Почему днём мы видим Солнце, но не видим другие звёзды?</span></div>
                <div class="ld-mb child ls-b3"><span class="who">Ученик · голосом</span><span class="body">Потому что Солнце светит ярче всех!</span></div>
                <div class="ld-mb tutor ls-b4"><span class="who">Аня</span><span class="body">Верно! Его свет просто затмевает остальные звёзды.</span></div>
              </div>

              <div class="ls-board">
                <div class="ld-board">
                  <span class="lbl">Доска · Солнечная система</span>
                  <svg viewBox="0 0 470 240" role="img" aria-label="Схема Солнечной системы на доске">
                    <defs>
                      <radialGradient id="lssun" cx="38%" cy="34%" r="80%">
                        <stop offset="0%" stop-color="#F6C690"></stop><stop offset="100%" stop-color="#CC7A50"></stop>
                      </radialGradient>
                      <radialGradient id="lsp1" cx="35%" cy="30%" r="80%">
                        <stop offset="0%" stop-color="#CBDFF3"></stop><stop offset="100%" stop-color="#A6C6E9"></stop>
                      </radialGradient>
                      <radialGradient id="lsp2" cx="35%" cy="30%" r="80%">
                        <stop offset="0%" stop-color="#E2DDF6"></stop><stop offset="100%" stop-color="#C7C0EE"></stop>
                      </radialGradient>
                      <radialGradient id="lsp3" cx="35%" cy="30%" r="80%">
                        <stop offset="0%" stop-color="#EBC3A4"></stop><stop offset="100%" stop-color="#DBA07A"></stop>
                      </radialGradient>
                    </defs>
                    <circle cx="42" cy="122" r="86" fill="rgba(204,122,80,.16)"></circle>
                    <circle cx="42" cy="122" r="60" fill="url(#lssun)"></circle>
                    <circle cx="42" cy="122" r="118" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.5"></circle>
                    <circle cx="42" cy="122" r="178" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.5"></circle>
                    <circle cx="42" cy="122" r="242" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1.5"></circle>
                    <circle cx="138" cy="52" r="10" fill="url(#lsp3)"></circle>
                    <circle cx="205" cy="182" r="14" fill="url(#lsp1)"></circle>
                    <ellipse cx="205" cy="182" rx="26" ry="7.5" fill="none" stroke="#DBA07A" stroke-width="2" transform="rotate(-18 205 182)"></ellipse>
                    <circle cx="286" cy="48" r="7.5" fill="url(#lsp2)"></circle>
                    <path d="M352 172c.7 4.8 3.4 7.5 8.2 8.2-4.8.7-7.5 3.4-8.2 8.2-.7-4.8-3.4-7.5-8.2-8.2 4.8-.7 7.5-3.4 8.2-8.2z" fill="#DBA07A" opacity=".85"></path>
                    <path d="M408 42c.6 4 2.9 6.3 6.9 6.9-4 .6-6.3 2.9-6.9 6.9-.6-4-2.9-6.3-6.9-6.9 4-.6 6.3-2.9 6.9-6.9z" fill="#C7C0EE" opacity=".9"></path>
                  </svg>
                </div>
              </div>

              <div class="ls-task">
                <span class="tag">Тренажёр · задание 3</span>
                <p class="q">Солнце — это…</p>
                <div class="ls-opt"><span class="mark"></span>Планета
                  <span class="ls-ov wrong"><span class="mark">✕</span>Планета</span>
                </div>
                <div class="ls-opt"><span class="mark"></span>Звезда
                  <span class="ls-ov correct"><span class="mark">✓</span>Звезда</span>
                </div>
                <div class="ls-opt"><span class="mark"></span>Комета</div>
                <div class="ls-hint">Подсказка: оно светит само, а планеты только отражают свет.</div>
              </div>

              <div class="ls-reward">
                <svg class="rstar ls-rstar" width="58" height="58" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7L12 3z"></path></svg>
                <h4>Урок пройден!</h4>
                <p>Запись и итоги уже в кабинете родителей.</p>
                <div class="chips"><span class="chip">13/13 заданий</span><span class="chip">18 минут</span></div>
              </div>
            </div>

            <div class="ls-dock">
              <span class="ld-mic"><span class="halo"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"></path><line x1="12" y1="18" x2="12" y2="21.5"></line></svg>
              </span>
              <span class="cap"><i></i>Скажи ответ вслух — Аня слышит</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Предметы -->
    <div class="ld-sec" id="ld-subjects">
      <div class="ld-sec-head">
        <div>
          <span class="kicker">Предметы</span>
          <h2>Каталог растёт каждую неделю</h2>
        </div>
        <span class="ld-sec-num">02</span>
      </div>

      <div class="ld-subjects">
        <div class="ld-subj">
          <div class="ld-subj-head">
            <span class="icopad"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><circle cx="12" cy="6.5" r="1.6" fill="currentColor" stroke="none"></circle><circle cx="12" cy="17.5" r="1.6" fill="currentColor" stroke="none"></circle></svg></span>
            <h3>Математика</h3>
            <span class="chip chip-mute">5 класс</span>
          </div>
          <div class="ld-lesson"><span class="nm">Сложение в столбик</span><span class="chip chip-mute">скоро</span></div>
          <div class="ld-lesson"><span class="nm">Вычитание в столбик</span><span class="chip chip-mute">скоро</span></div>
        </div>
        <div class="ld-subj">
          <div class="ld-subj-head">
            <span class="icopad"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><path d="M3.6 14.8c-1.1-.9-1.7-1.8-1.5-2.6.4-1.7 4.3-2.4 9.9-1.2 5.6 1.2 10.1 3.2 9.7 4.9-.2.9-1.5 1.4-3.5 1.5" transform="rotate(-14 12 12)"></path></svg></span>
            <h3>Окружающий мир</h3>
            <span class="chip chip-mute">4 класс</span>
          </div>
          <div class="ld-lesson"><span class="nm">Мир глазами астронома</span><span class="st-ok"><span class="dot-ok"></span>доступен</span></div>
          <div class="ld-lesson"><span class="nm">Планеты Солнечной системы</span><span class="chip chip-mute">скоро</span></div>
          <div class="ld-lesson"><span class="nm">Звёздное небо</span><span class="chip chip-mute">скоро</span></div>
        </div>
      </div>

      <!-- партнёрский блок ВТБ (Мир 2) -->
      <div class="vtb ld-fin">
        <div class="vtb-panel">
          <div class="vtb-head">
            <span class="vtb-mark"></span>
            <span class="vtb-title">Финансовая грамотность</span>
            <span class="vtb-chip">при поддержке ВТБ</span>
            <span class="vtb-note" style="margin-left:auto">уроки ведёт Аня — как и весь Klassio</span>
          </div>
          <div class="ld-fin-grid">
            <div class="vtb-lesson">
              <span class="vtb-tag hot">Новый урок</span>
              <h3>Твоя первая банковская карта</h3>
              <p class="sub">Оплата, приложение, безопасность и кешбэк — на доске с картой-котом.</p>
              <div class="ld-fin-card-art">
                <div class="kcard kfloat" style="width:176px;height:109px;font-size:53px">
                  <span class="kchip"></span>
                  <span class="bank">ВТБ</span>
                  <span class="cat"><span class="face"><span class="ear l"></span><span class="ear r"></span><span class="eye l"></span><span class="eye r"></span><span class="nose"></span><span class="mouth"></span><span class="wh wl1"></span><span class="wh wl2"></span><span class="wh wr1"></span><span class="wh wr2"></span></span></span>
                  <span class="num">0000 1111 2222 3333</span>
                  <span class="nm">MISHA</span>
                  <span class="mir">МИР</span>
                </div>
              </div>
            </div>
            <div class="vtb-lesson">
              <span class="vtb-tag">Урок</span>
              <h3>Инвестиции для начинающих</h3>
              <p class="sub">Как деньги растут: копилка, вклад и первый портфель.</p>
              <div class="ld-fin-card-art">
                <svg width="190" height="104" viewBox="0 0 190 104" role="img" aria-label="График роста">
                  <path d="M10 88 L48 66 L82 74 L120 44 L150 52 L180 18" fill="none" stroke="#8FB4FF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="48" cy="66" r="4" fill="#DCE7FF"></circle>
                  <circle cx="120" cy="44" r="4" fill="#DCE7FF"></circle>
                  <circle cx="180" cy="18" r="6" fill="#fff"></circle>
                  <circle cx="180" cy="18" r="11" fill="none" stroke="rgba(220,231,255,.4)" stroke-width="2"></circle>
                  <circle cx="26" cy="34" r="13" fill="#F6D77C" stroke="#E3B54A" stroke-width="2"></circle>
                  <text x="26" y="39" text-anchor="middle" font-size="13" font-weight="800" fill="#8A6420" font-family="Onest,sans-serif">₽</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Родителям -->
    <div class="ld-parents" id="ld-parents">
      <span class="star" style="right:46px;top:36px"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
      <span class="star" style="right:118px;bottom:48px;opacity:.3"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
      <span class="kicker">Родителям</span>
      <h2>Вы всегда знаете, как прошёл урок</h2>
      <div class="ld-parents-grid">
        <div>
          <span class="n">01</span>
          <h3>Каждый урок — под запись</h3>
          <p>Полный диалог, ошибки и комментарий Ани — в кабинете сразу после занятия.</p>
        </div>
        <div>
          <span class="n">02</span>
          <h3>Вы решаете</h3>
          <p>Лимиты времени, темы и расписание настраиваются в кабинете родителя.</p>
        </div>
        <div>
          <span class="n">03</span>
          <h3>Безопасно</h3>
          <p>Ребёнок занимается дома, без чужих взрослых и незнакомцев в чате.</p>
        </div>
      </div>
    </div>

    <!-- финальный CTA -->
    <div class="ld-final">
      <span class="star" style="left:64px;top:44px;opacity:.5"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
      <span class="star" style="right:78px;bottom:52px;opacity:.4;color:var(--av-2)"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
      <h2>Первый урок — бесплатно</h2>
      <p>Регистрация за минуту. Аня сама познакомится с ребёнком и подберёт темп.</p>
      <a class="btn btn-accent" href="/register" style="padding:16px 30px;font-size:16px">Создать кабинет
        <svg class="ar" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>
      </a>
    </div>

    <footer class="ld-foot">
      <span class="brand"><span class="mark"></span>классио</span>
      <span>© 2026 классио · AI-репетитор для школьников</span>
    </footer>
  </div>
</section>
<script src="/demo/anim-a.js"></script>
<script src="/demo/anim-b.js"></script>
<script src="/demo/landing.js" defer></script>`
