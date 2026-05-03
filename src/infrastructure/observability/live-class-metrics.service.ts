import { Injectable } from '@nestjs/common';

import { LiveRoomSnapshot } from '../../domain/live-room/live-room.types';

type Labels = Record<string, string>;

@Injectable()
export class LiveClassMetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly roomParticipantCounts = new Map<string, number>();
  private readonly roomOpenStates = new Map<string, number>();

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
      this.increment('live_room_attendance_seconds_total', { role: input.role }, input.durationSeconds);
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
      this.increment('live_room_attendance_seconds_total', { role: input.role }, input.durationSeconds);
    }
  }

  render(): string {
    const lines = [
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
}
