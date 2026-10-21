# Бесплатный публичный стенд Gourmet Box

`render.yaml` создаёт статический сайт и Node API на бесплатном Render. PostgreSQL размещается в Neon, а вход и регистрация — в бесплатном Keycloak realm Cloud-IAM. Не используйте бесплатную базу Render: она истекает через 30 дней.

Текущий стенд: https://gourmet-box-web.onrender.com/ и https://gourmet-box-api.onrender.com/v1/health. Ветка деплоя — `codex/gourmet-free-deploy`. Публичный клиент Keycloak `gourmet-box-web` создан, саморегистрация включена, а audience mapper добавляет `gourmet-box-api` в access token. Переход к форме регистрации проверен; сквозная проверка бронирования под отдельным покупателем ещё нужна.

## Перед созданием Render Blueprint

1. Создайте проект PostgreSQL в Neon. Скопируйте **direct** connection string с `sslmode=require` в секрет `DATABASE_URL` сервиса API. Не помещайте её в Git или клиентскую переменную `VITE_*`.
2. В Cloud-IAM Freemium создайте realm `gourmet-box`. Включите регистрацию покупателей и создайте публичный OIDC-клиент `gourmet-box-web` с Authorization Code + PKCE S256. Добавьте `https://<адрес-сайта>.onrender.com/callback` в Valid Redirect URIs, `https://<адрес-сайта>.onrender.com` в Web Origins и Post Logout Redirect URIs. Добавьте audience mapper, который включает `gourmet-box-api` в **access token**. Не импортируйте локальный `infra/keycloak/realm.json`: он содержит демонстрационные учётные записи.
3. В Render подключите этот репозиторий и создайте Blueprint из `render.yaml`. Выберите ветку с актуальным кодом. Для `DATABASE_URL` используйте Neon, для `OIDC_ISSUER` — точный HTTPS issuer из `/.well-known/openid-configuration`, для `OIDC_JWKS_URL` — `jwks_uri` из той же публикации. В `WEB_ORIGIN` укажите точный HTTPS origin статического сайта без `/` в конце. Render создаст `PICKUP_CODE_KEY` сам.
4. Для статического сайта `VITE_API_URL` должен быть `https://<адрес-api>.onrender.com/v1`, а `VITE_OIDC_ISSUER` — тем же issuer Cloud-IAM. Эти переменные включаются в сборку Vite и не должны содержать секретов.

На бесплатном Render нет отдельной команды pre-deploy, поэтому API запускает идемпотентные SQL-миграции перед сервером. API должен отвечать на `/v1/health`; затем проверьте каталог, вход, создание брони, просмотр кода и отмену. База сохраняет заказы между перезапусками API.

`DEMO_CATALOG=1` включает тестовый бокс. Он явно помечен как заказ без реальной выдачи, а новое окно бронирования создаётся после окончания предыдущего. Выключите переменную, когда появятся реальные заведения. Для реальных предложений создайте аккаунт сотрудника и назначьте ему заведение в БД, после чего он сможет публиковать боксы из кабинета. Локальный `seed-demo` запрещён в production, чтобы не публиковать демонстрационные аккаунты и пароли.

Бесплатный API Render засыпает после простоя, первый запрос после этого может занять около минуты. Cloud-IAM Freemium не предоставляет собственную тему входа, резервные копии и гарантию доступности. Для публичной демонстрации используйте отдельные тестовые аккаунты без реальных персональных данных.
