// components/lesson-v2/teacher-script.ts
// Local mocked teacher messages — used in Stage 1 (UI port).
// Stage 3 will replace these with real 11labs message events from cloud agent Nadya.
// Kept here for prototype parity; in production these strings should NOT appear in
// chat — Nadya generates her own based on the system prompt + draw_explanation outputs.

export const TEACHER_SCRIPT = {
  welcome:
    'Привет! Меня зовут Надя, я помогу с этим уроком. Если что — нажми микрофон и спроси меня вслух.',
  introStart: 'Сейчас я коротко расскажу теорию, а потом перейдём к заданиям.',
  taskStart: 'Поехали! Записывай ответ в поле и нажимай «Проверить».',
  hintReveal: 'Подсказка тебе в помощь — прочитай не спеша.',
  drawCall: 'Давай я покажу это на доске — так понятнее.',
  correct: [
    'Точно!',
    'Огонь!',
    'Так держать!',
    'Красиво решил!',
    'Без ошибок!',
  ],
  wrong: [
    'Почти! Попробуй ещё раз.',
    'Не страшно — посмотри на подсказку.',
    'Чуть-чуть мимо. Перепроверь разряды.',
  ],
  micOn: 'Слушаю тебя. Говори громко и не торопись.',
  micOff: 'Микрофон выключен. Включи, когда захочешь поговорить.',
  finish: 'Урок окончен. Ты молодец!',
} as const
