// components/lesson-v2/teacher-script.ts
// Local mocked teacher messages — used in Stage 1 (UI port) and as pre-session
// greeting before the real 11labs session takes over. The greeting picks up
// the selected persona name (Надя / Аня) from the voice picker via buildTeacherScript.

interface TeacherScriptArgs {
  /** Persona name in nominative — e.g. 'Надя' or 'Аня'. */
  name: string
}

export function buildTeacherScript({ name }: TeacherScriptArgs) {
  return {
    welcome: `Привет! Меня зовут ${name}, я помогу с этим уроком. Если что — нажми микрофон и спроси меня вслух.`,
    introStart: 'Сейчас я коротко расскажу теорию, а потом перейдём к заданиям.',
    taskStart: 'Поехали! Записывай ответ в поле и нажимай «Проверить».',
    hintReveal: 'Подсказка тебе в помощь — прочитай не спеша.',
    drawCall: 'Давай я покажу это на доске — так понятнее.',
    correct: ['Точно!', 'Огонь!', 'Так держать!', 'Красиво решил!', 'Без ошибок!'],
    wrong: [
      'Почти! Попробуй ещё раз.',
      'Не страшно — посмотри на подсказку.',
      'Чуть-чуть мимо. Перепроверь разряды.',
    ],
    micOn: 'Слушаю тебя. Говори громко и не торопись.',
    micOff: 'Микрофон выключен. Включи, когда захочешь поговорить.',
    finish: 'Урок окончен. Ты молодец!',
  } as const
}

/** Default Nadia script — kept for tests/legacy paths that don't have a voice context. */
export const TEACHER_SCRIPT = buildTeacherScript({ name: 'Надя' })
