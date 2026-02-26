# Учёт Курьера Pro — Android APK

## Что нужно сделать один раз

### 1. Исправь URL в MainActivity.java
Открой файл:
```
app/src/main/java/com/moneytracker/app/MainActivity.java
```
Найди строку:
```java
private static final String APP_URL = "https://ТВОЙ_ЛОГИН.github.io/MoneyTracker/";
```
Замени `ТВОЙ_ЛОГИН` на свой логин GitHub.

### 2. Скачай gradle-wrapper.jar
Это нужно сделать один раз. Скачай файл по ссылке:
https://github.com/gradle/gradle/raw/v8.1.1/gradle/wrapper/gradle-wrapper.jar

И положи его в папку: `gradle/wrapper/gradle-wrapper.jar`

### 3. Загрузи всё в GitHub репозиторий MoneyTracker

Загрузи все файлы из этой папки в репозиторий.
Можно через GitHub.com → Upload files.

**Важно:** index.html тоже должен лежать в корне репозитория.

### 4. GitHub Actions соберёт APK автоматически

После загрузки файлов:
- Зайди на github.com → твой репозиторий MoneyTracker
- Нажми вкладку **Actions**
- Увидишь процесс сборки (занимает 3-5 минут)
- Когда появится зелёная галочка — нажми на сборку
- Внизу найди **Artifacts** → скачай **MoneyTracker-APK**

### 5. Установи APK на телефон

- Скачай APK на телефон
- Разреши установку из неизвестных источников
- Установи
- При первом запуске разреши доступ к уведомлениям

## Как работает автозапись

После установки приложение будет читать уведомления WhatsApp и Kaspi.
Твой HTML (index.html) должен содержать обработчик:

```javascript
window.onAndroidNotification = function(app, title, text) {
    // app = "whatsapp" или "kaspi"
    // title = заголовок уведомления  
    // text = текст уведомления
    console.log("Уведомление от", app, ":", text);
    // Здесь ИИ будет парсить текст и добавлять транзакцию
};
```

## Обновление приложения

- Обновить HTML → просто загрузи новый index.html на GitHub, APK трогать не нужно
- Обновить APK → загрузи изменённые Java файлы, Actions пересоберёт автоматически
