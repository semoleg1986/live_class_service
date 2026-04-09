import { IsInt, IsOptional, Min } from 'class-validator';

export class LeaveRoomDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
