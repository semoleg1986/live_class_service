import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class KickFromRoomDto {
  @IsString()
  participantAccountId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
