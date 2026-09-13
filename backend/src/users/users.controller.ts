import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService, UpdateProfileDto } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  /** Recherche d'utilisateurs par pseudo (accès authentifié) */
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('q') q: string) {
    return this.usersService.searchByUsername(q ?? '');
  }

  /** Profil de l'utilisateur courant */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.usersService.findById(user.userId);
  }

  /** Mise à jour du profil de l'utilisateur courant */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  /** Heatmap d'activité de l'utilisateur courant */
  @UseGuards(JwtAuthGuard)
  @Get('me/heatmap')
  myHeatmap(@CurrentUser() user: any) {
    return this.usersService.getActivityHeatmap(user.userId);
  }

  /** Profil public d'un utilisateur par username */
  @Get('profile/:username')
  publicProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfile(username);
  }

  /** Profil par ID (accès authentifié) */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
