import { Type } from '@sinclair/typebox';
import { EDStatic } from 'matrix-protection-suite';

export type UserRedactionResponse = EDStatic<typeof UserRedactionResponse>;
export const UserRedactionResponse = Type.Object({
  redact_id: Type.String({ description: 'An opaque ID for the redaction.' }),
});

export type UserRedactionStatusResponse = EDStatic<
  typeof UserRedactionStatusResponse
>;
export const UserRedactionStatusResponse = Type.Object({
  status: Type.Union(
    [
      Type.Literal('scheduled'),
      Type.Literal('active'),
      Type.Literal('completed'),
      Type.Literal('failed'),
    ],
    { description: 'Status of the redaction job.' }
  ),

  failed_redactions: Type.Record(
    Type.String({ description: 'Event ID that failed redaction.' }),
    Type.String({
      description: 'Error message explaining why redaction failed.',
    })
  ),
});
