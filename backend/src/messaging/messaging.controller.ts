import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  @IsOptional() @IsEnum(MessageType) type?: MessageType;
  @IsString()  @MinLength(1)         content: string;
  @IsOptional() @IsString()          fileUrl?: string;
}

class CreateChannelDto {
  @IsString() @MinLength(1) name: string;
}

class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
}

// ── Tous les channels de l'utilisateur (agrégation) ──────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('channels')
export class AllChannelsController {
  constructor(private messaging: MessagingService) {}

  @Get()
  listAll(@CurrentUser() user: any) {
    return this.messaging.listAllChannels(user.userId);
  }

  @Get('users/search')
  searchUsers(@CurrentUser() user: any, @Query('q') q: string) {
    return this.messaging.searchUsers(q ?? '', user.userId);
  }
}

// ── Channels d'un projet ──────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, ProjectRolesGuard)
@Controller('projects/:projectId/channels')
export class ChannelsController {
  constructor(private messaging: MessagingService) {}

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get()
  listChannels(@Param('projectId') projectId: string) {
    return this.messaging.listChannels(projectId);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  createChannel(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateChannelDto,
  ) {
    return this.messaging.createChannel(projectId, user.userId, dto.name);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':channelId')
  updateChannel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.messaging.updateChannel(channelId, user.userId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':channelId')
  deleteChannel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: any,
  ) {
    return this.messaging.deleteChannel(channelId, user.userId);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER', 'READER')
  @Get('members')
  getMembers(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    return this.messaging.getProjectMembers(projectId, user.userId);
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

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Patch(':channelId/messages/:messageId')
  editMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
    @Body('content') content: string,
  ) {
    return this.messaging.editMessage(messageId, user.userId, content);
  }

  @Roles('OWNER', 'ADMIN', 'MEMBER')
  @Delete(':channelId/messages/:messageId')
  deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.messaging.deleteMessage(messageId, user.userId);
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

// ── Messages directs ──────────────────────────────────────────────────────────

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

  @Patch(':dmId/messages/:messageId')
  editDmMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
    @Body('content') content: string,
  ) {
    return this.messaging.editMessage(messageId, user.userId, content);
  }

  @Delete(':dmId/messages/:messageId')
  deleteDmMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.messaging.deleteMessage(messageId, user.userId);
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
