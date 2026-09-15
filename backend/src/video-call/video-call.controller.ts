import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VideoCallService } from './video-call.service';
import { StartCallDto } from './dto/start-call.dto';
import { ScheduleCallDto } from './dto/schedule-call.dto';

@UseGuards(JwtAuthGuard)
@Controller('video-calls')
export class VideoCallController {
  constructor(private readonly videoCallService: VideoCallService) {}

  /** POST /video-calls/start — Lancer un appel immédiat */
  @Post('start')
  startCall(
    @CurrentUser() user: { userId: string },
    @Body() dto: StartCallDto,
  ) {
    if (!dto.channelId && !dto.dmId) {
      throw new BadRequestException('channelId ou dmId est requis');
    }
    return this.videoCallService.startCall(user.userId, {
      title: dto.title,
      channelId: dto.channelId,
      dmId: dto.dmId,
      participantIds: dto.participantIds,
    });
  }

  /** POST /video-calls/schedule — Planifier un appel */
  @Post('schedule')
  scheduleCall(
    @CurrentUser() user: { userId: string },
    @Body() dto: ScheduleCallDto,
  ) {
    if (!dto.channelId && !dto.dmId) {
      throw new BadRequestException('channelId ou dmId est requis');
    }
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('La date planifiée doit être dans le futur');
    }
    return this.videoCallService.scheduleCall(user.userId, {
      title: dto.title,
      scheduledAt,
      channelId: dto.channelId,
      dmId: dto.dmId,
      participantIds: dto.participantIds,
    });
  }

  /** DELETE /video-calls/:id — Terminer un appel */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  endCall(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.videoCallService.endCall(id, user.userId);
  }

  /** DELETE /video-calls/:id/cancel — Annuler un appel planifié */
  @Delete(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelCall(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.videoCallService.cancelCall(id, user.userId);
  }

  /** GET /video-calls?channelId=&dmId= — Lister les appels actifs/planifiés */
  @Get()
  listForRoom(
    @Query('channelId') channelId?: string,
    @Query('dmId') dmId?: string,
  ) {
    return this.videoCallService.listForRoom(channelId, dmId);
  }

  /** GET /video-calls/:id — Détail d'un appel */
  @Get(':id')
  getCall(@Param('id') id: string) {
    return this.videoCallService.getCall(id);
  }
}
