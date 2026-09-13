import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  email: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,20}$/, {
    message: 'Le pseudo doit contenir 3 à 20 caractères alphanumériques',
  })
  username: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;

  @IsString()
  fullName?: string;
}
