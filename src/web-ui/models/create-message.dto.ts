import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Data transfer object for adding a message to a session.
 */
export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  readonly content!: string;
}
