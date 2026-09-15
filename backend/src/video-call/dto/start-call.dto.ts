import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class StartCallDto {
  @IsOptional()
  @IsString()
  title?: string;

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
