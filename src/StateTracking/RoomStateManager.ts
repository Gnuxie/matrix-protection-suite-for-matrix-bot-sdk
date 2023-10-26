/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  MatrixRoomID,
  ActionResult,
  StringRoomID,
  InternedInstanceFactory,
  isError,
  StandardRoomStateRevisionIssuer,
  Ok,
  StateEvent,
  ActionError,
  ActionExceptionKind,
  Logger,
  MultipleErrors,
} from 'matrix-protection-suite';
import {
  RoomStateManager,
  RoomStateRevisionIssuer,
} from 'matrix-protection-suite/dist/StateTracking/StateRevisionIssuer';
import { StateTrackingMeta } from 'matrix-protection-suite/dist/StateTracking/StateTrackingMeta';
import { MatrixSendClient } from '../MatrixEmitter';

const log = new Logger('BotSDKRoomStateManager');

export class BotSDKRoomStateManager implements RoomStateManager {
  private readonly roomStateIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomStateRevisionIssuer,
    [MatrixRoomID]
  >;

  public constructor(
    public readonly trackingMeta: StateTrackingMeta,
    private readonly client: MatrixSendClient
  ) {
    this.roomStateIssuers = new InternedInstanceFactory(
      async (_roomID, room) => {
        const stateResult = await this.getRoomState(room, this.trackingMeta);
        if (isError(stateResult)) {
          return stateResult;
        }
        return Ok(
          new StandardRoomStateRevisionIssuer(room, this, this.trackingMeta)
        );
      }
    );
  }

  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    return await this.roomStateIssuers.getInstance(
      room.toRoomIdOrAlias(),
      room
    );
  }

  public async getRoomState(
    room: MatrixRoomID,
    trackingMeta: StateTrackingMeta
  ): Promise<ActionResult<StateEvent[]>> {
    const decodeResults = await this.client
      .getRoomState(room.toRoomIdOrAlias())
      .then(
        (events) =>
          Ok(events.map((event) => trackingMeta.decodeStateEvent(event))),
        (exception: unknown) =>
          ActionError.Result(
            `Could not fetch the room state for the room ${room.toPermalink()}.`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
    if (isError(decodeResults)) {
      return decodeResults;
    }
    const errors: ActionError[] = [];
    const events: StateEvent[] = [];
    for (const result of decodeResults.ok) {
      if (isError(result)) {
        errors.push(result.error);
      } else {
        events.push(result.ok);
      }
    }
    log.error(
      `There were multiple errors while decoding state events for ${room.toPermalink()}`,
      MultipleErrors.Result(
        `Unable to decode state events in ${room.toPermalink()}`,
        { errors }
      )
    );
    return Ok(events);
  }
}
