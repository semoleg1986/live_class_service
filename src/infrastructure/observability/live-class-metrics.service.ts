import { Injectable } from '@nestjs/common';

import { LiveRoomSnapshot } from '../../domain/live-room/live-room.types';

type Labels = Record<string, string>;

@Injectable()
export class LiveClassMetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly roomParticipantCounts = new Map<string, number>();
  private readonly roomOpenStates = new Map<string, number>();
  private readonly requestDurationSums = new Map<string, number>();
  private readonly requestDurationCounts = new Map<string, number>();

  recordHttpRequest(input: {
    method: string;
    path: string;
    status: number;
    durationSeconds: number;
  }): void {
    const status = String(input.status);
    this.increment('http_requests_total', {
      service: 'live_class_service',
      method: input.method,
      path: input.path,
      status
    });
    this.incrementDurationSummary(
      'http_request_duration_seconds',
      {
        service: 'live_class_service',
        method: input.method,
        path: input.path
      },
      input.durationSeconds
    );
    if (input.status >= 400) {
      this.increment('http_errors_total', {
        service: 'live_class_service',
        path: input.path,
        status
      });
    }
  }

  markRoomCreated(snapshot: LiveRoomSnapshot): void {
    this.increment('live_room_rooms_created_total');
    this.setRoomSnapshot(snapshot);
  }

  markRoomClosed(snapshot: LiveRoomSnapshot): void {
    this.increment('live_room_rooms_closed_total');
    this.setRoomSnapshot(snapshot);
  }

  markParticipantJoin(input: {
    role: string;
    result: 'joined' | 'noop' | 'denied';
    snapshot?: LiveRoomSnapshot;
  }): void {
    this.increment('live_room_participant_joins_total', {
      role: input.role,
      result: input.result
    });
    if (input.snapshot) {
      this.setRoomSnapshot(input.snapshot);
    }
    if (input.result === 'joined') {
      this.increment('live_room_attendance_sessions_total', {
        role: input.role
      });
    }
  }

  markParticipantLeave(input: {
    role: string;
    result: 'left' | 'noop';
    durationSeconds?: number;
    snapshot?: LiveRoomSnapshot;
  }): void {
    this.increment('live_room_participant_leaves_total', {
      role: input.role,
      result: input.result
    });
    if (input.snapshot) {
      this.setRoomSnapshot(input.snapshot);
    }
    if (input.durationSeconds !== undefined) {
      this.increment(
        'live_room_attendance_seconds_total',
        { role: input.role },
        input.durationSeconds
      );
    }
  }

  markParticipantKick(input: {
    role: string;
    result: 'kicked' | 'noop';
    durationSeconds?: number;
    snapshot?: LiveRoomSnapshot;
  }): void {
    this.increment('live_room_participant_kicks_total', {
      role: input.role,
      result: input.result
    });
    if (input.snapshot) {
      this.setRoomSnapshot(input.snapshot);
    }
    if (input.durationSeconds !== undefined) {
      this.increment(
        'live_room_attendance_seconds_total',
        { role: input.role },
        input.durationSeconds
      );
    }
  }

  render(): string {
    const lines = [
      '# HELP http_requests_total Total HTTP requests.',
      '# TYPE http_requests_total counter',
      this.renderMetricFamily('http_requests_total'),
      '# HELP http_request_duration_seconds HTTP request latency in seconds.',
      '# TYPE http_request_duration_seconds summary',
      this.renderDurationSummary('http_request_duration_seconds'),
      '# HELP http_errors_total Total HTTP error responses (status >= 400).',
      '# TYPE http_errors_total counter',
      this.renderMetricFamily('http_errors_total'),
      '# HELP live_room_rooms_created_total Total live rooms created.',
      '# TYPE live_room_rooms_created_total counter',
      this.renderMetric('live_room_rooms_created_total'),
      '# HELP live_room_rooms_closed_total Total live rooms closed.',
      '# TYPE live_room_rooms_closed_total counter',
      this.renderMetric('live_room_rooms_closed_total'),
      '# HELP live_room_participant_joins_total Total participant join attempts by result and role.',
      '# TYPE live_room_participant_joins_total counter',
      this.renderMetricFamily('live_room_participant_joins_total'),
      '# HELP live_room_participant_leaves_total Total participant leave attempts by result and role.',
      '# TYPE live_room_participant_leaves_total counter',
      this.renderMetricFamily('live_room_participant_leaves_total'),
      '# HELP live_room_participant_kicks_total Total participant kick attempts by result and role.',
      '# TYPE live_room_participant_kicks_total counter',
      this.renderMetricFamily('live_room_participant_kicks_total'),
      '# HELP live_room_attendance_sessions_total Total attendance sessions opened.',
      '# TYPE live_room_attendance_sessions_total counter',
      this.renderMetricFamily('live_room_attendance_sessions_total'),
      '# HELP live_room_attendance_seconds_total Total accumulated attendance seconds by role.',
      '# TYPE live_room_attendance_seconds_total counter',
      this.renderMetricFamily('live_room_attendance_seconds_total'),
      '# HELP live_room_open_rooms Current count of non-closed rooms.',
      '# TYPE live_room_open_rooms gauge',
      this.renderGauge('live_room_open_rooms'),
      '# HELP live_room_active_participants Current count of active participants across rooms.',
      '# TYPE live_room_active_participants gauge',
      this.renderGauge('live_room_active_participants')
    ];

    return `${lines.filter(Boolean).join('\n')}\n`;
  }

  private setRoomSnapshot(snapshot: LiveRoomSnapshot): void {
    this.roomParticipantCounts.set(snapshot.roomId, snapshot.participants.length);
    this.roomOpenStates.set(snapshot.roomId, snapshot.status === 'closed' ? 0 : 1);
    this.gauges.set(
      'live_room_open_rooms',
      [...this.roomOpenStates.values()].reduce((sum, value) => sum + value, 0)
    );
    this.gauges.set(
      'live_room_active_participants',
      [...this.roomParticipantCounts.values()].reduce((sum, value) => sum + value, 0)
    );
  }

  private increment(name: string, labels: Labels = {}, by = 1): void {
    const key = this.metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  private incrementDurationSummary(name: string, labels: Labels, by: number): void {
    const key = this.metricKey(name, labels);
    this.requestDurationSums.set(key, (this.requestDurationSums.get(key) ?? 0) + by);
    this.requestDurationCounts.set(key, (this.requestDurationCounts.get(key) ?? 0) + 1);
  }

  private metricKey(name: string, labels: Labels): string {
    const serialized = Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return serialized ? `${name}|${serialized}` : name;
  }

  private renderMetric(name: string): string {
    return `${name} ${this.counters.get(name) ?? 0}`;
  }

  private renderGauge(name: string): string {
    return `${name} ${this.gauges.get(name) ?? 0}`;
  }

  private renderMetricFamily(name: string): string {
    const lines = [...this.counters.entries()]
      .filter(([key]) => key === name || key.startsWith(`${name}|`))
      .map(([key, value]) => {
        if (key === name) {
          return `${name} ${value}`;
        }

        const rawLabels = key.slice(name.length + 1);
        const labels = rawLabels
          .split(',')
          .filter(Boolean)
          .map((pair) => {
            const [label, rawValue] = pair.split('=');
            return `${label}="${rawValue}"`;
          })
          .join(',');

        return `${name}{${labels}} ${value}`;
      });

    return lines.join('\n');
  }

  private renderDurationSummary(name: string): string {
    const lines = [...this.requestDurationSums.entries()]
      .filter(([key]) => key === name || key.startsWith(`${name}|`))
      .flatMap(([key, value]) => {
        const count = this.requestDurationCounts.get(key) ?? 0;
        if (key === name) {
          return [`${name}_sum ${value}`, `${name}_count ${count}`];
        }

        const rawLabels = key.slice(name.length + 1);
        const labels = rawLabels
          .split(',')
          .filter(Boolean)
          .map((pair) => {
            const [label, rawValue] = pair.split('=');
            return `${label}="${rawValue}"`;
          })
          .join(',');

        return [`${name}_sum{${labels}} ${value}`, `${name}_count{${labels}} ${count}`];
      });

    return lines.join('\n');
  }
}
