import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { LOJA_DE_RECOMPENSAS } from '@gastemenos/shared';

const CODIGOS = LOJA_DE_RECOMPENSAS.map((item) => item.code);

export class ComprarRecompensaDto {
  @ApiProperty({ enum: CODIGOS, example: CODIGOS[0] })
  @IsString()
  // A lista sai do catálogo, não de uma constante repetida: item que não existe
  // no código não pode ser comprado nem por engano.
  @IsIn(CODIGOS, { message: 'Esse item não existe na loja.' })
  code!: string;
}
