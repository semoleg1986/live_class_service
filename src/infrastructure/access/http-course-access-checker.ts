import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CourseAccessCheckerPort,
  CourseJoinAccessCheckInput
} from '../../application/ports/course-access-checker.port';
import {
  ApplicationAccessDeniedError,
  ApplicationValidationError
} from '../../application/shared/errors';

type CourseAccessDecisionResponse = {
  decision?: string;
};

@Injectable()
export class HttpCourseAccessChecker implements CourseAccessCheckerPort {
  constructor(private readonly configService: ConfigService) {}

  async ensureCanJoinCourse(input: CourseJoinAccessCheckInput): Promise<void> {
    const baseUrl = this.configService.get<string>(
      'liveClass.courseServiceBaseUrl',
      'http://localhost:8001'
    );
    const timeoutMs = this.configService.get<number>('liveClass.courseAccessTimeoutMs', 3000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/internal/v1/access/check-by-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
          ...(input.correlationId ? { 'X-Correlation-ID': input.correlationId } : {})
        },
        body: JSON.stringify({
          course_id: input.courseId,
          require_active_grant: true,
          require_enrollment: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new ApplicationValidationError(
          'Не удалось проверить доступ к курсу для входа в live-комнату.'
        );
      }

      const body = (await response.json()) as CourseAccessDecisionResponse;
      if (body.decision !== 'allow') {
        throw new ApplicationAccessDeniedError(
          'Нет активного доступа к курсу для входа в live-комнату.'
        );
      }
    } catch (error) {
      if (
        error instanceof ApplicationAccessDeniedError ||
        error instanceof ApplicationValidationError
      ) {
        throw error;
      }
      throw new ApplicationValidationError(
        'Не удалось проверить доступ к курсу для входа в live-комнату.'
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
