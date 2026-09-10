"""Живое ли лицо — числом.

Отвечает на вопрос, который стоил нам месяца на bitHuman: движок рисует ЛИЦО ЦЕЛИКОМ
или клеит рот на неподвижную/зацикленную базу?

Метод. Находим лицо, режем на верх (брови, глаза) и низ (рот, челюсть).
Считаем межкадровое движение в каждой зоне и три числа:

  РОТ        — средняя энергия движения нижней зоны. Есть у всех, кто вообще говорит.
  ВЕРХ       — средняя энергия движения верхней зоны. У «заплатки на статике» ≈ 0.
  СВЯЗЬ      — корреляция Пирсона между рядами движения верха и низа по кадрам.
               🔑 Это и есть различитель: у генеративного движка брови и глаза живут
               в ритме речи (связь высокая), у заплатки верх берётся из чужой петли
               и с ртом не связан (связь около нуля или отрицательная).

Запуск:
    python scripts/face-liveness.py ролик1.mp4 ролик2.mp4 ...
    python scripts/face-liveness.py --frames outdir ролик.mp4    # ещё и выложить кадры
"""

import sys
import os
import cv2
import numpy as np

CASCADE = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


def найти_лицо(cap, макс_проб=40):
    """Ищем лицо на первых кадрах; возвращаем (x, y, w, h) самого большого."""
    детектор = cv2.CascadeClassifier(CASCADE)
    лучшее = None
    for _ in range(макс_проб):
        ок, кадр = cap.read()
        if not ок:
            break
        серый = cv2.cvtColor(кадр, cv2.COLOR_BGR2GRAY)
        лица = детектор.detectMultiScale(серый, 1.1, 5, minSize=(60, 60))
        for (x, y, w, h) in лица:
            if лучшее is None or w * h > лучшее[2] * лучшее[3]:
                лучшее = (x, y, w, h)
        if лучшее is not None:
            break
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    return лучшее


def разобрать(путь, кадров_максимум=500):
    cap = cv2.VideoCapture(путь)
    if not cap.isOpened():
        return {"файл": путь, "ошибка": "не открылся"}

    лицо = найти_лицо(cap)
    ш = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    в = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if лицо is None:
        # лицо не нашлось — берём центральный квадрат, лучше чем ничего
        сторона = int(min(ш, в) * 0.7)
        лицо = ((ш - сторона) // 2, (в - сторона) // 2, сторона, сторона)
        нашли = False
    else:
        нашли = True

    x, y, w, h = лицо
    # верх: брови и глаза — от 15 % до 50 % высоты лица
    верх = (y + int(0.15 * h), y + int(0.50 * h))
    # низ: рот и челюсть — от 60 % до 100 %
    низ = (y + int(0.60 * h), y + int(1.00 * h))

    ряд_верх, ряд_низ = [], []
    пред = None
    считано = 0
    while считано < кадров_максимум:
        ок, кадр = cap.read()
        if not ок:
            break
        серый = cv2.cvtColor(кадр, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if пред is not None:
            дельта = np.abs(серый - пред)
            ряд_верх.append(float(дельта[верх[0]:верх[1], x:x + w].mean()))
            ряд_низ.append(float(дельта[низ[0]:низ[1], x:x + w].mean()))
        пред = серый
        считано += 1
    cap.release()

    if len(ряд_низ) < 10:
        return {"файл": путь, "ошибка": f"мало кадров ({len(ряд_низ)})"}

    в_arr = np.array(ряд_верх)
    н_arr = np.array(ряд_низ)
    if в_arr.std() < 1e-6 or н_arr.std() < 1e-6:
        связь = 0.0
    else:
        связь = float(np.corrcoef(в_arr, н_arr)[0, 1])

    return {
        "файл": os.path.basename(путь),
        "кадров": считано,
        "размер": f"{ш}x{в}",
        "лицо_найдено": нашли,
        "рот": float(н_arr.mean()),
        "верх": float(в_arr.mean()),
        "отношение": float(в_arr.mean() / н_arr.mean()) if н_arr.mean() > 0 else 0.0,
        "связь": связь,
    }


def выложить_кадры(путь, куда, сколько=6):
    os.makedirs(куда, exist_ok=True)
    cap = cv2.VideoCapture(путь)
    всего = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 100
    имя = os.path.splitext(os.path.basename(путь))[0]
    точки = np.linspace(0, max(всего - 2, 1), сколько).astype(int)
    пути = []
    for i, кадр_н in enumerate(точки):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(кадр_н))
        ок, кадр = cap.read()
        if not ок:
            continue
        п = os.path.join(куда, f"{имя}-{i:02d}.png")
        cv2.imwrite(п, кадр)
        пути.append(п)
    cap.release()
    return пути


if __name__ == "__main__":
    аргс = sys.argv[1:]
    кадры_в = None
    if аргс and аргс[0] == "--frames":
        кадры_в = аргс[1]
        аргс = аргс[2:]

    print(f"{'ролик':<34}{'кадров':>7}{'рот':>8}{'верх':>8}{'верх/рот':>10}{'СВЯЗЬ':>8}")
    print("-" * 75)
    for п in аргс:
        р = разобрать(п)
        if "ошибка" in р:
            print(f"{os.path.basename(п):<34} ОШИБКА: {р['ошибка']}")
            continue
        метка = "" if р["лицо_найдено"] else "  (лицо не найдено, центр кадра)"
        print(f"{р['файл']:<34}{р['кадров']:>7}{р['рот']:>8.2f}{р['верх']:>8.2f}"
              f"{р['отношение']:>10.2f}{р['связь']:>8.2f}{метка}")
        if кадры_в:
            выложить_кадры(п, кадры_в)
