import { LiveRoomService } from '../../../src/modules/live-room/live-room.service';

describe('LiveRoomService (unit)', () => {
  it('maps dto/user to facade commands and queries', async () => {
    const facade = {
      createRoom: jest.fn(async () => ({ roomId: 'r1' })),
      getRoom: jest.fn(async () => ({ roomId: 'r1' })),
      getRoomEvents: jest.fn(async () => []),
      joinRoom: jest.fn(async () => ({ roomId: 'r1' })),
      leaveRoom: jest.fn(async () => ({ roomId: 'r1' })),
      kickFromRoom: jest.fn(async () => ({ roomId: 'r1' })),
      closeRoom: jest.fn(async () => ({ roomId: 'r1' }))
    } as any;

    const service = new LiveRoomService(facade);
    const user = {
      accountId: 'teacher-1',
      roles: ['teacher'],
      tokenId: null,
      accessToken: 'test-token'
    };

    await service.createRoom(
      { courseId: 'c1', lessonId: 'l1', participantsLimit: 12 } as any,
      user
    );
    await service.getRoom('r1');
    await service.getRoomEvents('r1', user as any, { fromVersion: 1, limit: 10 } as any);
    await service.joinRoom('r1', user as any, { role: 'student', expectedVersion: 1 } as any);
    await service.leaveRoom('r1', user as any, { expectedVersion: 2 } as any);
    await service.kickFromRoom(
      'r1',
      user as any,
      { participantAccountId: 'student-1', expectedVersion: 3 } as any
    );
    await service.closeRoom('r1', user as any, { expectedVersion: 4 } as any);

    expect(facade.createRoom).toHaveBeenCalledWith({
      courseId: 'c1',
      lessonId: 'l1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      participantsLimit: 12
    });
    expect(facade.getRoom).toHaveBeenCalledWith('r1');
    expect(facade.getRoomEvents).toHaveBeenCalledWith({
      roomId: 'r1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      fromVersion: 1,
      limit: 10
    });
    expect(facade.joinRoom).toHaveBeenCalledWith({
      roomId: 'r1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      accessToken: 'test-token',
      roleOverride: 'student',
      expectedVersion: 1
    });
    expect(facade.leaveRoom).toHaveBeenCalledWith({
      roomId: 'r1',
      actorAccountId: 'teacher-1',
      expectedVersion: 2
    });
    expect(facade.kickFromRoom).toHaveBeenCalledWith({
      roomId: 'r1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      participantAccountId: 'student-1',
      expectedVersion: 3
    });
    expect(facade.closeRoom).toHaveBeenCalledWith({
      roomId: 'r1',
      actorAccountId: 'teacher-1',
      actorRoles: ['teacher'],
      expectedVersion: 4
    });
  });
});
