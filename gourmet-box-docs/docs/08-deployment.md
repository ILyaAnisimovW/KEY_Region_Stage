# Публикация и развёртывание

## Документация в Sites

Сайт документации: https://gourmet-box-key-region-docs.ilyanisimov07.chatgpt.site

Сайт создаётся с доступом только владельцу. Ссылка сама по себе не предоставляет другу доступ: используйте настройки доступа Sites или публичный GitHub-репозиторий. Фактическое завершение публикации подтверждается ответом Sites, а не наличием этой ссылки в файле.

В Sites публикуется статическая сборка MkDocs с C4, API-справочником Redoc и скачиваемым OpenAPI. Исходные Markdown и код авторизации хранятся в GitHub. Локальные секреты, сгенерированный realm с паролями, окружение Python и node_modules в публикацию не входят.

## Куда развернуть приложение

Для текущего стека рекомендован Railway: отдельные сервисы NestJS API, Keycloak и PostgreSQL. Для данных Keycloak нужна отдельная база/учётная запись; не давать провайдеру доступ к таблицам приложения. React можно разместить в Sites с обращением к HTTPS API. Документация — отдельный статический сайт.

Поддерживаемые сценарии описаны в официальных руководствах [Railway NestJS](https://docs.railway.com/guides/nest), [Railway Keycloak](https://docs.railway.com/guides/keycloak-authentication), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql). Доступность и стоимость выбранных ресурсов проверяются в аккаунте перед созданием платных сервисов.

Альтернатива — VPS и Docker Compose с обратным прокси, HTTPS и собственными backup. Локальный compose.yaml нельзя считать production-конфигурацией: Keycloak start-dev и loopback-настройки предназначены для разработки.

## Что потребуется для полного деплоя

1. Доступ к хостингу и HTTPS-адреса API, Keycloak и frontend.
2. Production Keycloak с PostgreSQL, `start` вместо `start-dev`, корректными hostname и proxy headers. [Требования Keycloak](https://www.keycloak.org/server/configuration-production).
3. Внешние OIDC_ISSUER, OIDC_JWKS_URL, OIDC_AUDIENCE и WEB_ORIGIN для API; DATABASE_URL через секреты хостинга.
4. API должен слушать адрес контейнера `0.0.0.0` и PORT хостинга. Текущая локальная точка входа слушает loopback; это нужно изменить при подготовке production image.
5. VITE_OIDC_ISSUER и VITE_API_URL задаются при сборке frontend. В Keycloak заменить localhost callback/logout/web origin на точные адреса опубликованного frontend.
6. Выполнить миграции и создать реальные идентичности, роли и memberships. Локальный demo seed намеренно запрещён для production.
7. Проверить вход, обновление токена, выход и разграничение двух пользователей/заведений через реальные опубликованные адреса.

Sites исполняет серверный код в Cloudflare Workers: он не запускает Docker Compose, JVM Keycloak и PostgreSQL. Переписывание NestJS/PostgreSQL на Worker/D1 изменило бы согласованную архитектуру; для текущего проекта backend выносится на подходящий хостинг.

Работающий production backend этой публикацией не заявляется. Полный деплой требует отдельной конфигурации и доступа к выбранному хостингу.
