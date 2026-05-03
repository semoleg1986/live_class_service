export type CourseJoinAccessCheckInput = {
  courseId: string;
  actorAccountId: string;
  actorRoles: string[];
  accessToken: string;
};

export interface CourseAccessCheckerPort {
  ensureCanJoinCourse(input: CourseJoinAccessCheckInput): Promise<void>;
}
