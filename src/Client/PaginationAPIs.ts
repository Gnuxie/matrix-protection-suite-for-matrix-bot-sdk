import {
  EventDecoder,
  RoomEventRelationsOptions,
  ActionResult,
  Value,
  isError,
  RoomEvent,
  Ok,
  ActionException,
  ActionExceptionKind,
  PaginatedResponse,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import {
  StringEventID,
  StringRoomID,
} from '@the-draupnir-project/matrix-basic-types';

export async function getRelationsForEvent<ChunkItem>(
  client: MatrixSendClient,
  decoder: EventDecoder,
  roomID: StringRoomID,
  eventID: StringEventID,
  options: RoomEventRelationsOptions<ChunkItem>
): Promise<ActionResult<PaginatedResponse<ChunkItem>>> {
  let url = `/_matrix/client/v1/rooms/${encodeURIComponent(
    roomID
  )}/relations/${encodeURIComponent(eventID)}`;
  if (options.relationType) {
    url += `/${options.relationType}`;
  }
  if (options.eventType) {
    url += `/${options.eventType}`;
  }

  const errorContext = `relations for event ${eventID} in room ${roomID}`;
  return await client
    .doRequest('GET', url, {
      dir: options.direction === 'forwards' ? 'f' : 'b',
      // for some reason the bot-sdk treats undefined properties like { from: undefined } as &from=
      ...(options.from !== undefined ? { from: options.from } : {}),
      ...(options.itemLimitPerPage !== undefined
        ? { limit: options.itemLimitPerPage }
        : {}),
      ...(options.to !== undefined ? { to: options.to } : {}),
    })
    .then(
      (rawChunk) => {
        const chunkResult = Value.Decode(PaginatedResponse, rawChunk);
        if (isError(chunkResult)) {
          return chunkResult.elaborate(
            `Could not decode the chunk response while getting ${errorContext}`
          );
        }
        const chunkies: RoomEvent[] = [];
        for (const item of chunkResult.ok.chunk) {
          const decodeResult = decoder.decodeEvent(item);
          if (isError(decodeResult)) {
            return decodeResult.elaborate(
              `Was unexpectadly unable to decode an event while getting relations`
            );
          }
          chunkies.push(decodeResult.ok);
        }
        return Ok({
          next_batch: chunkResult.ok.next_batch,
          prev_batch: chunkResult.ok.prev_batch,
          chunk: chunkies,
        } as PaginatedResponse<ChunkItem>);
      },
      (exception: unknown) =>
        ActionException.Result(`Could not request ${errorContext}`, {
          exception,
          exceptionKind: ActionExceptionKind.Unknown,
        })
    );
}
