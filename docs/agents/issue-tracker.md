# Трекер задач: GitHub

Задачи и спецификации для этого репозитория живут как GitHub Issues. Все операции — через CLI `gh`.

## Соглашения

- **Создать задачу**: `gh issue create --title "..." --body "..."`. Для многострочного body используй heredoc.
- **Прочитать задачу**: `gh issue view <number> --json number,title,body,labels,comments`.
- **Список задач**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` с подходящими фильтрами `--label` и `--state`.
- **Сделать задачу под-задачей родителя**: `gh issue create --parent <parent> ...` либо `gh issue edit <parent> --add-sub-issue <child>` после создания (`gh` 2.94+). Для более старого `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, см. ниже **Blocking**). Без sub-issues пиши `Part of #<parent>` в начало body дочерней задачи.
- **Blocking** (нативные зависимости GitHub — канонический, видимый в UI способ). Добавить связь: `gh issue create --blocked-by <n>,<n> ...` либо `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). Для более старого `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, где `<blocker-db-id>` — это числовой **database id** блокера (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _не_ `#number` и не `node_id`). Если зависимости недоступны, fallback — строка `Blocked by: #<n>, #<n>` в начале body дочерней задачи. Тикет разблокирован, когда все его блокеры закрыты.
- **Посчитать открытые блокеры**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` (только открытые, 0 = можно брать в работу). `gh issue view <n> --json blockedBy` показывает и закрытые — отфильтруй: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Комментарий к задаче**: `gh issue comment <number> --body "..."`
- **Поставить / снять лейбл**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Закрыть задачу**: сначала объясни в `gh issue comment <number> --body "..."`, потом `gh issue close <number>`. На уже закрытой задаче `gh issue close --comment` всё равно выходит с кодом 0.

Репо определяется автоматически через `git remote -v`; `gh` сам подхватывает его при запуске из клона.

Создавай задачи только в собственном репозитории пользователя. Никогда не создавай в `mattpocock/skills` (репозиторий, откуда приходят эти скиллы), если только пользователь сам им не владеет. В форке `gh` по умолчанию может указывать на апстрим — перед первым `gh issue create` в сессии проверь таргет через `gh repo view --json nameWithOwner` и сверься с пользователем, если это не его репозиторий.

## Pull Requests как поверхность триажа

**PR как поверхность запросов: нет** _(поставь `yes`, если в этом репо внешние PR обрабатываются как фичереквесты; `/triage` читает этот флаг.)_

При `yes` PR проходят через те же лейблы и состояния, что и issue, с использованием `gh pr`:

- **Прочитать PR**: `gh pr view <number>`, затем `gh pr view <number> --comments` (вне TTY `--comments` печатает только комментарии, без body), и `gh pr diff <number>` для диффа.
- **Список внешних PR для триажа**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Комментарий / лейбл / закрытие**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

У GitHub одно общее числовое пространство для issue и PR, поэтому голый `#42` может быть любым из двух; проверяй через `gh pr view 42`, фолбэк — `gh issue view 42`.

## Когда скилл говорит «опубликовать в трекер задач»

Создать GitHub issue.

## Когда скилл говорит «достать релевантный тикет»

Прочитать его, как в **Прочитать задачу** выше.

## Операции wayfinder

Используются скиллом `/wayfinder`. **Карта** — это одна задача с дочерними issue-тикетами.

- **Карта**: одна задача с лейблом `wayfinder:map`, содержащая в body блоки Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Дочерний тикет**: issue, привязанный к карте как GitHub sub-issue (см. **Сделать задачу под-задачей родителя**). Если sub-issues не включены, добавь тикет в task list в теле карты и напиши `Part of #<map>` в начало body дочерней задачи. Лейблы: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Когда тикет взят в работу — назначен на ведущего разработчика.
- **Blocking**: см. **Blocking** в Соглашениях.
- **Frontier query**: список открытых детей карты (`gh issue list --state open`, отфильтрованный по sub-issues / task list карты), отбросить тикеты с открытым блокером (см. **Посчитать открытые блокеры**, либо открытая строка `Blocked by`) или с назначенным исполнителем; побеждает первый в порядке карты.
- **Взять в работу**: `gh issue edit <n> --add-assignee @me` — первая запись сессии.
- **Резолюция**: `gh issue comment <n> --body "<answer>"`, затем `gh issue close <n>`, затем добавь контекстную ссылку (gist + ссылку) в блок Decisions-so-far карты.
