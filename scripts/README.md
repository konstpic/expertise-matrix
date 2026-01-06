# Preview GIF Generator

Автоматическая генерация анимированного GIF превью сайта.

## Как это работает

1. **Автоматически при деплое**: GitHub Actions автоматически генерирует GIF при изменении `index.html` или файлов в `media/`
2. **Вручную**: Можно запустить workflow вручную через GitHub Actions UI

## Локальная генерация

Для локальной генерации превью:

```bash
# Установить зависимости
npm install

# Установить Playwright браузеры
npx playwright install chromium

# Установить ffmpeg (требуется для создания GIF)
# Windows: choco install ffmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt-get install ffmpeg

# Запустить генерацию
npm run generate-preview
```

Скрипт:
- Откроет сайт в браузере Playwright
- Прокрутит страницу и сделает 30 скриншотов
- Создаст оптимизированный GIF с палитрой цветов
- Сохранит результат в `preview.gif`

## Настройка

Можно изменить параметры в `scripts/generate-preview.js`:
- `totalFrames` - количество кадров (по умолчанию 30)
- `viewport` - размер экрана (по умолчанию 1280x720)
- `SITE_URL` - URL сайта для скриншотов
