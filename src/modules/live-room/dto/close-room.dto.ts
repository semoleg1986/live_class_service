import { IsInt, IsOptional, Min } from 'class-validator';

export class CloseRoomDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
