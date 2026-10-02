import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const REGRA_DA_SENHA = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const MENSAGEM_DA_SENHA = 'A senha precisa de 8 caracteres, um número e uma letra maiúscula.';

/**
 * As 5 perguntas do primeiro uso (tela PerfilConsumo).
 *
 * Os valores são códigos curtos, não as frases: a frase muda quando o texto da
 * tela melhora, e não queremos migrar o banco por causa de uma vírgula.
 */
export class PerfilDeConsumoDto {
  @ApiProperty({ enum: ['1', '2', '3', '5'], description: 'Pessoas na casa' })
  @IsIn(['1', '2', '3', '5'])
  householdSize!: string;

  @ApiProperty({ example: ['super', 'atac'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Escolha pelo menos um lugar onde você compra.' })
  @IsIn(['super', 'atac', 'bairro', 'feira', 'app'], { each: true })
  storeTypes!: string[];

  @ApiProperty({ enum: ['sem', 'quin', 'mes', 'falta'] })
  @IsIn(['sem', 'quin', 'mes', 'falta'])
  frequency!: string;

  @ApiProperty({ enum: ['a', 'b', 'c', 'd'], description: 'Faixa de gasto mensal' })
  @IsIn(['a', 'b', 'c', 'd'])
  monthlySpendBand!: string;

  @ApiProperty({ example: ['preco', 'promo'], description: 'Até 3' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Escolha pelo menos uma prioridade.' })
  @ArrayMaxSize(3, { message: 'Escolha no máximo 3.' })
  @IsIn(['preco', 'promo', 'marca', 'saude', 'perto'], { each: true })
  priorities!: string[];
}


export class AtualizarDadosDto {
  @ApiPropertyOptional({ example: 'Camila Alves' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    example: 'Camila A.',
    description: 'O nome que aparece no ranking para outras pessoas.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  rankingName?: string;

  @ApiPropertyOptional({ example: '(61) 90000-0000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: '70750-505' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  cep?: string;

  // O CPF saiu daqui: ele tem finalidade própria (recompensa por pessoa),
  // validação de dígito, unicidade e consentimento registrado, e nada disso
  // cabia num campo opcional de "atualizar meus dados". Agora é
  // `PUT /me/cpf` — ver VincularCpfDto.
}

export class TrocarSenhaDto {
  @ApiProperty({ description: 'Vazio quando a conta ainda não tem senha (entrou com Google).' })
  @IsString()
  current!: string;

  @ApiProperty()
  @Matches(REGRA_DA_SENHA, { message: MENSAGEM_DA_SENHA })
  next!: string;
}

export class TrocarEmailDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  newEmail!: string;
}

export class ConfirmarEmailNovoDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'O código tem 6 números.' })
  code!: string;
}

export class PausarContaDto {
  @ApiPropertyOptional({
    description: 'Até quando pausar. Sem data, a pausa fica até a pessoa reativar.',
    example: '2026-12-24T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Data inválida.' })
  until?: string;
}

export class EncerrarContaDto {
  @ApiProperty({
    example: 'ENCERRAR',
    description: 'Confirmação escrita: ação destrutiva pede um ato deliberado.',
  })
  @IsString()
  @IsNotEmpty()
  confirm!: string;

  @ApiPropertyOptional({ description: 'Opcional. Ajuda a entender por que as pessoas saem.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * CPF para a recompensa.
 *
 * A validação de dígito mora em `@gastemenos/shared` e é chamada no serviço: o
 * DTO barra o formato, o serviço barra o número impossível, e a mensagem é a
 * mesma dos dois lados.
 */
export class VincularCpfDto {
  @ApiProperty({ example: '529.982.247-25' })
  @IsString()
  @MaxLength(14)
  cpf!: string;
}
