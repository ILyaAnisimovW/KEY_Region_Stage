# Как удобно читать и публиковать документацию

Рекомендация для этого проекта: **MkDocs + GitHub Pages + Redoc для OpenAPI**. Markdown и контракт проходят review в Git, а читатели получают сайт с навигацией и поиском. Исследование официальных источников: 16.10.2026. Цены и ограничения тарифов здесь не фиксируются.

## Варианты

| Решение | Когда выбирать | Особенности |
|---|---|---|
| MkDocs + GitHub Pages | Небольшая инженерная документация | Статический сайт из Markdown, навигация и поиск, публикация из Git |
| Docusaurus | Команда уже работает с React; нужны сложные страницы и версии | Mermaid подключается официальной темой; больше конфигурации |
| GitBook + Git Sync | Нужен удобный редактор и участие людей вне разработки | Синхронизация GitHub/GitLab, API-справочник из OpenAPI; проверить ограничения выбранного плана |
| Redoc CE | Нужен отдельный API-справочник | Генерирует HTML из OpenAPI; не заменяет архитектурные разделы |

Источники: [MkDocs deployment](https://www.mkdocs.org/user-guide/deploying-your-docs/), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Docusaurus Mermaid](https://docusaurus.io/docs/markdown-features/diagrams), [GitBook Git Sync](https://gitbook.com/docs/guides/editing-and-publishing-documentation/import-or-migrate-your-content-to-gitbook-with-git-sync), [GitBook OpenAPI](https://gitbook.com/docs/guides/api-documentation/document-your-api-in-gitbook-in-5-simple-steps), [Redoc CE](https://redocly.com/docs/redoc).

## Подготовленный вариант MkDocs

В корне этого комплекта находятся mkdocs.yml и requirements-docs.txt. Команды выполняются из gourmet-box-docs:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-docs.lock.txt
npx @redocly/cli@2.64.1 lint openapi.yaml
Copy-Item openapi.yaml docs/openapi.yaml
npx @redocly/cli@2.64.1 build-docs openapi.yaml --output docs/api.html
mkdocs serve
```

Открыть адрес из вывода mkdocs serve. Для сборки: `mkdocs build --strict`. Проверенная версия Redocly закреплена в командах и build-docs.ps1; зависимости Python — в requirements-docs.lock.txt. requirements-docs.txt задаёт диапазоны для осознанного обновления зависимостей, после которого нужно пересоздать lock и повторить проверку.

На Windows после создания окружения все шаги сборки объединены в `./build-docs.ps1`; `./build-docs.ps1 -Serve` дополнительно запускает локальный просмотр.

api.html и docs/openapi.yaml — производные файлы; редактировать нужно корневой openapi.yaml. Не поддерживать две независимые спецификации. Mermaid загружается с CDN, поэтому для диаграмм нужен доступ к сети; в закрытом контуре разместить библиотеку локально.

## Публикация на GitHub Pages

1. Добавить комплект в выбранный GitHub-репозиторий.
2. В Settings → Pages настроить публикацию из ветки gh-pages. Доступность зависит от типа репозитория и плана; закрытый Git-репозиторий сам по себе не гарантирует закрытость сайта.
3. Выполнить сборку API командами выше и `mkdocs gh-deploy`. Команда публикует результат во внешнюю ветку — выполнять из нужного репозитория после проверки содержимого.
4. Проверить сайт, диаграммы, поиск и API-страницу по полученному адресу. Адрес заранее не придуман.

Затем перенести те же шаги в GitHub Actions: checkout → setup Python/Node → установка закреплённых зависимостей → lint OpenAPI → генерация Redoc → mkdocs build --strict → upload-pages-artifact → deploy-pages. Для Actions выбрать источник GitHub Actions в Pages, не branch deployment. Публикацию ограничить основной веткой; PR должны только проверять сборку.

Комплект локальный: сайт и внешний репозиторий не созданы, учётная запись не подключалась. После публикации Markdown остаётся источником истины, сайт — его отображением.

## API и диаграммы

[Скачать OpenAPI](openapi.yaml) · [Открыть API-справочник](api.html). Эти ссылки работают после генерации перед сборкой сайта.

Диаграммы C4 хранятся рядом с объяснениями в 02-architecture.md. Изменение резервирования требует одновременного изменения правил, транзакций, контракта и приёмочных сценариев. Для архитектурных решений полезны короткие ADR: контекст → решение → последствия → условия пересмотра.

Синтаксис Mermaid C4 пока помечен экспериментальным, поэтому комплект использует стандартные flowchart с границами C4: [источник Mermaid](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/syntax/c4.md).
