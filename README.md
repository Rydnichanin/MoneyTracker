# Учёт Курьера Pro

MoneyTracker — web/PWA-приложение для учёта доходов и расходов курьера, с Firebase, AI-парсером и Android WebView-обёрткой.

## Web-приложение

Production URL:

`https://rydnichanin.github.io/MoneyTracker/`

GitHub Pages публикует только собранный web-артефакт `_site`.

### Быстрый старт

Основной исходник сайта находится в `index.html`. Большой inline CSS и inline JavaScript не нужно вручную переносить: `scripts/build-site.py` делает это во время Pages build.

AI-парсер (`ai_parser.js`) не блокирует первый экран. Он загружается отдельным `js/ai-loader.js` после первичного отображения/в idle.

### GitHub Pages

Изменения web-файлов запускают `.github/workflows/static.yml`.
Workflow:

1. собирает `_site` через `scripts/build-site.py`;
2. проверяет/готовит production-артефакт;
3. публикует только `_site` в GitHub Pages.

Android-папки и Gradle-файлы в web-артефакт не попадают.

## Android

Android WebView загружает:

`https://rydnichanin.github.io/MoneyTracker/index.html`

APK собирается workflow `.github/workflows/build.yml` только при изменениях Android/Gradle-файлов.

Release-сборка использует R8 и resource shrinking.

### Gradle

Wrapper configuration использует Gradle 8.2. GitHub Actions устанавливает Gradle 8.2 перед сборкой.

Примечание: `gradle/wrapper/gradle-wrapper.jar` сейчас отсутствует в репозитории, поэтому CI использует установленный через `gradle/actions/setup-gradle` Gradle, а не `./gradlew`.

## Android-функции

- WebView + JavaScript bridge;
- GPS/маршрут через `LocationService`;
- обработка уведомлений через `NotificationService`;
- deep link `moneytracker://auth`.

## Обновление

### Только сайт

Изменить web-файлы и отправить commit в `main`. APK пересобираться не будет.

### Android

Изменить Android/Gradle-файлы. GitHub Actions автоматически соберёт Release APK и загрузит его как artifact `MoneyTracker-APK`.
