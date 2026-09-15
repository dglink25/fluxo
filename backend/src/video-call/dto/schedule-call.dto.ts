import { IsString, IsOptional, IsArray, IsUUID, IsDateString } from 'class-validator';

export class ScheduleCallDto {
  @IsString()
  title: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsOptional()
  @IsUUID()
  dmId?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  participantIds: string[];
}
