# Gourmet Box

[Сайт документации в Sites](https://gourmet-box-key-region-docs.ilyanisimov07.chatgpt.site) — опубликован с доступом только владельцу. Публичная документация также доступна в папке gourmet-box-docs этого GitHub-репозитория. Полный backend/Keycloak этой публикацией не развёрнут.

Модуль авторизации по [спецификации MVP](gourmet-box-docs/README.md): внешний Identity Provider, Bearer JWT, локальные роли BUYER/STAFF, membership заведения и ownership заказа. NestJS + PostgreSQL + React; локальный вход через Keycloak.

## Что реализовано

- Вход/выход через Keycloak (Authorization Code + PKCE S256), обновление токена.
- React-экран показывает роль и только назначенные заведения.
- `GET /v1/me` возвращает текущий доступ, `GET /v1/health` публичен.
- Глобальный guard с политиками для каждой операции исходного OpenAPI. Подпись RS256, issuer, audience, exp/iat/nbf и доверенный JWKS.
- Роли и назначения читаются из PostgreSQL на каждом запросе; подмена buyerId, venueId или роли в claims не предоставляет доступ.

Бизнес-эндпоинты боксов/заказов ещё не реализованы. Для них подготовлен модуль доступа. Probe-маршруты существуют только в тестах. Пароли принимает исключительно провайдер, собственного `/login` нет — это соответствует ТЗ.

## Локальный запуск

Нужны Node.js 22.12+ и запущенный Docker Desktop с Linux containers.

```powershell
npm ci
npm run demo:setup
docker compose up -d
npm run db:migrate --workspace @gourmet-box/api
npm run db:seed --workspace @gourmet-box/api
npm run dev:api
```

Перед миграцией дождаться healthy у PostgreSQL (`docker compose ps`), перед входом — доступности `http://localhost:8080/realms/gourmet-box/.well-known/openid-configuration`. В другом терминале:

```powershell
npm run dev:web
```

Открыть `http://localhost:5173`. Пароли buyer, other-buyer, seller, other-seller печатает demo:setup. У каждого продавца своё заведение. Случайные локальные секреты в `.env` и `infra/keycloak/realm.json` игнорируются Git; скрипт отказывается их перезаписывать. Keycloak импортирует realm только при первом запуске; замена файла не изменяет существующие аккаунты.

Если demo уже подготовлено, пропустить demo:setup; локальные пароли находятся в credentials сгенерированного realm.json. Не публиковать этот файл. Состояние фактической проверки и ограничения среды — в [VALIDATION](gourmet-box-docs/VALIDATION.md).

Токены хранятся только в памяти вкладки. После перезагрузки нажать «Войти»: активная SSO-сессия позволит войти повторно. Logout не отзывает мгновенно ранее скопированный JWT (demo TTL 5 минут); отключение app_users.active или удаление membership блокирует доступ со следующего запроса.

## Проверка

```powershell
npm run build
npm test
```

Тесты поднимают настоящий Nest HTTP server, JWKS с RSA-подписью и PostgreSQL engine PGlite, выполняя SQL миграции и production repository. Проверяются чужие объекты, подделка/истечение JWT, отзыв доступа и соответствие политик OpenAPI.

## Структура

```text
apps/api/src/modules/access/  JWT, роли, политики, SQL repository, /me
apps/api/test/                HTTP и SQL проверки доступа
apps/web/src/                 OIDC клиент и экран входа
db/migrations/                идентичности и области доступа
infra/keycloak/               сгенерированный локальный realm (ignored)
scripts/                      подготовка demo
gourmet-box-docs/             требования, C4, OpenAPI, руководство
```

[Матрица доступа и устройство авторизации](gourmet-box-docs/docs/07-auth.md).
