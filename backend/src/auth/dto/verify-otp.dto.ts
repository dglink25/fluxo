import { IsPhoneNumber, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, { message: 'Numéro de téléphone invalide' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'Le code doit contenir exactement 6 chiffres' })
  code: string;
}
