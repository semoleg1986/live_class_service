import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  courseId!: string;

  @IsString()
  lessonId!: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(50)
  participantsLimit?: number;
}
