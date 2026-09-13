import { IsPhoneNumber, IsString } from 'class-validator';

export class SendOtpDto {
  /**
   * Numéro de téléphone au format international (ex. +229XXXXXXXX).
   * IsPhoneNumber(null) accepte tous les indicatifs pays.
   */
  @IsPhoneNumber(undefined, { message: 'Numéro de téléphone invalide (format international requis, ex. +229...)' })
  phone: string;
}
