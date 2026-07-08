// АВТОГЕНЕРАТ: не редактировать руками — источник = Claude Design v3 прототип
// (Downloads/Klassio Demo v3 (standalone).html), скрипт extract-demo-v3.mjs.
// Тёмная тема (.screen dk). Ссылки переписаны: #signup→/register, #cabinet→/login.
export const LANDING_HTML = `<link rel="stylesheet" href="/demo/site.css">
<section class="screen dk active" data-screen="landing" data-screen-label="01 · Лендинг">
  <div class="ld-stars" aria-hidden="true"></div>
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

      <!-- «видео» урока: автопроигрываемая демонстрация урока -->
      <div class="ld-video rise" style="--d:.32s">
        <span class="ld-spark" style="left:-34px;top:-22px;--d:.4s"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>
        <span class="ld-spark" style="right:-26px;top:136px;--d:1.3s;color:var(--av-2)"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z"></path></svg></span>

        <div class="lv-win" id="lv-win">
          <div class="lv-chrome">
            <span class="lv-dots"><i></i><i></i><i></i></span>
            <span class="lv-title">Klassio · Окружающий мир · «Мир глазами астронома»</span>
            <span class="lv-rec"><i></i>запись · <b id="lv-timer">00:00</b></span>
          </div>

          <div class="lv-canvas">
            <div class="lv-top">
              <span class="chip chip-mute">Урок 1 · 4 класс</span>
              <span class="who"><span class="orb" style="width:26px;height:26px"></span>Аня <span class="st"><i></i><span id="lv-cap">говорит…</span></span></span>
            </div>

            <div class="lv-stage">
              <!-- Сцена 1 · Голос -->
              <div class="lv-voice">
                <span class="orb lv-orb"></span>
                <span class="lv-wave"><i></i><i></i><i></i><i></i><i></i></span>
                <div class="ld-mb tutor lv-g1"><span class="who">Аня</span><span class="body">Привет! Я Аня. Сегодня посмотрим на мир глазами астронома.</span></div>
                <div class="ld-mb child lv-g2"><span class="who">Ученик · голосом</span><span class="body">Привет! А кто такой астроном?</span></div>
              </div>

              <!-- Сцена 2 · Доска -->
              <div class="lv-chat">
                <div class="ld-mb tutor lv-b2"><span class="who">Аня</span><span class="body">Астроном изучает звёзды и планеты. Смотри на доску!</span></div>
                <div class="ld-mb tutor lv-b3"><span class="who">Аня</span><span class="body">В центре — Солнце. Это звезда, и она светит сама.</span></div>
              </div>
              <div class="lv-board">
                <div class="ld-board">
                  <span class="lbl">Доска · Солнечная система</span>
                  <svg viewBox="0 0 470 250" role="img" aria-label="Доска: Солнечная система">
                    <defs>
                      <radialGradient id="lvsun" cx="38%" cy="34%" r="80%"><stop offset="0%" stop-color="#F6C690"></stop><stop offset="100%" stop-color="#CC7A50"></stop></radialGradient>
                      <radialGradient id="lvp1" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#CBDFF3"></stop><stop offset="100%" stop-color="#A6C6E9"></stop></radialGradient>
                      <radialGradient id="lvp2" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#E2DDF6"></stop><stop offset="100%" stop-color="#C7C0EE"></stop></radialGradient>
                      <radialGradient id="lvp3" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#EBC3A4"></stop><stop offset="100%" stop-color="#DBA07A"></stop></radialGradient>
                    </defs>
                    <circle class="lv-sun" cx="46" cy="128" r="88" fill="rgba(204,122,80,.16)"></circle>
                    <circle class="lv-sun" cx="46" cy="128" r="62" fill="url(#lvsun)"></circle>
                    <circle class="lv-orbit" cx="46" cy="128" r="120" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.5"></circle>
                    <circle class="lv-orbit" cx="46" cy="128" r="182" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.5"></circle>
                    <circle class="lv-orbit" cx="46" cy="128" r="248" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1.5"></circle>
                    <circle class="lv-planet" cx="144" cy="56" r="10" fill="url(#lvp3)"></circle>
                    <g class="lv-planet"><circle cx="212" cy="190" r="14" fill="url(#lvp1)"></circle><ellipse cx="212" cy="190" rx="27" ry="8" fill="none" stroke="#DBA07A" stroke-width="2" transform="rotate(-18 212 190)"></ellipse></g>
                    <circle class="lv-planet" cx="296" cy="50" r="7.5" fill="url(#lvp2)"></circle>
                    <path class="lv-planet" d="M366 178c.7 4.8 3.4 7.5 8.2 8.2-4.8.7-7.5 3.4-8.2 8.2-.7-4.8-3.4-7.5-8.2-8.2 4.8-.7 7.5-3.4 8.2-8.2z" fill="#DBA07A" opacity=".85"></path>
                    <path class="lv-planet" d="M422 46c.6 4 2.9 6.3 6.9 6.9-4 .6-6.3 2.9-6.9 6.9-.6-4-2.9-6.3-6.9-6.9 4-.6 6.3-2.9 6.9-6.9z" fill="#C7C0EE" opacity=".9"></path>
                  </svg>
                </div>
              </div>

              <!-- Сцена 3 · Тренажёр -->
              <div class="ls-task lv-task">
                <span class="tag">Тренажёр · задание 3</span>
                <p class="q">Солнце — это…</p>
                <div class="ls-opt"><span class="mark"></span>Планета
                  <span class="ls-ov wrong lv-ov-wrong"><span class="mark">✕</span>Планета</span>
                </div>
                <div class="ls-opt"><span class="mark"></span>Звезда
                  <span class="ls-ov correct lv-ov-correct"><span class="mark">✓</span>Звезда</span>
                </div>
                <div class="ls-opt"><span class="mark"></span>Комета</div>
                <div class="ls-hint lv-hint">Аня: не спеши. Оно светит само, а планеты только отражают свет.</div>
              </div>

              <!-- Сцена 4 · Награда -->
              <div class="ls-reward lv-reward">
                <svg class="rstar lv-rstar" width="58" height="58" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7L12 3z"></path></svg>
                <h4 class="lv-rh">Урок пройден!</h4>
                <p class="lv-rp">Запись и итоги уже в кабинете родителей.</p>
                <div class="chips"><span class="chip lv-rc">13/13 заданий</span><span class="chip lv-rc">18 минут</span></div>
              </div>
            </div>

            <div class="lv-dock">
              <span class="ld-mic"><span class="halo"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"></rect><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"></path><line x1="12" y1="18" x2="12" y2="21.5"></line></svg>
              </span>
              <span class="cap"><i></i>Ребёнок отвечает голосом — без кнопок</span>
            </div>

            <button class="lv-pp" id="lv-pp" type="button" aria-label="Пауза">
              <svg id="lv-pp-pause" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1.4"></rect><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4"></rect></svg>
              <svg id="lv-pp-play" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" hidden=""><path d="M8 5.2v13.6c0 .9 1 1.5 1.8 1L20 13c.8-.5.8-1.6 0-2.1L9.8 4.3c-.8-.5-1.8 0-1.8.9z"></path></svg>
            </button>
          </div>

          <div class="lv-progress" id="lv-progress">
            <span class="lv-seg"><span class="bar"><i></i></span><span class="lb">Голос</span></span>
            <span class="lv-seg"><span class="bar"><i></i></span><span class="lb">Доска</span></span>
            <span class="lv-seg"><span class="bar"><i></i></span><span class="lb">Тренажёр</span></span>
            <span class="lv-seg"><span class="bar"><i></i></span><span class="lb">Запись</span></span>
          </div>
        </div>

        <p class="ld-video-cap">Фрагмент урока «Мир глазами астронома» · 4 класс</p>
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
