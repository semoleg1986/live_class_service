# Контракт Live-Класса (`live_class_service`)

## Назначение

Сервис управляет live-комнатами занятий и signaling-каналом для WebRTC/mediasoup.

## Ограничения MVP

- Максимум `1 teacher + 10 students` на комнату.
- Сценарий: один урок в одной live-комнате.
- Доска и видео синхронизируются в realtime через signaling events.

## Room Lifecycle

- `created`: комната создана, участники могут входить.
- `active`: начата трансляция/занятие.
- `closed`: занятие завершено, новые входы запрещены.

Переходы:

- `create-room` -> `created`
- `first-join` -> `active`
- `close-room` -> `closed`

## HTTP API (v1)

### POST `/v1/live/rooms`

Создает live-комнату.

Request:

- `courseId` (string)
- `lessonId` (string)
- `participantsLimit` (number, optional)

Response:

- `roomId`, `status`, `teacherAccountId`, `participantsLimit`, timestamps.

Правило доступа:

- только `teacher` или `admin`.

### GET `/v1/live/rooms/:roomId`

Возвращает состояние комнаты.

### POST `/v1/live/rooms/:roomId/join`

Добавляет участника в комнату.

Request:

- `role` (optional)

Ответ: обновленное состояние комнаты.

### POST `/v1/live/rooms/:roomId/close`

Закрывает комнату.

Правило доступа:

- owner `teacher` комнаты или `admin`.

## WebSocket Signaling

Namespace: `/ws/live`

Auth handshake:

- `auth.token` (Bearer JWT)

### Client -> Server events

- `room.join` `{ roomId }`
- `webrtc.signal` `{ roomId, kind: offer|answer|ice, targetPeerId?, data }`

### Server -> Client events

- `signaling.ready` `{ maxParticipants }`
- `room.joined` `{ roomId }`
- `webrtc.signal` `{ fromPeerId, roomId, kind, targetPeerId?, data }`
- `error` `{ code, message }`

## Интеграция с `auth_service`

Для production требуется JWT верификация по JWKS:

- `LIVE_CLASS_AUTH_ISSUER`
- `LIVE_CLASS_AUTH_AUDIENCE` (по умолчанию `platform_clients`)
- `LIVE_CLASS_AUTH_JWKS_URL`

Сервис проверяет подпись и обязательные claims access token:

- `iss`, `aud`, `sub`, `jti`, `roles`, `iat`, `exp`, `typ`
- `typ` должен быть равен `access`.

## Инфраструктура

- PostgreSQL: метаданные комнат/уроков/участников/записей.
- Redis: presence, pub/sub для горизонтального масштабирования.
- TURN/STUN: обязательны для пользователей за NAT.

## Следующий этап реализации

1. Подключить реальный mediasoup worker/router/transport.
2. Добавить persistence для rooms/participants в PostgreSQL.
3. Добавить Redis adapter для multi-instance signaling.
4. Добавить кэширование/rotation стратегию JWKS для повышенной отказоустойчивости.
