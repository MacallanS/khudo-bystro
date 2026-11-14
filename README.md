# Худо Быстро

Мобильная PWA для компании: быстрый диктант слов, каракули на бумаге или телефоне, потом проверка памяти художника.

**Live:** https://macallans.github.io/khudo-bystro/

На GitHub Pages диктор: **Piper** (в браузере) → Google. Silero доступен только локально через `npm run tts`.

## Запуск

```bash
npm install
npm run dev
```

### Диктор (open-source)

Приоритет: **Silero v5** (локально) → **Piper Irina** (в браузере) → Google.

| Движок | Качество RU | Где крутится |
|--------|-------------|--------------|
| **Silero v5** (`aidar`/`xenia`/…) | лучший баланс ясность+живость на CPU | `npm run tts` |
| **Piper** `ru_RU-irina-medium` | самый живой из Piper RU | браузер WASM |
| Fish / XTTS / Qwen3-TTS / Chatterbox | ещё «сценичнее», но GPU и тяжело | не для PWA за столом |

```bash
py -3.12 -m pip install -r tts-server/requirements.txt --index-url https://download.pytorch.org/whl/cpu
# если torch уже стоит с другого index — отдельно: pip install omegaconf scipy
npm run tts   # терминал 1 — первый раз скачает ~139 MB весов
npm run dev   # терминал 2
```

Сборка:

```bash
npm run build
npm run preview
```

PWA (install + offline) работает по HTTPS или `localhost`.
