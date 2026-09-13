import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MessageType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRolesGuard } from '../common/guards/project-roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagingService } from './messaging.service';

class SendMessageDto {
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}

// ── Channels projet ─────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/channels')
export class ChannelsController {
  constructor(private messaging: MessagingService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  listChannels(@Param('projectId') projectId: string) {
    return this.messaging.listChannels(projectId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get(':channelId/messages')
  getMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.messaging.getChannelMessages(channelId, user.userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      before,
    });
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post(':channelId/messages')
  sendMessage(
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendToChannel(channelId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get(':channelId/messages/search')
  searchMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
    @Query('q') q: string,
  ) {
    return this.messaging.searchChannelMessages(channelId, user.userId, q ?? '');
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Post(':channelId/messages/:messageId/reactions')
  toggleReaction(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
    @Body('emoji') emoji: string,
  ) {
    return this.messaging.toggleReaction(messageId, user.userId, emoji);
  }
}

// ── Messages directs ─────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DirectMessagesController {
  constructor(private messaging: MessagingService) {}

  @Get()
  listDms(@CurrentUser() user: any) {
    return this.messaging.listDms(user.userId);
  }

  @Post(':userId')
  getOrCreateDm(@Param('userId') targetUserId: string, @CurrentUser() user: any) {
    return this.messaging.getOrCreateDm(user.userId, targetUserId);
  }

  @Get(':dmId/messages')
  getDmMessages(
    @Param('dmId') dmId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    return this.messaging.getDmMessages(dmId, user.userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':dmId/messages')
  sendDm(
    @Param('dmId') dmId: string,
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendDm(dmId, user.userId, dto);
  }

  @Post(':dmId/read')
  markRead(@Param('dmId') dmId: string, @CurrentUser() user: any) {
    return this.messaging.markMessagesRead(dmId, user.userId, false);
  }

  @Post(':dmId/messages/:messageId/reactions')
  toggleReaction(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
    @Body('emoji') emoji: string,
  ) {
    return this.messaging.toggleReaction(messageId, user.userId, emoji);
  }
}
