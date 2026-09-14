import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@prisma/client';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  /** Assignation multiple — liste d'IDs d'utilisateurs */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}
