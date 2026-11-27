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

Debug APK для проверки собирается workflow `.github/workflows/build.yml` при изменениях Android/Gradle-файлов. Подписанный Release APK публикуется workflow `.github/workflows/android-release.yml` по тегу версии.

Release-сборка использует R8 и resource shrinking.

### Gradle

Wrapper configuration использует Gradle 8.2. GitHub Actions устанавливает Gradle 8.2 перед сборкой.

Примечание: `gradle/wrapper/gradle-wrapper.jar` сейчас отсутствует в репозитории, поэтому CI использует установленный через `gradle/actions/setup-gradle` Gradle, а не `./gradlew`.

## Android-функции

- WebView + JavaScript bridge;
- GPS/маршрут через `LocationService`;
- обработка уведомлений через `NotificationService`;
- deep link `moneytracker://auth`.

## Подпись и выпуск Android-обновления

Release APK подписываются постоянным ключом. Android установит обновление поверх приложения только если ключ совпадает. Keystore не хранится в репозитории; GitHub Actions получает его из secrets.

1. Один раз запустите `powershell -ExecutionPolicy Bypass -File scripts/create-android-signing-key.ps1`. Скрипт создаст keystore `%USERPROFILE%\.android\moneytracker-release.pfx`, сохранит пароль в соседний файл и скопирует Base64 keystore в буфер обмена. Сохраните резервную копию обоих файлов в надёжном месте.
2. В настройках GitHub-репозитория → Settings → Secrets and variables → Actions добавьте `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` со значением `moneytracker-release` и `ANDROID_KEY_PASSWORD`.
3. Для нового Android-релиза увеличьте `versionCode` и `versionName` в `app/build.gradle`, отправьте изменения в `main` и создайте тег с таким же именем, например `android-v1.2`: `git tag android-v1.2; git push origin android-v1.2`.
4. `.github/workflows/android-release.yml` соберёт подписанный APK, опубликует его как `MoneyTracker.apk`, обновит `version.json` и запустит деплой сайта. Приложение заметит новую версию и предложит скачать её. Установку подтвердит Android.

Обычный workflow сборки на коммитах и pull request собирает только debug APK для проверки. Он не годится для обновления установленного приложения.

Старые публичные APK собирались со временной debug-подписью; её закрытого ключа нет в репозитории или рабочей среде. Android не позволит заменить такую установку APK с новым постоянным ключом. Для перехода на постоянную подпись потребуется один раз удалить старое приложение и установить первый APK с новой подписью. Операции пользователя хранятся в Firebase, локальные настройки приложения при переустановке могут сброситься.
