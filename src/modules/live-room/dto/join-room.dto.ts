import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class JoinRoomDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
