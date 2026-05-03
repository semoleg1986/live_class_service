import { Injectable } from '@nestjs/common';

import { CourseAccessCheckerPort } from '../../application/ports/course-access-checker.port';

@Injectable()
export class InMemoryCourseAccessChecker implements CourseAccessCheckerPort {
  async ensureCanJoinCourse(): Promise<void> {
    return undefined;
  }
}
