import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CriarParceiroDto {
  @ApiProperty({ example: 'Supermercado Vila Nova' })
  @IsString()
  @Length(2, 120, { message: 'O nome do parceiro precisa ter entre 2 e 120 caracteres.' })
  name!: string;

  @ApiPropertyOptional({ description: 'Só números', example: '12345678000199' })
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'O CNPJ precisa ter 14 números, sem pontuação.' })
  cnpj?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CriarOfertaDto {
  @ApiProperty({ example: 'Café torrado 500 g por R$ 17,98' })
  @IsString()
  @Length(3, 140, { message: 'O título precisa ter entre 3 e 140 caracteres.' })
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 400)
  description?: string;

  /**
   * Com parceiro, a oferta é patrocinada — o serviço decide, não o cliente.
   * Não existe campo `sponsored` aqui de propósito: seria a porta para
   * cadastrar anúncio pago sem selo.
   */
  @ApiPropertyOptional({ description: 'Parceiro que pagou pela oferta' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Em centavos', example: 1798 })
  @IsOptional()
  @IsInt({ message: 'O preço vai em centavos, sem vírgula.' })
  @Min(0)
  priceCents?: number;

  @ApiProperty({ description: 'Geohashes de 5 caracteres onde a oferta aparece' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe ao menos uma região.' })
  @ArrayMaxSize(50)
  @Matches(/^[0-9b-hjkmnp-z]{5}$/, {
    each: true,
    message: 'Cada região é um geohash de 5 caracteres.',
  })
  geohashes!: string[];

  @ApiProperty({ example: '2026-09-25T00:00:00.000Z' })
  @IsISO8601({}, { message: 'Data de início inválida.' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-02T23:59:59.000Z' })
  @IsISO8601({}, { message: 'Data de fim inválida.' })
  endsAt!: string;
}

export class EditarOfertaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 140)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 400)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: 'Em centavos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[0-9b-hjkmnp-z]{5}$/, { each: true })
  geohashes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
